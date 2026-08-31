-- Correct the canonical create_business_txn implementation after the signature fix.
-- Restores the complete cash-entry/customer-ledger/audit behavior and makes the
-- selected payment instrument authoritative for pay_from_method.

alter table public.transactions
  add column if not exists receiver_name text default null;
alter table public.transactions
  add column if not exists pay_from_instrument_id uuid default null;
alter table public.transactions
  add column if not exists pay_from_method text default 'bank';

drop function if exists public.create_business_txn(
  p_service_type text,
  p_transaction_date date,
  p_transaction_timestamp timestamptz,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_remarks text,
  p_status text,
  p_bank_id uuid,
  p_portal_id uuid,
  p_merchant_qr_id uuid,
  p_aadhaar_last4 text,
  p_transfer_method text,
  p_sender_name text,
  p_sender_mobile text,
  p_beneficiary_name text,
  p_beneficiary_mobile text,
  p_beneficiary_bank text,
  p_beneficiary_ifsc text,
  p_beneficiary_account text,
  p_upi_id text,
  p_amount numeric,
  p_service_fee numeric,
  p_portal_commission numeric,
  p_fee_source text,
  p_paid_from text,
  p_customer_pay_method text,
  p_pay_from_instrument_id uuid,
  p_pay_from_method text,
  p_receiver_name text
);

