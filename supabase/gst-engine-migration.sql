-- ==============================================================================
-- GST COMPLIANCE & TAX ENGINE MIGRATION
-- Additive Schema, Immutability Triggers, and Statutory GST Reporting
-- ==============================================================================

-- 1. MASTER CATALOG EXTENSIONS
alter table public.products add column if not exists hsn_code text default null;
alter table public.products add column if not exists gst_rate numeric not null default 0.00;

alter table public.services add column if not exists sac_code text default null;
alter table public.services add column if not exists gst_rate numeric not null default 0.00;

alter table public.customers add column if not exists gstin text default null;
alter table public.customers add column if not exists state_code text default null;

-- 2. INVOICE LINE ITEMS EXTENSIONS (FROZEN TAX SNAPSHOT)
alter table public.invoice_items add column if not exists hsn_sac text default null;
alter table public.invoice_items add column if not exists taxable_value numeric not null default 0.00;
alter table public.invoice_items add column if not exists gst_rate numeric not null default 0.00;
alter table public.invoice_items add column if not exists cgst_rate numeric not null default 0.00;
alter table public.invoice_items add column if not exists cgst_amount numeric not null default 0.00;
alter table public.invoice_items add column if not exists sgst_rate numeric not null default 0.00;
alter table public.invoice_items add column if not exists sgst_amount numeric not null default 0.00;
alter table public.invoice_items add column if not exists igst_rate numeric not null default 0.00;
alter table public.invoice_items add column if not exists igst_amount numeric not null default 0.00;
alter table public.invoice_items add column if not exists tax_treatment text not null default 'non_gst';

-- 3. INVOICE HEADER EXTENSIONS (FROZEN TAX HEADER SNAPSHOT)
alter table public.invoices add column if not exists place_of_supply text default null;
alter table public.invoices add column if not exists supply_type text not null default 'intra_state';
alter table public.invoices add column if not exists customer_gstin text default null;
alter table public.invoices add column if not exists b2b_or_b2c text not null default 'B2C_SMALL';
alter table public.invoices add column if not exists total_taxable_value numeric not null default 0.00;
alter table public.invoices add column if not exists total_cgst numeric not null default 0.00;
alter table public.invoices add column if not exists total_sgst numeric not null default 0.00;
alter table public.invoices add column if not exists total_igst numeric not null default 0.00;
alter table public.invoices add column if not exists is_reverse_charge boolean not null default false;

-- 4. RETURNS / CREDIT NOTES EXTENSIONS
alter table public.returns add column if not exists credit_note_number text default null;
alter table public.returns add column if not exists taxable_value_reversed numeric not null default 0.00;
alter table public.returns add column if not exists cgst_reversed numeric not null default 0.00;
alter table public.returns add column if not exists sgst_reversed numeric not null default 0.00;
alter table public.returns add column if not exists igst_reversed numeric not null default 0.00;
alter table public.returns add column if not exists original_invoice_number text default null;
alter table public.returns add column if not exists original_invoice_date date default null;

-- 5. SAFE LEGACY INVOICES BACKFILL (NO RETROACTIVE GST INVENTION)
update public.invoices
set 
  total_taxable_value = total,
  total_cgst = 0.00,
  total_sgst = 0.00,
  total_igst = 0.00,
  b2b_or_b2c = 'B2C_SMALL',
  supply_type = 'intra_state'
where total_taxable_value = 0.00 and total > 0;

update public.invoice_items
set 
  taxable_value = amount,
  gst_rate = 0.00,
  cgst_rate = 0.00,
  cgst_amount = 0.00,
  sgst_rate = 0.00,
  sgst_amount = 0.00,
  igst_rate = 0.00,
  igst_amount = 0.00,
  tax_treatment = 'non_gst'
where taxable_value = 0.00 and amount > 0;

