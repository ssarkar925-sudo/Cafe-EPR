-- Business transaction edit hardening.
--
-- The previous update_business_txn implementation only reversed cash legs.
-- That left bank_out/bank_in movements and customer-credit balances out of sync
-- after edits. This migration makes the edit a complete compensating transition.
-- Historical rows are never deleted or rewritten.

create or replace function public.update_business_txn(
  p_txn_id uuid,
  p_transaction_date date,
  p_transaction_timestamp timestamptz,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_remarks text,
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
  v_txn record;
  v_pay_from_method text;
  v_old_customer_id uuid;
  v_old_due numeric := 0;
  v_new_due numeric := 0;
  v_cash_out numeric := 0;
  v_cash_in numeric := 0;
  v_bank_out numeric := 0;
  v_bank_in numeric := 0;
  v_pool_out numeric := 0;
  v_pool_credit numeric := 0;
  v_pool_type text;
  v_upi_fee numeric := 0;
  v_fee numeric := coalesce(p_service_fee, 0);
  v_cash_instrument_id uuid;
  v_upi_instrument_id uuid;
  v_bank_instrument_id uuid;
  v_number text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_service_fee is null or p_service_fee < 0 then raise exception 'Service fee cannot be negative'; end if;
  if p_portal_commission is null or p_portal_commission < 0 then raise exception 'Portal commission cannot be negative'; end if;

  select * into v_txn
  from public.transactions
  where id = p_txn_id
  for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_txn.status <> 'success' then raise exception 'Only successful transactions can be edited'; end if;

  if p_pay_from_instrument_id is not null then
    select type into v_pay_from_method
    from public.payment_instruments
    where id = p_pay_from_instrument_id and is_active = true;
    if v_pay_from_method is null then raise exception 'The selected funding account is not available'; end if;
  else
    v_pay_from_method := coalesce(p_pay_from_method, 'bank');
  end if;
  if v_pay_from_method not in ('cash', 'bank', 'upi', 'wallet', 'debit_card', 'credit_card') then
    raise exception 'Invalid funding account method';
  end if;

  if v_txn.service_type = 'aeps' then
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
  elsif v_txn.service_type = 'dmt' then
    if p_transfer_method not in ('bank_account', 'upi') then raise exception 'Select a transfer method'; end if;
    if p_reference is null or p_reference = '' then raise exception 'RRN / reference is required'; end if;
  elsif v_txn.service_type = 'upi' then
    if p_merchant_qr_id is null then raise exception 'A merchant QR is required'; end if;
  end if;

  -- Resolve standard destination instruments for customer collections.
  select id into v_cash_instrument_id from public.payment_instruments
    where type = 'cash' and is_active = true order by name limit 1;
  select id into v_upi_instrument_id from public.payment_instruments
    where type = 'upi' and is_active = true order by name limit 1;
  select id into v_bank_instrument_id from public.payment_instruments
    where type = 'bank' and is_active = true order by name limit 1;

  -- ---------- Compensate the old transaction ----------
  if v_txn.cash_out > 0 then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (current_date, 'cash', 'in', v_txn.cash_out,
            'Corrected ' || upper(v_txn.service_type) || ' ' || v_txn.transaction_number,
            'transaction', p_txn_id, v_cash_instrument_id);
  end if;
  if v_txn.cash_in > 0 then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (current_date, 'cash', 'out', v_txn.cash_in,
            'Corrected ' || upper(v_txn.service_type) || ' ' || v_txn.transaction_number,
            'transaction', p_txn_id, v_cash_instrument_id);
  end if;
  if v_txn.bank_out > 0 then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (current_date,
            case when coalesce(v_txn.pay_from_method, 'bank') in ('debit_card','credit_card') then 'card' else coalesce(v_txn.pay_from_method,'bank') end,
            'in', v_txn.bank_out,
            'Corrected ' || upper(v_txn.service_type) || ' ' || v_txn.transaction_number || ' bank out',
            'transaction', p_txn_id, v_txn.pay_from_instrument_id);
  end if;
  if v_txn.bank_in > 0 then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (current_date,
            case when coalesce(v_txn.customer_pay_method,'cash') = 'upi' then 'upi' else 'bank' end,
            'out', v_txn.bank_in,
            'Corrected ' || upper(v_txn.service_type) || ' ' || v_txn.transaction_number || ' bank in',
            'transaction', p_txn_id,
            case when coalesce(v_txn.customer_pay_method,'cash') = 'upi' then v_upi_instrument_id else v_bank_instrument_id end);
  end if;

  -- Reverse any old customer credit before applying the new one. Lock the row
  -- so concurrent edits/payments cannot lose a balance update.
  if coalesce(v_txn.customer_pay_method,'cash') = 'due' and v_txn.customer_id is not null then
    v_old_customer_id := v_txn.customer_id;
    v_old_due := coalesce(v_txn.amount,0) + coalesce(v_txn.service_fee,0);
    perform 1 from public.customers where id = v_old_customer_id for update;
    update public.customers
      set balance = coalesce(balance,0) - v_old_due
      where id = v_old_customer_id;
    insert into public.customer_ledger
      (customer_id, entry_date, type, description, debit, credit, balance_after, ref_type, ref_id)
    select c.id, current_date, v_txn.service_type,
           'Correction reversal ' || v_txn.transaction_number,
           0, v_old_due, coalesce(c.balance,0), 'transaction', p_txn_id
    from public.customers c where c.id = v_old_customer_id;
  end if;

  -- ---------- Derive the new movement ----------
  if v_txn.service_type = 'aeps' then
    if p_fee_source = 'upi' then
      v_cash_out := p_amount;
      v_upi_fee := v_fee;
    elsif p_fee_source = 'separate_cash' then
      v_cash_out := p_amount;
      v_cash_in := v_fee;
    else
      v_cash_out := p_amount - v_fee;
    end if;
    v_pool_credit := p_amount + coalesce(p_portal_commission,0);
    v_pool_out := 0;
    v_pool_type := 'aeps';
  elsif v_txn.service_type = 'dmt' then
    if coalesce(p_paid_from,'bank') = 'portal' then
      v_pool_out := p_amount;
      v_pool_type := 'dmt';
    else
      v_bank_out := p_amount;
    end if;
    if coalesce(p_customer_pay_method,'cash') in ('bank','upi') then
      v_bank_in := p_amount + v_fee;
    elsif coalesce(p_customer_pay_method,'cash') = 'due' then
      if p_customer_id is null then raise exception 'Please select a customer to mark this DMT transfer as Due.'; end if;
    else
      v_cash_in := p_amount + v_fee;
    end if;
  else
    if coalesce(p_customer_pay_method,'qr') = 'cash' then
      v_cash_in := p_amount + v_fee;
    else
      v_pool_credit := p_amount + v_fee;
      v_pool_type := 'upi_qr';
    end if;
    v_cash_out := p_amount;
  end if;

  update public.transactions set
    transaction_date = p_transaction_date,
    transaction_timestamp = coalesce(p_transaction_timestamp, p_transaction_date::timestamptz),
    customer_id = p_customer_id,
    customer_mobile = p_customer_mobile,
    reference = nullif(p_reference,''),
    remarks = p_remarks,
    bank_id = p_bank_id,
    portal_id = p_portal_id,
    merchant_qr_id = p_merchant_qr_id,
    aadhaar_last4 = p_aadhaar_last4,
    transfer_method = p_transfer_method,
    sender_name = p_sender_name,
    sender_mobile = p_sender_mobile,
    beneficiary_name = p_beneficiary_name,
    beneficiary_mobile = p_beneficiary_mobile,
    beneficiary_bank = p_beneficiary_bank,
    beneficiary_ifsc = p_beneficiary_ifsc,
    beneficiary_account = p_beneficiary_account,
    upi_id = p_upi_id,
    receiver_name = p_receiver_name,
    amount = p_amount,
    service_fee = v_fee,
    portal_commission = coalesce(p_portal_commission,0),
    fee_source = p_fee_source,
    paid_from = p_paid_from,
    customer_pay_method = p_customer_pay_method,
    pay_from_instrument_id = p_pay_from_instrument_id,
    pay_from_method = v_pay_from_method,
    cash_out = v_cash_out,
    cash_in = v_cash_in,
    bank_out = v_bank_out,
    bank_in = v_bank_in,
    pool_out = v_pool_out,
    pool_credit = v_pool_credit,
    pool_credit_type = v_pool_type,
    upi_fee = v_upi_fee,
    updated_at = now()
  where id = p_txn_id;

  -- Apply the new cash/bank legs. These are the current legs; historical
  -- compensation rows remain untouched and are never deleted.
  if v_cash_out > 0 then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (p_transaction_date, 'cash', 'out', v_cash_out,
            upper(v_txn.service_type) || ' ' || v_txn.transaction_number || ' cash payout',
            'transaction', p_txn_id, v_cash_instrument_id);
  end if;
  if v_cash_in > 0 then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (p_transaction_date, 'cash', 'in', v_cash_in,
            upper(v_txn.service_type) || ' ' || v_txn.transaction_number || ' received in cash',
            'transaction', p_txn_id, v_cash_instrument_id);
  end if;
  if v_bank_out > 0 then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (p_transaction_date,
            case when v_pay_from_method in ('debit_card','credit_card') then 'card' else v_pay_from_method end,
            'out', v_bank_out,
            upper(v_txn.service_type) || ' ' || v_txn.transaction_number || ' bank transfer',
            'transaction', p_txn_id, p_pay_from_instrument_id);
  end if;
  if v_bank_in > 0 then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (p_transaction_date,
            case when coalesce(p_customer_pay_method,'cash') = 'upi' then 'upi' else 'bank' end,
            'in', v_bank_in,
            upper(v_txn.service_type) || ' ' || v_txn.transaction_number || ' received via ' || upper(coalesce(p_customer_pay_method,'bank')),
            'transaction', p_txn_id,
            case when coalesce(p_customer_pay_method,'cash') = 'upi' then v_upi_instrument_id else v_bank_instrument_id end);
  end if;

  if coalesce(p_customer_pay_method,'cash') = 'due' and p_customer_id is not null then
    v_new_due := p_amount + v_fee;
    perform 1 from public.customers where id = p_customer_id for update;
    update public.customers
      set balance = coalesce(balance,0) + v_new_due
      where id = p_customer_id;
    insert into public.customer_ledger
      (customer_id, entry_date, type, description, debit, credit, balance_after, ref_type, ref_id)
    select c.id, p_transaction_date, v_txn.service_type,
           upper(v_txn.service_type) || ' ' || v_txn.transaction_number || ' on credit',
           v_new_due, 0, coalesce(c.balance,0), 'transaction', p_txn_id
    from public.customers c where c.id = p_customer_id;
  end if;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'transaction_updated', 'transactions', p_txn_id::text,
    'Edited ' || v_txn.transaction_number || ' to ' || p_amount,
    jsonb_build_object('amount',p_amount,'service_fee',p_service_fee,
                       'portal_commission',p_portal_commission,
                       'old_amount',v_txn.amount,
                       'old_service_fee',v_txn.service_fee,
                       'old_customer_id',v_txn.customer_id,
                       'new_customer_id',p_customer_id)
  );

  return jsonb_build_object('id',p_txn_id,'status','success');
end;
$$;

revoke all on function public.update_business_txn(p_txn_id uuid, date, timestamptz, uuid, text, text, text, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, numeric, numeric, numeric, text, text, text, uuid, text, text) from public, anon;
grant execute on function public.update_business_txn(p_txn_id uuid, date, timestamptz, uuid, text, text, text, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, numeric, numeric, numeric, text, text, text, uuid, text, text) to authenticated;
