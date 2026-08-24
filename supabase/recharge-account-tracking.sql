-- ==============================================================================
-- RECHARGE ACCOUNT-LINKED OUTFLOW TRACKING & FLOAT REDESIGN
-- ==============================================================================
-- Eliminates static "Recharge Float" in favor of individual account/card tracking
-- ==============================================================================

-- 1. Add columns to transactions table if they don't exist
alter table public.transactions
  add column if not exists pay_from_instrument_id uuid references public.payment_instruments(id) on delete set null,
  add column if not exists pay_from_method text default 'bank';

create index if not exists idx_transactions_pay_from_instrument on public.transactions(pay_from_instrument_id);

-- 2. Drop legacy signatures of create_recharge and update_recharge
drop function if exists public.create_recharge(uuid, date, timestamptz, uuid, text, text, text, text, numeric);
drop function if exists public.create_recharge(uuid, date, timestamptz, uuid, text, text, text, text, numeric, text);
drop function if exists public.create_recharge(uuid, date, timestamptz, uuid, text, text, text, text, numeric, text, uuid, text);

-- 3. Updated create_recharge RPC with Pay-From Account tracking
create or replace function public.create_recharge(
  p_provider_id uuid,
  p_transaction_date date,
  p_transaction_timestamp timestamptz,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_remarks text,
  p_status text default 'success',
  p_amount numeric default null,
  p_customer_pay_method text default 'cash',
  p_pay_from_instrument_id uuid default null,
  p_pay_from_method text default 'bank'
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_txn_id uuid;
  v_number text;
  v_commission numeric := 0;
  v_cost numeric;
  v_provider_name text := 'Recharge';
  v_cash_in numeric := 0;
  v_bank_in numeric := 0;
  v_customer_pay text;
  v_pay_from text;
  v_prev_bal numeric := 0;
  v_new_bal numeric := 0;
  v_inst_name text := null;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_status not in ('success', 'pending', 'failed') then raise exception 'Invalid status'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  v_customer_pay := coalesce(p_customer_pay_method, 'cash');
  if v_customer_pay not in ('cash', 'bank', 'upi', 'upi_qr', 'due') then
    v_customer_pay := 'cash';
  end if;

  if v_customer_pay = 'due' and p_customer_id is null then
    raise exception 'Please select a customer to mark this recharge as Due (Credit).';
  end if;

  v_pay_from := coalesce(p_pay_from_method, 'bank');
  if v_pay_from not in ('bank', 'credit_card', 'wallet', 'cash', 'debit_card') then
    v_pay_from := 'bank';
  end if;

  if p_provider_id is not null then
    select name into v_provider_name from public.recharge_providers where id = p_provider_id;
  end if;

  if p_provider_id is not null then
    select (get_recharge_commission(p_provider_id, p_amount)->>'commission')::numeric,
           (get_recharge_commission(p_provider_id, p_amount)->>'cost')::numeric
    into v_commission, v_cost;
  else
    v_commission := 0;
    v_cost := p_amount;
  end if;

  if p_pay_from_instrument_id is not null then
    select name into v_inst_name from public.payment_instruments where id = p_pay_from_instrument_id;
  end if;

  v_number := 'RCH-' || lpad(nextval('public.recharge_seq')::text, 4, '0');

  if v_customer_pay = 'cash' then
    v_cash_in := p_amount;
  elsif v_customer_pay = 'bank' then
    v_bank_in := p_amount;
  else
    v_cash_in := 0;
    v_bank_in := 0;
  end if;

  -- Insert Transaction Record
  insert into public.transactions (
    transaction_number, service_type, direction, transaction_date, transaction_timestamp,
    customer_id, customer_mobile, reference, remarks, status,
    provider_id, amount, service_fee, portal_commission, created_by,
    cash_out, cash_in, bank_out, bank_in, pool_out, pool_credit, pool_credit_type,
    customer_pay_method, pay_from_instrument_id, pay_from_method
  ) values (
    v_number, 'recharge', 'in', p_transaction_date,
    coalesce(p_transaction_timestamp, p_transaction_date::timestamptz),
    p_customer_id, p_customer_mobile, nullif(p_reference, ''), p_remarks, p_status,
    p_provider_id, p_amount, 0, v_commission, auth.uid(),
    0, v_cash_in, 0, v_bank_in, v_cost, 0, v_pay_from,
    v_customer_pay, p_pay_from_instrument_id, v_pay_from
  ) returning id into v_txn_id;

  if p_status = 'success' then
    -- 1. Inflow Leg: Record Customer Payment
    if v_customer_pay = 'cash' then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
      values (p_transaction_date, 'cash', 'in', p_amount,
              'Recharge ' || v_number || ' received in cash', 'transaction', v_txn_id);
    elsif v_customer_pay = 'bank' then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
      values (p_transaction_date, 'bank', 'in', p_amount,
              'Recharge ' || v_number || ' received in Bank account', 'transaction', v_txn_id);
    elsif v_customer_pay in ('upi', 'upi_qr') then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
      values (p_transaction_date, 'upi', 'in', p_amount,
              'Recharge ' || v_number || ' received via Shop UPI QR', 'transaction', v_txn_id);
    elsif v_customer_pay = 'due' and p_customer_id is not null then
      select coalesce(balance, 0) into v_prev_bal from public.customers where id = p_customer_id;
      v_new_bal := v_prev_bal + p_amount;
      update public.customers set balance = v_new_bal, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, debit, credit, balance_after, ref_type, ref_id)
      values (p_customer_id, p_transaction_date, 'recharge', 'Recharge ' || v_number || ' on credit', p_amount, 0, v_new_bal, 'transaction', v_txn_id);
    end if;

    -- 2. Outflow Leg: Record Recharge Cost Paid from Selected Account/Card/Wallet
    if v_cost > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (
        p_transaction_date,
        v_pay_from,
        'out',
        v_cost,
        'Recharge ' || v_number || ' (' || coalesce(v_provider_name, 'Recharge') || ') paid from ' || coalesce(v_inst_name, v_pay_from),
        'transaction',
        v_txn_id,
        p_pay_from_instrument_id
      );
    end if;
  end if;

  -- 3. Audit Log
  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'transaction_created', 'transactions', v_txn_id::text,
    'Recharge ' || v_number || ' (' || p_status || ') ₹' || p_amount ||
    ' via ' || coalesce(v_provider_name, 'Recharge') ||
    ' | Customer Paid: ' || v_customer_pay ||
    ' | Funded from: ' || coalesce(v_inst_name, v_pay_from) || ' (Cost: ₹' || v_cost || ', Comm: ₹' || v_commission || ')',
    jsonb_build_object(
      'service_type', 'recharge', 'provider', v_provider_name,
      'amount', p_amount, 'commission', v_commission, 'cost', v_cost,
      'status', p_status, 'customer_pay_method', v_customer_pay,
      'pay_from_method', v_pay_from, 'pay_from_instrument', v_inst_name
    )
  );

  return (
    select jsonb_build_object(
      'id', id, 'transaction_number', transaction_number,
      'service_type', service_type, 'direction', direction, 'status', status,
      'amount', amount, 'service_fee', service_fee, 'portal_commission', portal_commission,
      'cash_in', cash_in, 'bank_in', bank_in, 'pool_out', pool_out,
      'customer_pay_method', customer_pay_method,
      'pay_from_instrument_id', pay_from_instrument_id,
      'pay_from_method', pay_from_method
    )
    from public.transactions where id = v_txn_id
  );
end;
$$;

revoke all on function public.create_recharge(uuid, date, timestamptz, uuid, text, text, text, text, numeric, text, uuid, text) from public, anon;
grant execute on function public.create_recharge(uuid, date, timestamptz, uuid, text, text, text, text, numeric, text, uuid, text) to authenticated;
