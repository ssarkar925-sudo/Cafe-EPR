-- Atomic invoice edit workflow.
-- The selected invoice is never hard-deleted or overwritten. Its financial effects are
-- reversed inside the same transaction, it is marked cancelled for audit, and a corrected
-- invoice is created through the canonical create_sale RPC and linked with edited_from.

alter table public.invoices
  add column if not exists edited_from uuid references public.invoices(id) on delete set null;

create index if not exists idx_invoices_edited_from on public.invoices(edited_from);

drop function if exists public.edit_invoice(uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text);

drop function if exists public.edit_invoice(uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric);

create or replace function public.edit_invoice(
  p_invoice_id uuid,
  p_customer_id uuid,
  p_invoice_date date,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_payments jsonb,
  p_items jsonb,
  p_reason text default '',
  p_place_of_supply text default null,
  p_supply_type text default 'intra_state',
  p_customer_gstin text default null,
  p_b2b_or_b2c text default 'B2C_SMALL',
  p_total_taxable_value numeric default null,
  p_total_cgst numeric default 0,
  p_total_sgst numeric default 0,
  p_total_igst numeric default 0,
  p_is_reverse_charge boolean default false,
  p_advance_used numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.invoices%rowtype;
  v_item record;
  v_payment jsonb;
  v_cash record;
  v_ledger_net numeric := 0;
  v_old_payment_total numeric := 0;
  v_new_id uuid;
  v_new jsonb;
  v_new_number text;
  v_calc_subtotal numeric := 0;
  v_new_total numeric := 0;
  v_stock numeric;
  v_qty numeric;
  v_old_qty numeric;
  v_old_returned_qty numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Invoice must contain at least one item';
  end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'Payments must be an array';
  end if;
  if p_discount is null or p_discount < 0 then
    raise exception 'Invalid discount';
  end if;
  if p_advance_used is null or p_advance_used < 0 then
    raise exception 'Invalid advance amount';
  end if;

  select * into v_old
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;
  if v_old.status in ('cancelled', 'returned') then
    raise exception 'Invoice already cancelled or returned';
  end if;
  if coalesce(v_old.refunded, 0) > 0 then
    raise exception 'Refunded invoices cannot be edited; use the return/refund workflow';
  end if;

  -- A returned line has already restored stock and changed the financial state. Do not
  -- attempt to mix return accounting with invoice editing.
  if exists (
    select 1
    from public.invoice_items ii
    where ii.invoice_id = p_invoice_id
      and coalesce(ii.returned_qty, 0) > 0
  ) or coalesce(v_old.returned, 0) > 0 then
    raise exception 'Invoices containing returned items cannot be edited; use the return workflow';
  end if;

  -- Recalculate the invoice subtotal/total from the submitted line amounts. Client totals
  -- are never trusted for the accounting record.
  select coalesce(sum(round(coalesce((item->>'amount')::numeric, 0), 2)), 0)
    into v_calc_subtotal
  from jsonb_array_elements(p_items) item;

  if p_discount > v_calc_subtotal then
    raise exception 'Discount cannot exceed subtotal';
  end if;

  v_new_total := round(v_calc_subtotal - p_discount, 2);

  -- The payment rows on the old invoice are copied to the replacement invoice. Any excess
  -- of invoices.paid over those rows is an advance application and must be explicitly carried
  -- forward to the same customer; the UI blocks moving such an invoice to another customer.
  select coalesce(sum(round(coalesce((payment->>'amount')::numeric, 0), 2)), 0)
    into v_old_payment_total
  from jsonb_array_elements(p_payments) payment;

  if abs((coalesce(v_old.paid, 0) - v_old_payment_total) - p_advance_used) > 0.005 then
    raise exception 'Payment/advance preservation mismatch; invoice edit aborted';
  end if;

  if v_old_payment_total + p_advance_used > v_new_total + 0.005 then
    raise exception 'Corrected invoice total cannot be lower than the amount already collected';
  end if;

  -- Restore stock from the original sale before checking the corrected quantities.
  -- Returned invoices were rejected above, so every original quantity is still on hand in
  -- the product balance as a result of this sale and can be restored exactly once.
  for v_item in
    select ii.product_id, ii.qty
    from public.invoice_items ii
    where ii.invoice_id = p_invoice_id
      and ii.product_id is not null
  loop
    update public.products
       set stock_qty = coalesce(stock_qty, 0) + coalesce(v_item.qty, 0),
           updated_at = now()
     where id = v_item.product_id;
  end loop;

  -- Verify corrected product quantities against the restored stock before create_sale runs.
  for v_item in
    select
      nullif(item->>'product_id', '')::uuid as product_id,
      coalesce((item->>'qty')::numeric, 0) as qty
    from jsonb_array_elements(p_items) item
    where nullif(item->>'product_id', '') is not null
  loop
    if v_item.qty <= 0 then
      raise exception 'Product quantity must be greater than zero';
    end if;
    select stock_qty into v_stock from public.products where id = v_item.product_id for update;
    if v_stock is null then
      raise exception 'Product not found';
    end if;
    if v_stock < v_item.qty then
      raise exception 'Insufficient stock for corrected invoice (have %, need %)', v_stock, v_item.qty;
    end if;
  end loop;

  -- Reverse every invoice cash entry. This covers sale collections and any previous-due
  -- collection attached to the original invoice without creating a duplicate revenue entry.
  for v_cash in
    select *
    from public.cash_entries
    where ref_type = 'invoice'
      and ref_id = p_invoice_id
  loop
    insert into public.cash_entries (
      entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id
    ) values (
      v_cash.entry_date,
      v_cash.method,
      case when v_cash.direction = 'in' then 'out' else 'in' end,
      v_cash.amount,
      'Edit reversal of ' || v_old.invoice_number,
      'invoice',
      p_invoice_id,
      v_cash.instrument_id
    );
  end loop;

  -- Reverse the net customer-ledger effect of the old invoice. This is deliberately derived
  -- from the existing ledger rows instead of assuming a particular payment path.
  if v_old.customer_id is not null then
    select coalesce(sum(coalesce(debit, 0) - coalesce(credit, 0)), 0)
      into v_ledger_net
    from public.customer_ledger
    where ref_id = p_invoice_id;

    if v_ledger_net <> 0 then
      update public.customers
         set balance = balance - v_ledger_net,
             updated_at = now()
       where id = v_old.customer_id;

      insert into public.customer_ledger (
        customer_id, entry_date, type, description, debit, credit, balance_after, ref_id
      ) values (
        v_old.customer_id,
        v_old.invoice_date,
        'adjustment',
        'Edit reversal of ' || v_old.invoice_number,
        case when v_ledger_net < 0 then -v_ledger_net else null end,
        case when v_ledger_net > 0 then v_ledger_net else null end,
        (select balance from public.customers where id = v_old.customer_id),
        p_invoice_id
      );
    end if;
  end if;

  -- Preserve the original invoice as an audit record. Its original totals/payments remain
  -- queryable; only its status changes so it no longer contributes to active sales totals.
  update public.invoices
     set status = 'cancelled'
   where id = p_invoice_id;

  -- Create the corrected invoice through the canonical sale engine. PostgreSQL executes the
  -- whole function in one transaction, so any failure below rolls back the reversal above.
  select public.create_sale(
    p_customer_id => p_customer_id,
    p_invoice_date => p_invoice_date,
    p_subtotal => v_calc_subtotal,
    p_discount => p_discount,
    p_total => v_new_total,
    p_payments => p_payments,
    p_items => p_items,
    p_previous_due => 0,
    p_previous_due_method => 'cash',
    p_previous_due_instrument_id => null,
    p_advance_used => p_advance_used,
    p_place_of_supply => p_place_of_supply,
    p_supply_type => coalesce(p_supply_type, 'intra_state'),
    p_customer_gstin => p_customer_gstin,
    p_b2b_or_b2c => coalesce(p_b2b_or_b2c, 'B2C_SMALL'),
    p_total_taxable_value => p_total_taxable_value,
    p_total_cgst => coalesce(p_total_cgst, 0),
    p_total_sgst => coalesce(p_total_sgst, 0),
    p_total_igst => coalesce(p_total_igst, 0),
    p_is_reverse_charge => coalesce(p_is_reverse_charge, false)
  ) into v_new;

  v_new_id := (v_new->>'id')::uuid;
  v_new_number := v_new->>'invoice_number';

  update public.invoices
     set edited_from = p_invoice_id
   where id = v_new_id;

  insert into public.audit_logs (
    user_id, user_name, action, entity, entity_id, description, details
  ) values (
    auth.uid(), null, 'invoice_edited', 'invoices', v_new_id::text,
    'Edited ' || v_old.invoice_number || ' -> ' || v_new_number || coalesce(' | ' || nullif(p_reason, ''), ''),
    jsonb_build_object(
      'old_invoice_id', p_invoice_id,
      'old_invoice_number', v_old.invoice_number,
      'new_invoice_id', v_new_id,
      'new_invoice_number', v_new_number,
      'old_total', v_old.total,
      'new_total', v_new_total,
      'old_customer_id', v_old.customer_id,
      'new_customer_id', p_customer_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'old_invoice_id', p_invoice_id,
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

revoke all on function public.edit_invoice(uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric) from public, anon;
grant execute on function public.edit_invoice(uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric) to authenticated;
