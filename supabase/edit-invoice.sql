-- Run this in Supabase SQL Editor (idempotent), AFTER pos.sql has been applied.
-- Edit an invoice from POS: the original invoice is fully reversed (stock restocked,
-- cash entries reversed, customer balance/ledger reversed, original marked cancelled)
-- and a corrected invoice is created via create_sale. Fully audited; a new invoice
-- number is issued and linked via edited_from.

alter table public.invoices add column if not exists edited_from uuid references public.invoices (id) on delete set null;

create or replace function public.edit_invoice(
  p_invoice_id uuid,
  p_customer_id uuid,
  p_invoice_date date,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_payments jsonb,
  p_items jsonb,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_old record;
  v_item record;
  v_ce record;
  v_ledger_net numeric := 0;
  v_bal numeric;
  v_new jsonb;
  v_new_id uuid;
  v_new_number text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_old from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_old.status = 'cancelled' then raise exception 'Invoice already cancelled/edited'; end if;

  -- 1) Restock products from the original invoice.
  for v_item in select * from public.invoice_items where invoice_id = p_invoice_id
  loop
    if v_item.product_id is not null then
      update public.products set stock_qty = stock_qty + v_item.qty, updated_at = now()
      where id = v_item.product_id;
    end if;
  end loop;

  -- 2) Reverse every cash entry tied to the original invoice (sale payments + previous-due).
  for v_ce in
    select * from public.cash_entries where ref_type = 'invoice' and ref_id = p_invoice_id
  loop
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (
      v_ce.entry_date,
      v_ce.method,
      case when v_ce.direction = 'in' then 'out' else 'in' end,
      v_ce.amount,
      'Edit reversal of ' || v_old.invoice_number,
      'invoice',
      p_invoice_id,
      v_ce.instrument_id
    );
  end loop;

  -- 3) Reverse the customer balance effect (one aggregated, clearly labelled ledger entry).
  if v_old.customer_id is not null then
    select coalesce(sum(coalesce(debit, 0) - coalesce(credit, 0)), 0)
      into v_ledger_net
      from public.customer_ledger
      where ref_id = p_invoice_id;

    if v_ledger_net <> 0 then
      update public.customers set balance = balance - v_ledger_net, updated_at = now()
      where id = v_old.customer_id;
      select balance into v_bal from public.customers where id = v_old.customer_id;
      insert into public.customer_ledger (
        customer_id, entry_date, type, description,
        debit, credit, balance_after, ref_id
      ) values (
        v_old.customer_id, p_invoice_date, 'adjustment',
        'Edit reversal of ' || v_old.invoice_number,
        case when v_ledger_net > 0 then null else -v_ledger_net end,
        case when v_ledger_net > 0 then v_ledger_net else null end,
        v_bal, p_invoice_id
      );
    end if;
  end if;

  -- 4) Mark the original invoice cancelled (kept for audit; never hard-deleted).
  update public.invoices
  set status = 'cancelled',
      returned = total,
      returned_at = now()
  where id = p_invoice_id;

  -- 5) Create the corrected invoice via the existing sale logic (no re-collection of
  --    previous due / advance — those were already reversed above; only the new due applies).
  select public.create_sale(
    p_customer_id,
    p_invoice_date,
    p_subtotal,
    p_discount,
    p_total,
    p_payments,
    p_items,
    0,            -- p_previous_due
    'cash',       -- p_previous_due_method (unused; 0 amount)
    null,         -- p_previous_due_instrument_id
    0             -- p_advance_used
  ) into v_new;

  v_new_id := (v_new->>'id')::uuid;
  v_new_number := v_new->>'invoice_number';

  update public.invoices set edited_from = p_invoice_id where id = v_new_id;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'invoice_edited', 'invoices', v_new_id::text,
    'Edited ' || v_old.invoice_number || ' -> ' || v_new_number ||
    coalesce(' | ' || nullif(p_reason, ''), ''),
    jsonb_build_object('old_invoice_id', p_invoice_id, 'old_invoice_number', v_old.invoice_number,
                       'new_invoice_number', v_new_number, 'total', p_total)
  );

  return jsonb_build_object(
    'ok', true,
    'old_invoice_number', v_old.invoice_number,
    'id', v_new_id,
    'invoice_number', v_new_number,
    'customer_id', v_new->>'customer_id',
    'total', v_new->>'total',
    'paid', v_new->>'paid',
    'due', v_new->>'due',
    'status', v_new->>'status',
    'invoice_date', v_new->>'invoice_date'
  );
end;
$$;

revoke all on function public.edit_invoice(uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text) from public, anon;
grant execute on function public.edit_invoice(uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text) to authenticated;