-- 6. DATABASE IMMUTABILITY TRIGGER FOR POSTED TAX RECORDS
create or replace function public.check_posted_invoice_tax_immutability()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- If invoice is already completed/paid, block modification of tax snapshot fields
  if old.status in ('completed', 'paid') and new.status in ('completed', 'paid') then
    if (new.total_taxable_value is distinct from old.total_taxable_value) or
       (new.total_cgst is distinct from old.total_cgst) or
       (new.total_sgst is distinct from old.total_sgst) or
       (new.total_igst is distinct from old.total_igst) or
       (new.customer_gstin is distinct from old.customer_gstin) or
       (new.place_of_supply is distinct from old.place_of_supply) or
       (new.supply_type is distinct from old.supply_type) or
       (new.b2b_or_b2c is distinct from old.b2b_or_b2c) then
      raise exception 'CANNOT_MUTATE_POSTED_TAX_INVOICE: Tax snapshot on completed/paid invoices is immutable. Use Credit/Debit Note for adjustments.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_posted_invoice_tax_mutation on public.invoices;
create trigger trg_prevent_posted_invoice_tax_mutation
  before update on public.invoices
  for each row execute function public.check_posted_invoice_tax_immutability();

-- 7. STATUTORY GST REPORTING RPC
create or replace function public.get_gst_report(
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_b2b_supplies jsonb;
  v_b2c_supplies jsonb;
  v_credit_notes jsonb;
  v_hsn_summary jsonb;
  
  v_total_taxable numeric := 0;
  v_total_cgst numeric := 0;
  v_total_sgst numeric := 0;
  v_total_igst numeric := 0;
  v_total_tax numeric := 0;
  v_total_invoice_value numeric := 0;
  
  v_cn_taxable numeric := 0;
  v_cn_tax numeric := 0;
begin
  if auth.role() <> 'service_role' and current_user <> 'postgres' then
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not public.is_back_office() then raise exception 'Forbidden'; end if;
  end if;

  -- 1. B2B SUPPLIES (GSTR-1 Table 4A)
  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_b2b_supplies
  from (
    select 
      inv.id,
      inv.invoice_number,
      inv.invoice_date,
      inv.customer_gstin,
      c.name as customer_name,
      coalesce(inv.place_of_supply, 'Unspecified') as place_of_supply,
      inv.supply_type,
      inv.total_taxable_value,
      inv.total_cgst,
      inv.total_sgst,
      inv.total_igst,
      (inv.total_cgst + inv.total_sgst + inv.total_igst) as total_tax,
      inv.total as invoice_value,
      inv.is_reverse_charge
    from public.invoices inv
    left join public.customers c on c.id = inv.customer_id
    where inv.invoice_date >= p_start_date and inv.invoice_date <= p_end_date
      and inv.status in ('completed', 'paid')
      and (inv.customer_gstin is not null and length(trim(inv.customer_gstin)) > 0)
    order by inv.invoice_date desc
  ) r;

  -- 2. B2C SUPPLIES (GSTR-1 Table 7 / Table 5A)
  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_b2c_supplies
  from (
    select 
      coalesce(inv.place_of_supply, 'Intra-State') as place_of_supply,
      inv.supply_type,
      ii.gst_rate,
      sum(ii.taxable_value) as taxable_value,
      sum(ii.cgst_amount) as total_cgst,
      sum(ii.sgst_amount) as total_sgst,
      sum(ii.igst_amount) as total_igst,
      sum(ii.cgst_amount + ii.sgst_amount + ii.igst_amount) as total_tax,
      count(distinct inv.id) as invoice_count
    from public.invoices inv
    join public.invoice_items ii on ii.invoice_id = inv.id
    where inv.invoice_date >= p_start_date and inv.invoice_date <= p_end_date
      and inv.status in ('completed', 'paid')
      and (inv.customer_gstin is null or length(trim(inv.customer_gstin)) = 0)
    group by coalesce(inv.place_of_supply, 'Intra-State'), inv.supply_type, ii.gst_rate
    order by ii.gst_rate desc
  ) r;

  -- 3. CREDIT NOTES (GSTR-1 Table 9B)
  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_credit_notes
  from (
    select 
      ret.id,
      coalesce(ret.credit_note_number, ret.return_number) as credit_note_number,
      ret.return_date as credit_note_date,
      inv.invoice_number as original_invoice_number,
      inv.invoice_date as original_invoice_date,
      inv.customer_gstin,
      c.name as customer_name,
      coalesce(ret.taxable_value_reversed, ret.subtotal) as taxable_value_reversed,
      ret.cgst_reversed,
      ret.sgst_reversed,
      ret.igst_reversed,
      (ret.cgst_reversed + ret.sgst_reversed + ret.igst_reversed) as total_tax_reversed,
      ret.refund as total_refund_amount
    from public.returns ret
    join public.invoices inv on inv.id = ret.invoice_id
    left join public.customers c on c.id = inv.customer_id
    where ret.return_date >= p_start_date and ret.return_date <= p_end_date
      and ret.status in ('completed', 'approved')
    order by ret.return_date desc
  ) r;

  -- 4. HSN / SAC SUMMARY (GSTR-1 Table 12)
  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_hsn_summary
  from (
    select 
      coalesce(nullif(ii.hsn_sac, ''), 'OTHER') as hsn_sac,
      coalesce(p.name, s.name, ii.description, 'Item') as description,
      coalesce(p.unit, 'NOS') as uqc,
      sum(ii.qty) as total_qty,
      sum(ii.taxable_value) as total_taxable_value,
      ii.gst_rate,
      sum(ii.cgst_amount) as total_cgst,
      sum(ii.sgst_amount) as total_sgst,
      sum(ii.igst_amount) as total_igst,
      sum(ii.cgst_amount + ii.sgst_amount + ii.igst_amount) as total_tax
    from public.invoice_items ii
    join public.invoices inv on inv.id = ii.invoice_id
    left join public.products p on p.id = ii.product_id
    left join public.services s on s.id = ii.service_id
    where inv.invoice_date >= p_start_date and inv.invoice_date <= p_end_date
      and inv.status in ('completed', 'paid')
    group by coalesce(nullif(ii.hsn_sac, ''), 'OTHER'), coalesce(p.name, s.name, ii.description, 'Item'), coalesce(p.unit, 'NOS'), ii.gst_rate
    order by total_taxable_value desc
  ) r;

  -- 5. TOTALS COMPUTATION
  select 
    coalesce(sum(total_taxable_value), 0),
    coalesce(sum(total_cgst), 0),
    coalesce(sum(total_sgst), 0),
    coalesce(sum(total_igst), 0),
    coalesce(sum(total), 0)
  into v_total_taxable, v_total_cgst, v_total_sgst, v_total_igst, v_total_invoice_value
  from public.invoices
  where invoice_date >= p_start_date and invoice_date <= p_end_date
    and status in ('completed', 'paid');

  select 
    coalesce(sum(coalesce(taxable_value_reversed, subtotal)), 0),
    coalesce(sum(cgst_reversed + sgst_reversed + igst_reversed), 0)
  into v_cn_taxable, v_cn_tax
  from public.returns
  where return_date >= p_start_date and return_date <= p_end_date
    and status in ('completed', 'approved');

  v_total_tax := v_total_cgst + v_total_sgst + v_total_igst;

  return jsonb_build_object(
    'period', jsonb_build_object('start_date', p_start_date, 'end_date', p_end_date),
    'summary', jsonb_build_object(
      'total_taxable_value', v_total_taxable,
      'total_cgst', v_total_cgst,
      'total_sgst', v_total_sgst,
      'total_igst', v_total_igst,
      'total_output_tax', v_total_tax,
      'total_invoice_value', v_total_invoice_value,
      'credit_notes_taxable_reversed', v_cn_taxable,
      'credit_notes_tax_reversed', v_cn_tax,
      'net_taxable_value', v_total_taxable - v_cn_taxable,
      'net_output_tax_liability', v_total_tax - v_cn_tax
    ),
    'b2b_supplies', v_b2b_supplies,
    'b2c_supplies', v_b2c_supplies,
    'credit_notes', v_credit_notes,
    'hsn_summary', v_hsn_summary
  );
end;
$$;

revoke all on function public.get_gst_report(date, date) from public, anon;
grant execute on function public.get_gst_report(date, date) to authenticated, service_role;