create or replace function public.create_business_txn(
  p_service_type text,
  p_transaction_date date,
  p_transaction_timestamp timestamptz,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_remarks text,
  p_status text,
  p_bank_id uuid,
  p_portal_id uuid,
  p_merchant_qr_id uuid,
  p_aadhaar_last4 text,
  p_transfer_method text,
  p_sender_name text,
  p_sender_mobile text,
  p_beneficiary_name text,
  p_beneficiary_mobile text,
  p_beneficiary_bank text,
  p_beneficiary_ifsc text,
  p_beneficiary_account text,
  p_upi_id text,
  p_amount numeric,
  p_service_fee numeric,
  p_portal_commission numeric,
  p_fee_source text default null,
  p_paid_from text default null,
  p_customer_pay_method text default null,
  p_pay_from_instrument_id uuid default null,
  p_pay_from_method text default 'bank',
  p_receiver_name text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_txn_id uuid;
  v_number text;
  v_direction text;
  v_seq text;
  v_prefix text;
  v_label text;
  v_cash_out numeric := 0;
  v_cash_in numeric := 0;
  v_bank_out numeric := 0;
  v_bank_in numeric := 0;
  v_pool_out numeric := 0;
  v_pool_credit numeric := 0;
  v_pool_type text;
  v_upi_fee numeric := 0;
  v_fee numeric;
  v_prev_bal numeric := 0;
  v_new_bal numeric := 0;
  v_pay_from_method text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_service_type not in ('aeps', 'dmt', 'upi') then raise exception 'Invalid service type'; end if;
  if p_status not in ('success', 'pending', 'failed') then raise exception 'Invalid status'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_service_fee is null or p_service_fee < 0 then raise exception 'Service fee cannot be negative'; end if;
  if p_portal_commission is null or p_portal_commission < 0 then raise exception 'Portal commission cannot be negative'; end if;
  v_fee := coalesce(p_service_fee, 0);

  if p_service_type = 'aeps' then
    if p_bank_id is null then raise exception 'An AEPS bank is required'; end if;
    if p_portal_id is null then raise exception 'An AEPS portal is required'; end if;
    if p_aadhaar_last4 is null or p_aadhaar_last4 !~ '^[0-9]{4}$' then
      raise exception 'Aadhaar last 4 digits are required';
    end if;
    if not exists (select 1 from public.aeps_banks where id = p_bank_id and is_active) then
      raise exception 'The selected bank is not available';
    end if;
    if not exists (select 1 from public.aeps_portals where id = p_portal_id and is_active) then
      raise exception 'The selected portal is not available';
    end if;
    v_direction := 'out'; v_prefix := 'AEP'; v_seq := 'public.aeps_seq'; v_label := 'AEPS';
    if p_fee_source = 'upi' then
      v_cash_out := p_amount;
      v_upi_fee := v_fee;
    elsif p_fee_source = 'separate_cash' then
      v_cash_out := p_amount;
      v_cash_in := v_fee;
    else
      v_cash_out := p_amount - v_fee;
    end if;
    v_pool_credit := p_amount + coalesce(p_portal_commission, 0);
    v_pool_out := 0;
    v_pool_type := 'aeps';
  elsif p_service_type = 'dmt' then
    if p_transfer_method not in ('bank_account', 'upi') then raise exception 'Select a transfer method'; end if;
    if p_reference is null or p_reference = '' then raise exception 'RRN / reference is required'; end if;
    v_direction := 'in'; v_prefix := 'DMT'; v_seq := 'public.dmt_seq'; v_label := 'DMT';
    if coalesce(p_paid_from, 'bank') = 'portal' then
      v_pool_out := p_amount;
      v_pool_type := 'dmt';
    else
      v_bank_out := p_amount;
    end if;
    if coalesce(p_customer_pay_method, 'cash') in ('bank', 'upi') then
      v_bank_in := p_amount + v_fee;
    elsif coalesce(p_customer_pay_method, 'cash') = 'due' then
      if p_customer_id is null then raise exception 'Please select a customer to mark this DMT transfer as Due.'; end if;
      v_cash_in := 0;
      v_bank_in := 0;
    else
      v_cash_in := p_amount + v_fee;
    end if;
  else
    v_direction := 'out'; v_prefix := 'UPI'; v_seq := 'public.upi_seq'; v_label := 'UPI';
    if coalesce(p_customer_pay_method, 'qr') = 'cash' then
      v_cash_in := p_amount + v_fee;
    else
      v_pool_credit := p_amount + v_fee;
      v_pool_type := 'upi_qr';
    end if;
    v_cash_out := p_amount;
  end if;

  -- Resolve the selected funding instrument to its authoritative type.
  -- The ID is the identity; the stored method must never be a stale UI value.
  if p_pay_from_instrument_id is not null then
    select type into v_pay_from_method
    from public.payment_instruments
    where id = p_pay_from_instrument_id and is_active = true;
    if v_pay_from_method is null then
      raise exception 'The selected funding account is not available';
    end if;
  else
    v_pay_from_method := coalesce(p_pay_from_method, 'bank');
  end if;

  v_number := v_prefix || '-' || lpad(nextval(v_seq)::text, 4, '0');

  insert into public.transactions (
    transaction_number, service_type, direction, transaction_date, transaction_timestamp, customer_id,
    customer_mobile, reference, remarks, status,
    bank_id, portal_id, merchant_qr_id, aadhaar_last4, transfer_method,
    sender_name, sender_mobile, beneficiary_name, beneficiary_mobile,
    beneficiary_bank, beneficiary_ifsc, beneficiary_account, upi_id,
    amount, service_fee, portal_commission, created_by,
    fee_source, paid_from, customer_pay_method,
    pay_from_instrument_id, pay_from_method,
    cash_out, cash_in, bank_out, bank_in, pool_out, pool_credit, pool_credit_type, upi_fee
  ) values (
    v_number, p_service_type, v_direction, p_transaction_date,
    coalesce(p_transaction_timestamp, p_transaction_date::timestamptz), p_customer_id,
    p_customer_mobile, nullif(p_reference, ''), p_remarks, p_status,
    p_bank_id, p_portal_id, p_merchant_qr_id, p_aadhaar_last4, p_transfer_method,
    p_sender_name, p_sender_mobile, p_beneficiary_name, p_beneficiary_mobile,
    p_beneficiary_bank, p_beneficiary_ifsc, p_beneficiary_account, p_upi_id,
    p_amount, v_fee, coalesce(p_portal_commission, 0), auth.uid(),
    p_fee_source, p_paid_from, p_customer_pay_method,
    p_pay_from_instrument_id, v_pay_from_method,
    v_cash_out, v_cash_in, v_bank_out, v_bank_in, v_pool_out, v_pool_credit, v_pool_type, v_upi_fee
  ) returning id into v_txn_id;

  if p_status = 'success' then
    if v_cash_out > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
      values (p_transaction_date, 'cash', 'out', v_cash_out, v_label || ' ' || v_number || ' cash payout', 'transaction', v_txn_id);
    end if;
    if v_cash_in > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
      values (p_transaction_date, 'cash', 'in', v_cash_in, v_label || ' ' || v_number || ' received in cash', 'transaction', v_txn_id);
    end if;
    if v_bank_in > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
      values (p_transaction_date, 'bank', 'in', v_bank_in, v_label || ' ' || v_number || ' received via Bank/UPI', 'transaction', v_txn_id);
    end if;
    if coalesce(p_customer_pay_method, 'cash') = 'due' and p_customer_id is not null then
      select coalesce(balance, 0) into v_prev_bal from public.customers where id = p_customer_id;
      v_new_bal := v_prev_bal + (p_amount + v_fee);
      update public.customers set balance = v_new_bal where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, debit, credit, balance_after, ref_type, ref_id)
      values (p_customer_id, p_transaction_date, p_service_type, v_label || ' ' || v_number || ' on credit', p_amount + v_fee, 0, v_new_bal, 'transaction', v_txn_id);
    end if;
  end if;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'transaction_created', 'transactions', v_txn_id::text,
    'Created ' || v_label || ' ' || v_number || ' (' || p_status || ') of ' || p_amount,
    jsonb_build_object('service_type', p_service_type, 'amount', p_amount, 'status', p_status, 'reference', p_reference)
  );

  return (
    select jsonb_build_object('id', id, 'transaction_number', transaction_number,
      'service_type', service_type, 'direction', direction, 'status', status,
      'amount', amount, 'service_fee', service_fee, 'portal_commission', portal_commission,
      'cash_out', cash_out, 'cash_in', cash_in, 'bank_out', bank_out, 'bank_in', bank_in,
      'pool_out', pool_out, 'pool_credit', pool_credit, 'pool_credit_type', pool_credit_type,
      'upi_fee', upi_fee)
    from public.transactions where id = v_txn_id
  );
