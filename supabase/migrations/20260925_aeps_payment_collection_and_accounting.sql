-- AEPS Payment Collection, Transfer Method Constraint Expansion & Double-Entry Accounting
-- 1. Expand transactions_transfer_method_check to permit AEPS operation types:
--    'cash_out', 'payment_collection', 'balance_enquiry', 'mini_statement', 'bank_account', 'upi'
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_transfer_method_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_transfer_method_check
  CHECK (
    transfer_method IS NULL
    OR transfer_method = ANY (ARRAY[
      'cash_out'::text,
      'payment_collection'::text,
      'balance_enquiry'::text,
      'mini_statement'::text,
      'bank_account'::text,
      'upi'::text
    ])
  );

-- 2. Expand transactions_fee_source_check to support customer_paid_extra, cut_from_withdrawal, etc.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_fee_source_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_fee_source_check
  CHECK (
    fee_source IS NULL
    OR fee_source = ANY (ARRAY[
      'cut_from_withdrawal'::text,
      'cut_from_payment'::text,
      'separate_cash'::text,
      'upi'::text,
      'customer_paid_extra'::text
    ])
  );

-- 3. Ensure aeps_pricing_rules has transaction_type column
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'aeps_pricing_rules') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'aeps_pricing_rules' AND column_name = 'transaction_type') THEN
      ALTER TABLE public.aeps_pricing_rules ADD COLUMN transaction_type text NOT NULL DEFAULT 'cash_out';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'aeps_pricing_rules' AND column_name = 'bank_id') THEN
      ALTER TABLE public.aeps_pricing_rules ADD COLUMN bank_id uuid REFERENCES public.aeps_banks(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- 4. Update create_business_txn with authoritative support for AEPS Payment Collection (direction = IN, cash_out = 0)
CREATE OR REPLACE FUNCTION public.create_business_txn(
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
  p_receiver_name text default null,
  p_portal_charge numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
  v_pay_from_instrument_id uuid;
  v_customer_instrument_id uuid;
  v_cash_instrument_id uuid;
  v_portal_instrument_id uuid;
  v_qr_instrument_id uuid;
  v_norm_method text;
begin
  if auth.uid() is null and auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Not authenticated';
  end if;
  if current_user <> 'postgres' and auth.role() <> 'service_role' and not public.is_back_office() then
    raise exception 'Forbidden';
  end if;
  if p_service_type not in ('aeps', 'dmt', 'upi') then raise exception 'Invalid service type'; end if;
  if p_status not in ('success', 'pending', 'failed') then raise exception 'Invalid status'; end if;

  v_norm_method := lower(coalesce(p_transfer_method, 'cash_out'));

  -- Amount validation
  if p_service_type = 'aeps' and v_norm_method in ('balance_enquiry', 'mini_statement') then
    -- Informational queries may carry 0 amount
    null;
  else
    if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  end if;

  if p_service_fee is null or p_service_fee < 0 then raise exception 'Service fee cannot be negative'; end if;
  if p_portal_commission is null or p_portal_commission < 0 then raise exception 'Portal commission cannot be negative'; end if;
  v_fee := coalesce(p_service_fee, 0);

  -- Always resolve default system cash instrument
  select id into v_cash_instrument_id
  from public.payment_instruments
  where type = 'cash' and is_active = true
  order by created_at limit 1;

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

    -- Resolve portal instrument for float
    select payment_instrument_id into v_portal_instrument_id
    from public.aeps_portals
    where id = p_portal_id and is_active = true;
    if v_portal_instrument_id is null then
      select id into v_portal_instrument_id
      from public.payment_instruments
      where type in ('aeps_portal', 'aeps') and is_active = true
      order by created_at limit 1;
    end if;

    -- -------------------------------------------------------------------------
    -- AEPS DIRECTION & ACCOUNTING SPECIFICATION
    -- -------------------------------------------------------------------------
    if v_norm_method in ('payment_collection', 'aadhaar_pay', 'collection') then
      -- 1. PAYMENT COLLECTION (Customer -> Shop / Business, Direction: IN)
      -- Customer pays merchant/shop via biometric Aadhaar Pay.
      -- Shop Portal Float is credited with the collected funds (+ commission).
      -- Zero physical cash leaves the till (cash_out = 0).
      v_direction := 'in';
      v_prefix := 'APC';
      v_seq := 'public.aeps_seq';
      v_label := 'AEPS Collection';
      v_cash_out := 0;

      if p_fee_source in ('separate_cash', 'customer_paid_extra') and v_fee > 0 then
        v_cash_in := v_fee;
        v_pool_credit := coalesce(p_amount, 0) + coalesce(p_portal_commission, 0);
      else
        v_cash_in := 0;
        v_pool_credit := coalesce(p_amount, 0) + coalesce(p_portal_commission, 0);
      end if;

      v_pool_out := 0;
      v_pool_type := 'aeps';
      v_pay_from_instrument_id := v_portal_instrument_id;
      v_pay_from_method := 'aeps_portal';
      v_customer_instrument_id := v_portal_instrument_id;

    elsif v_norm_method in ('balance_enquiry', 'mini_statement') then
      -- 2. INFORMATIONAL INQUIRY (Direction: IN / INFO)
      -- No cash out, no customer collection.
      v_direction := 'in';
      v_prefix := case when v_norm_method = 'balance_enquiry' then 'ABE' else 'AMS' end;
      v_seq := 'public.aeps_seq';
      v_label := case when v_norm_method = 'balance_enquiry' then 'AEPS Balance' else 'AEPS Statement' end;
      v_cash_out := 0;
      v_cash_in := 0;
      v_pool_credit := coalesce(p_portal_commission, 0);
      v_pool_out := 0;
      v_pool_type := 'aeps';
      v_pay_from_instrument_id := v_portal_instrument_id;
      v_pay_from_method := 'aeps_portal';

    else
      -- 3. CASH OUT (Shop / Agent -> Customer, Direction: OUT)
      -- Agent dispenses cash to customer; portal float is credited (+ commission).
      v_direction := 'out';
      v_prefix := 'AEP';
      v_seq := 'public.aeps_seq';
      v_label := 'AEPS Cash Out';

      if p_fee_source = 'upi' then
        v_cash_out := p_amount;
        v_upi_fee := v_fee;
      elsif p_fee_source in ('separate_cash', 'customer_paid_extra') then
        v_cash_out := p_amount;
        v_cash_in := v_fee;
      else
        v_cash_out := p_amount - v_fee;
      end if;

      v_pool_credit := p_amount + coalesce(p_portal_commission, 0);
      v_pool_out := 0;
      v_pool_type := 'aeps';
      v_pay_from_instrument_id := v_cash_instrument_id;
      v_pay_from_method := 'cash';
    end if;

  elsif p_service_type = 'dmt' then
    if p_transfer_method not in ('bank_account', 'upi') then raise exception 'Select a transfer method'; end if;
    if p_reference is null or p_reference = '' then raise exception 'RRN / reference is required'; end if;
    v_direction := 'in'; v_prefix := 'DMT'; v_seq := 'public.dmt_seq'; v_label := 'DMT';

    if coalesce(p_paid_from, 'bank') = 'portal' then
      v_pool_out := p_amount;
      v_pool_type := 'dmt';
      if p_portal_id is not null then
        select payment_instrument_id into v_portal_instrument_id
        from public.aeps_portals
        where id = p_portal_id and is_active = true;
      end if;
      if v_portal_instrument_id is null then
        select id into v_portal_instrument_id
        from public.payment_instruments
        where type in ('dmt', 'dmt_portal', 'aeps_portal') and is_active = true
        order by created_at limit 1;
      end if;
      v_pay_from_instrument_id := v_portal_instrument_id;
      v_pay_from_method := 'dmt';
    else
      v_bank_out := p_amount;
      v_pay_from_instrument_id := p_pay_from_instrument_id;
      if v_pay_from_instrument_id is null and p_bank_id is not null then
        if exists(select 1 from public.payment_instruments where id = p_bank_id and is_active = true) then
          v_pay_from_instrument_id := p_bank_id;
        end if;
      end if;
      if v_pay_from_instrument_id is null then
        select id into v_pay_from_instrument_id
        from public.payment_instruments
        where type = 'bank' and is_active = true
        order by created_at limit 1;
      end if;
      select type into v_pay_from_method
      from public.payment_instruments
      where id = v_pay_from_instrument_id and is_active = true;
      v_pay_from_method := coalesce(v_pay_from_method, 'bank');
    end if;

    if coalesce(p_customer_pay_method, 'cash') in ('bank', 'upi') then
      v_bank_in := p_amount + v_fee;
      select id into v_customer_instrument_id
      from public.payment_instruments
      where type = coalesce(p_customer_pay_method, 'bank') and is_active = true
      order by created_at limit 1;
    elsif coalesce(p_customer_pay_method, 'cash') = 'due' then
      if p_customer_id is null then raise exception 'Please select a customer to mark this DMT transfer as Due.'; end if;
      v_cash_in := 0;
      v_bank_in := 0;
      v_customer_instrument_id := null;
    else
      v_cash_in := p_amount + v_fee;
      v_customer_instrument_id := v_cash_instrument_id;
    end if;

  else -- upi cash out
    v_direction := 'out'; v_prefix := 'UPI'; v_seq := 'public.upi_seq'; v_label := 'UPI';
    v_cash_out := p_amount;
    if coalesce(p_customer_pay_method, 'qr') = 'cash' then
      v_cash_in := p_amount + v_fee;
      v_customer_instrument_id := v_cash_instrument_id;
    else
      v_pool_credit := p_amount + v_fee;
      v_pool_type := 'upi_qr';
      if p_merchant_qr_id is not null then
        select payment_instrument_id into v_qr_instrument_id
        from public.upi_merchant_qrs
        where id = p_merchant_qr_id and is_active = true;
      end if;
      if v_qr_instrument_id is null then
        select id into v_qr_instrument_id
        from public.payment_instruments
        where type in ('upi', 'upi_qr') and is_active = true
        order by created_at limit 1;
      end if;
      v_customer_instrument_id := v_qr_instrument_id;
    end if;
    v_pay_from_instrument_id := v_cash_instrument_id;
    v_pay_from_method := 'cash';
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
    instrument_id, pay_from_instrument_id, pay_from_method,
    cash_out, cash_in, bank_out, bank_in, pool_out, pool_credit, pool_credit_type, upi_fee
  ) values (
    v_number, p_service_type, v_direction, p_transaction_date,
    coalesce(p_transaction_timestamp, p_transaction_date::timestamptz), p_customer_id,
    p_customer_mobile, nullif(p_reference, ''), p_remarks, p_status,
    p_bank_id, p_portal_id, p_merchant_qr_id, p_aadhaar_last4, p_transfer_method,
    p_sender_name, p_sender_mobile, p_beneficiary_name, p_beneficiary_mobile,
    p_beneficiary_bank, p_beneficiary_ifsc, p_beneficiary_account, p_upi_id,
    coalesce(p_amount, 0), v_fee, coalesce(p_portal_commission, 0), auth.uid(),
    p_fee_source, p_paid_from, p_customer_pay_method,
    coalesce(v_customer_instrument_id, v_cash_instrument_id), v_pay_from_instrument_id, v_pay_from_method,
    v_cash_out, v_cash_in, v_bank_out, v_bank_in, v_pool_out, v_pool_credit, v_pool_type, v_upi_fee
  ) returning id into v_txn_id;

  if p_status = 'success' then
    -- 1. Cash Payout Leg (AEPS Cash Out, UPI)
    if v_cash_out > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (p_transaction_date, 'cash', 'out', v_cash_out, v_label || ' ' || v_number || ' cash payout', 'transaction', v_txn_id, v_cash_instrument_id);
    end if;

    -- 2. Customer Inflow Leg (Cash)
    if v_cash_in > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (p_transaction_date, 'cash', 'in', v_cash_in, v_label || ' ' || v_number || ' received in cash', 'transaction', v_txn_id, v_cash_instrument_id);
    end if;

    -- 3. Customer Inflow Leg (Bank / UPI)
    if v_bank_in > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (p_transaction_date, coalesce(p_customer_pay_method, 'bank'), 'in', v_bank_in, v_label || ' ' || v_number || ' received via ' || coalesce(p_customer_pay_method, 'Bank'), 'transaction', v_txn_id, v_customer_instrument_id);
    end if;

    -- 4. Payout Leg from Bank (DMT)
    if v_bank_out > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (p_transaction_date, 'bank', 'out', v_bank_out, v_label || ' ' || v_number || ' transfer sent to beneficiary', 'transaction', v_txn_id, v_pay_from_instrument_id);
    end if;

    -- 5. Payout Leg from Portal Wallet (DMT from portal)
    if v_pool_out > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (p_transaction_date, coalesce(v_pool_type, 'dmt'), 'out', v_pool_out, v_label || ' ' || v_number || ' payout from portal wallet', 'transaction', v_txn_id, v_pay_from_instrument_id);
    end if;

    -- 6. Float Credit Leg (AEPS float credit or UPI QR credit)
    if v_pool_credit > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (
        p_transaction_date,
        coalesce(v_pool_type, 'aeps'),
        'in',
        v_pool_credit,
        case when p_service_type = 'aeps' then v_label || ' ' || v_number || ' float credited'
             else v_label || ' ' || v_number || ' received via Shop QR' end,
        'transaction',
        v_txn_id,
        case when p_service_type = 'aeps' then v_portal_instrument_id else v_qr_instrument_id end
      );
    end if;

    -- 7. Credit Sale (Customer Khata Due)
    if coalesce(p_customer_pay_method, 'cash') = 'due' and p_customer_id is not null then
      select coalesce(balance, 0) into v_prev_bal from public.customers where id = p_customer_id for update;
      v_new_bal := v_prev_bal + (p_amount + v_fee);
      update public.customers set balance = v_new_bal, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, debit, credit, balance_after, ref_type, ref_id)
      values (p_customer_id, p_transaction_date, p_service_type, v_label || ' ' || v_number || ' on credit', p_amount + v_fee, 0, v_new_bal, 'transaction', v_txn_id);
    end if;
  end if;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'transaction_created', 'transactions', v_txn_id::text,
    'Created ' || v_label || ' ' || v_number || ' (' || p_status || ') of ' || coalesce(p_amount, 0),
    jsonb_build_object('service_type', p_service_type, 'amount', p_amount, 'status', p_status, 'reference', p_reference, 'transfer_method', p_transfer_method, 'direction', v_direction)
  );

  return (
    select jsonb_build_object('id', id, 'transaction_number', transaction_number,
      'service_type', service_type, 'direction', direction, 'status', status,
      'amount', amount, 'service_fee', service_fee, 'portal_commission', portal_commission,
      'cash_out', cash_out, 'cash_in', cash_in, 'bank_out', bank_out, 'bank_in', bank_in,
      'pool_out', pool_out, 'pool_credit', pool_credit, 'pool_credit_type', pool_credit_type,
      'upi_fee', upi_fee, 'transfer_method', transfer_method)
    from public.transactions where id = v_txn_id
  );
end;
$$;
