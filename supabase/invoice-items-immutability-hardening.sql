-- ==============================================================================
-- INVOICE ITEMS GST TAX SNAPSHOT IMMUTABILITY HARDENING
-- ==============================================================================

create or replace function public.check_posted_invoice_item_tax_immutability()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_parent_status text;
begin
  -- Fetch the parent invoice status
  select status into v_parent_status
  from public.invoices
  where id = old.invoice_id;

  -- If parent invoice is completed or paid, block direct mutation of frozen tax fields
  if v_parent_status in ('completed', 'paid') then
    if (new.invoice_id is distinct from old.invoice_id) or
       (new.hsn_sac is distinct from old.hsn_sac) or
       (new.taxable_value is distinct from old.taxable_value) or
       (new.gst_rate is distinct from old.gst_rate) or
       (new.cgst_rate is distinct from old.cgst_rate) or
       (new.cgst_amount is distinct from old.cgst_amount) or
       (new.sgst_rate is distinct from old.sgst_rate) or
       (new.sgst_amount is distinct from old.sgst_amount) or
       (new.igst_rate is distinct from old.igst_rate) or
       (new.igst_amount is distinct from old.igst_amount) or
       (new.tax_treatment is distinct from old.tax_treatment) then
      raise exception 'CANNOT_MUTATE_POSTED_TAX_LINE: Tax snapshot on completed/paid invoice items is immutable. Use Credit Note, Debit Note, or formal adjustment.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_posted_invoice_item_tax_mutation on public.invoice_items;
create trigger trg_prevent_posted_invoice_item_tax_mutation
  before update on public.invoice_items
  for each row execute function public.check_posted_invoice_item_tax_immutability();