end;
$$;

revoke all on function public.create_business_txn(
  p_service_type text,
  p_transaction_date date,
  p_transaction_timestamp timestamptz,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_remarks text,
  p_status text,
  p_bank_id uuid,
  p_portal_id uuid,
  p_merchant_qr_id uuid,
  p_aadhaar_last4 text,
  p_transfer_method text,
  p_sender_name text,
  p_sender_mobile text,
  p_beneficiary_name text,
  p_beneficiary_mobile text,
  p_beneficiary_bank text,
  p_beneficiary_ifsc text,
  p_beneficiary_account text,
  p_upi_id text,
  p_amount numeric,
  p_service_fee numeric,
  p_portal_commission numeric,
  p_fee_source text,
  p_paid_from text,
  p_customer_pay_method text,
  p_pay_from_instrument_id uuid,
  p_pay_from_method text,
  p_receiver_name text
) from public, anon;

grant execute on function public.create_business_txn(
  p_service_type text,
  p_transaction_date date,
  p_transaction_timestamp timestamptz,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_remarks text,
  p_status text,
  p_bank_id uuid,
  p_portal_id uuid,
  p_merchant_qr_id uuid,
  p_aadhaar_last4 text,
  p_transfer_method text,
  p_sender_name text,
  p_sender_mobile text,
  p_beneficiary_name text,
  p_beneficiary_mobile text,
  p_beneficiary_bank text,
  p_beneficiary_ifsc text,
  p_beneficiary_account text,
  p_upi_id text,
  p_amount numeric,
  p_service_fee numeric,
  p_portal_commission numeric,
  p_fee_source text,
  p_paid_from text,
  p_customer_pay_method text,
  p_pay_from_instrument_id uuid,
  p_pay_from_method text,
  p_receiver_name text
) to authenticated;
