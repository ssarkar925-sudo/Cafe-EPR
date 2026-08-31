-- POS previous-due collection must be posted atomically with the sale.
-- The UI already supplies a separate previous-due method/instrument; this migration
-- makes that leg update customer balance, customer ledger and cashbook exactly once.

create or replace function public.apply_previous_due_collection(
  p_customer_id uuid,
  p_amount numeric,
  p_method text,
  p_instrument_id uuid,
  p_invoice_id uuid,
  p_invoice_number text,
  p_entry_date date,
  p_current_invoice_due numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_available_previous_due numeric;
  v_new_balance numeric;
  v_method text;
  v_inst_type text;
  v_ledger_id uuid;
begin
  if auth.uid() is null and auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Not authenticated';
  end if;
  if p_customer_id is null then raise exception 'Customer is required for previous due collection'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Previous due collection must be positive'; end if;

  v_method := lower(coalesce(nullif(btrim(p_method), ''), 'cash'));
  if p_instrument_id is not null then
    select type into v_inst_type
    from public.payment_instruments
    where id = p_instrument_id and is_active = true;
    if v_inst_type is null then raise exception 'Unknown or inactive payment instrument'; end if;
    v_method := case v_inst_type
      when 'cash' then 'cash'
      when 'upi' then 'upi'
      when 'bank' then 'bank'
      when 'wallet' then 'wallet'
      when 'debit_card' then 'debit_card'
      when 'credit_card' then 'credit_card'
      else null
    end;
    if v_method is null then raise exception 'Payment instrument type % cannot be used for customer due collection', v_inst_type; end if;
  elsif v_method <> 'cash' then
    raise exception 'A payment instrument is required for % due collection', v_method;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('erp:customer:' || p_customer_id::text, 0));
  select coalesce(balance, 0) into v_balance
  from public.customers
  where id = p_customer_id
  for update;
  if not found then raise exception 'Customer not found'; end if;

  -- create_sale_internal has already added the new invoice due to the balance.
  -- Only the balance that existed before this sale is collectible here.
  v_available_previous_due := greatest(0, v_balance - coalesce(p_current_invoice_due, 0));
  if v_available_previous_due <= 0 then raise exception 'Customer has no outstanding previous due to collect'; end if;
  if p_amount > v_available_previous_due + 0.005 then raise exception 'Previous due collection exceeds outstanding customer balance'; end if;

  v_new_balance := greatest(0, v_balance - p_amount);
  update public.customers set balance = v_new_balance, updated_at = now() where id = p_customer_id;

  insert into public.customer_ledger(customer_id, entry_date, type, description, debit, credit, balance_after, ref_id)
  values (
    p_customer_id,
    coalesce(p_entry_date, current_date),
    'payment',
    'Previous due collected on ' || coalesce(p_invoice_number, 'POS sale'),
    0,
    p_amount,
    v_new_balance,
    p_invoice_id
  )
  returning id into v_ledger_id;

  insert into public.cash_entries(entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
  values (
    coalesce(p_entry_date, current_date),
    v_method,
    'in',
    p_amount,
    'Previous due collected from customer on ' || coalesce(p_invoice_number, 'POS sale'),
    'customer_payment',
    v_ledger_id,
    p_instrument_id
  );

  return jsonb_build_object('ok', true, 'amount', p_amount, 'balance', v_new_balance, 'ledger_id', v_ledger_id);
end;
$$;

revoke all on function public.apply_previous_due_collection(uuid, numeric, text, uuid, uuid, text, date, numeric) from public, anon, authenticated;

create or replace function public.create_sale(
  p_customer_id uuid,
  p_invoice_date date,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_payments jsonb,
  p_items jsonb,
  p_previous_due numeric default 0,
  p_previous_due_method text default 'cash',
  p_previous_due_instrument_id uuid default null,
  p_advance_used numeric default 0,
  p_place_of_supply text default null,
  p_supply_type text default 'intra_state',
  p_customer_gstin text default null,
  p_b2b_or_b2c text default 'B2C_SMALL',
  p_total_taxable_value numeric default null,
  p_total_cgst numeric default 0,
  p_total_sgst numeric default 0,
  p_total_igst numeric default 0,
  p_is_reverse_charge boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_previous_due numeric := coalesce(p_previous_due, 0);
  v_current_due numeric := 0;
begin
  if auth.role() <> 'service_role' and current_user <> 'postgres' then
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not public.is_back_office() then raise exception 'Forbidden'; end if;
  end if;

  if v_previous_due < 0 then raise exception 'Previous due cannot be negative'; end if;
  if v_previous_due > 0 and p_customer_id is null then raise exception 'Customer is required for previous due collection'; end if;

  v_result := public.create_sale_internal(
    p_customer_id,
    p_invoice_date,
    p_subtotal,
    p_discount,
    p_total,
    p_payments,
    p_items,
    p_previous_due,
    p_previous_due_method,
    p_previous_due_instrument_id,
    p_advance_used,
    p_place_of_supply,
    p_supply_type,
    p_customer_gstin,
    p_b2b_or_b2c,
    p_total_taxable_value,
    p_total_cgst,
    p_total_sgst,
    p_total_igst,
    p_is_reverse_charge
  );

  v_current_due := coalesce((v_result ->> 'due')::numeric, 0);

  if v_previous_due > 0 then
    perform public.apply_previous_due_collection(
      p_customer_id,
      v_previous_due,
      p_previous_due_method,
      p_previous_due_instrument_id,
      (v_result ->> 'invoice_id')::uuid,
      v_result ->> 'invoice_number',
      p_invoice_date,
      v_current_due
    );
  end if;

  return v_result || jsonb_build_object(
    'previous_due_collected', v_previous_due,
    'customer_balance_due_after_sale', v_current_due
  );
end;
$$;
