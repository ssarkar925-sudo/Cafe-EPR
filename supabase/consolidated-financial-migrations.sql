-- ==============================================================================
-- CAFE ERP — CONSOLIDATED FINANCIAL MODULES DATABASE MIGRATION
-- Run this script in the Supabase SQL Editor.
-- It is 100% IDEMPOTENT (safe to run multiple times without duplicating or corrupting data).
-- ==============================================================================

-- 1. Ensure Table: bill_payment_commission_config
CREATE TABLE IF NOT EXISTS public.bill_payment_commission_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type TEXT NOT NULL DEFAULT 'utility_bill',
  category_id TEXT NULL,
  category_name TEXT NULL,
  biller_id TEXT NULL,
  biller_name TEXT NULL,
  commission_type TEXT NOT NULL CHECK (commission_type IN ('flat', 'percentage')),
  commission_value NUMERIC NOT NULL DEFAULT 0 CHECK (commission_value >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add missing columns if table existed from an older version
ALTER TABLE public.bill_payment_commission_config ADD COLUMN IF NOT EXISTS category_name TEXT NULL;
ALTER TABLE public.bill_payment_commission_config ADD COLUMN IF NOT EXISTS biller_name TEXT NULL;

-- Enable RLS
ALTER TABLE public.bill_payment_commission_config ENABLE ROW LEVEL SECURITY;

-- Allow read for authenticated & anon
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bill_payment_commission_config' 
      AND policyname = 'Allow public read on bill_payment_commission_config'
  ) THEN
    CREATE POLICY "Allow public read on bill_payment_commission_config"
      ON public.bill_payment_commission_config FOR SELECT USING (true);
  END IF;
END $$;

-- Allow write for authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bill_payment_commission_config' 
      AND policyname = 'Allow all operations on bill_payment_commission_config'
  ) THEN
    CREATE POLICY "Allow all operations on bill_payment_commission_config"
      ON public.bill_payment_commission_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. Ensure Required Columns on payment_instruments
ALTER TABLE public.payment_instruments ADD COLUMN IF NOT EXISTS opening_balance NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.payment_instruments ADD COLUMN IF NOT EXISTS current_balance NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.payment_instruments ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.payment_instruments ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Ensure default Cash instrument exists
DO $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.payment_instruments WHERE type = 'cash' AND is_active = true ORDER BY created_at LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.payment_instruments (name, type, is_active, opening_balance, current_balance, details)
    VALUES ('Cash', 'cash', true, 0, 0, '{"system_default":true}')
    RETURNING id INTO v_id;
  END IF;
END $$;

-- 3. Ensure Required Columns on transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS portal_charge NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS pay_from_instrument_id UUID DEFAULT NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS pay_from_method TEXT DEFAULT 'bank';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS receiver_name TEXT DEFAULT NULL;

-- 4. Drop Obsolete 30-argument Overload of create_business_txn & obsolete validate_transaction_money_source trigger
-- This permanently prevents the PostgreSQL "Could not choose a best candidate function" error
-- and obsolete "Successful transaction requires an account/instrument" before-insert validation conflict.
DROP FUNCTION IF EXISTS public.create_business_txn(
  text, date, timestamp with time zone, uuid, text, text, text, text, uuid, uuid, uuid,
  text, text, text, text, text, text, text, text, text, text, numeric, numeric, numeric,
  text, text, text, uuid, text, text
);
DROP TRIGGER IF EXISTS trg_validate_transaction_money_source ON public.transactions;
DROP FUNCTION IF EXISTS public.validate_transaction_money_source();

-- 5. Ensure Chart of Accounts has 5210 (Cash Shortage and Overage)
INSERT INTO public.accounting_accounts (code, name, account_type, is_active)
VALUES ('5210', 'Cash Shortage and Overage', 'expense', true)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = true;

-- 6. Ensure Day Close Variance Reconciliation Function exists
CREATE OR REPLACE FUNCTION public.reconcile_day_close_variance(p_closing_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closing RECORD;
  v_cash_adj NUMERIC := 0;
  v_lines JSONB := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL AND auth.role() <> 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_closing FROM public.closings WHERE id = p_closing_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Day close not found'; END IF;

  SELECT COALESCE(adjustment, 0) INTO v_cash_adj
  FROM public.closing_balances
  WHERE closing_id = p_closing_id AND pool = 'cash';

  IF v_cash_adj <> 0 THEN
    IF v_cash_adj < 0 THEN
      -- Shortage: Dr 5210 (Cash Shortage Expense), Cr 1000 (Cash Drawer)
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code', '5210', 'debit', abs(v_cash_adj), 'credit', 0),
        jsonb_build_object('account_code', '1000', 'debit', 0, 'credit', abs(v_cash_adj))
      );
    ELSE
      -- Overage: Dr 1000 (Cash Drawer), Cr 5210 (Cash Overage Gain)
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code', '1000', 'debit', abs(v_cash_adj), 'credit', 0),
        jsonb_build_object('account_code', '5210', 'debit', 0, 'credit', abs(v_cash_adj))
      );
    END IF;

    PERFORM public.post_journal_entry(
      v_closing.close_date,
      'day_close_variance',
      p_closing_id,
      'Day Close Variance ' || v_closing.closing_number || CASE WHEN v_cash_adj < 0 THEN ' (Shortage)' ELSE ' (Overage)' END,
      v_lines,
      auth.uid()
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'closing_id', p_closing_id, 'variance', v_cash_adj);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_day_close_variance(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_day_close_variance(UUID) TO authenticated;

-- 7. Ensure All Live Synchronization Tables are in supabase_realtime Publication
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'payment_instruments',
    'cash_entries',
    'transactions',
    'settlements',
    'expenses',
    'purchases',
    'opening_balances',
    'invoices',
    'invoice_items',
    'payments',
    'customers',
    'customer_ledger',
    'audit_logs',
    'bill_payment_commission_config',
    'recharge_commission_slabs',
    'recharge_providers'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t)
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = t
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- ATOMIC TRANSACTION EDIT & REAL-TIME RECONCILIATION RPCS
-- =============================================================================

-- 1. edit_bill_payment RPC
CREATE OR REPLACE FUNCTION public.edit_bill_payment(
  p_txn_id uuid,
  p_customer_id uuid DEFAULT NULL,
  p_customer_mobile text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_service_fee numeric DEFAULT 0,
  p_portal_commission numeric DEFAULT 0,
  p_customer_pay_method text DEFAULT 'cash',
  p_funding_instrument_id uuid DEFAULT NULL,
  p_status text DEFAULT 'success',
  p_remarks text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_txn record;
  v_entry_date date;
  v_new_cost numeric;
  v_new_collected numeric;
  v_new_funding_method text := 'bank';
  v_new_collection_inst uuid;
  v_new_collection_method text;
  v_cash_drawer_id uuid;
  v_default_upi_id uuid;
  v_default_bank_id uuid;
  r record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  perform set_config('erp.internal_cash_mutation_authorized', 'on', true);
  perform pg_advisory_xact_lock(hashtextextended('erp:transaction-update:'||p_txn_id::text, 0));

  select * into v_txn from public.transactions where id = p_txn_id for update;
  if not found then raise exception 'Transaction not found'; end if;

  v_entry_date := coalesce(v_txn.transaction_date, current_date);
  v_new_cost := greatest(0, p_amount - coalesce(p_portal_commission, 0));
  v_new_collected := p_amount + coalesce(p_service_fee, 0);

  -- Resolve default instruments
  select id into v_cash_drawer_id from public.payment_instruments where is_active = true and lower(type) = 'cash' order by created_at asc limit 1;
  select id into v_default_upi_id from public.payment_instruments where is_active = true and lower(type) in ('upi_qr', 'upi') order by created_at asc limit 1;
  select id into v_default_bank_id from public.payment_instruments where is_active = true and lower(type) in ('bank', 'debit_card') order by created_at asc limit 1;

  -- 1) Reverse previous cash_entries for this transaction (opposite direction on same instrument_id)
  for r in select * from public.cash_entries where ref_type = 'transaction' and ref_id = p_txn_id loop
    insert into public.cash_entries(
      entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id
    ) values (
      v_entry_date,
      r.method,
      case when r.direction = 'out' then 'in' else 'out' end,
      r.amount,
      'Reversal on edit: ' || coalesce(r.description, 'Txn ' || v_txn.transaction_number),
      'transaction',
      p_txn_id,
      r.instrument_id
    );
  end loop;

  -- 2) Post new legs if status = 'success'
  if p_status = 'success' then
    -- New Customer Collection Leg (IN)
    if p_customer_pay_method <> 'due' and v_new_collected > 0 then
      v_new_collection_method := p_customer_pay_method;
      if v_new_collection_method = 'cash' then
        v_new_collection_inst := v_cash_drawer_id;
      elsif v_new_collection_method in ('upi', 'qr', 'upi_qr') then
        v_new_collection_inst := coalesce(v_default_upi_id, v_default_bank_id, v_cash_drawer_id);
      else
        v_new_collection_inst := coalesce(v_default_bank_id, v_cash_drawer_id);
      end if;

      insert into public.cash_entries(
        entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id
      ) values (
        v_entry_date,
        v_new_collection_method,
        'in',
        v_new_collected,
        'Collection for ' || v_txn.transaction_number || ' (' || upper(v_new_collection_method) || ') [Reconciled]',
        'transaction',
        p_txn_id,
        v_new_collection_inst
      );
    end if;

    -- New Provider Funding Leg (OUT)
    if v_new_cost > 0 and p_funding_instrument_id is not null then
      select case lower(type)
        when 'aeps_portal' then 'aeps'
        when 'dmt_portal' then 'dmt'
        when 'upi_qr' then 'upi'
        else lower(type)
      end into v_new_funding_method
      from public.payment_instruments
      where id = p_funding_instrument_id;

      v_new_funding_method := coalesce(v_new_funding_method, 'bank');

      insert into public.cash_entries(
        entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id
      ) values (
        v_entry_date,
        v_new_funding_method,
        'out',
        v_new_cost,
        'Settlement for ' || v_txn.transaction_number || ' from ' || (select name from public.payment_instruments where id = p_funding_instrument_id) || ' [Reconciled]',
        'transaction',
        p_txn_id,
        p_funding_instrument_id
      );
    end if;
  end if;

  -- 3) Update transaction record
  update public.transactions set
    customer_id = p_customer_id,
    customer_mobile = p_customer_mobile,
    reference = nullif(p_reference, ''),
    amount = p_amount,
    service_fee = coalesce(p_service_fee, 0),
    portal_commission = coalesce(p_portal_commission, 0),
    pool_out = v_new_cost,
    customer_pay_method = p_customer_pay_method,
    instrument_id = p_funding_instrument_id,
    pay_from_instrument_id = p_funding_instrument_id,
    pay_from_method = v_new_funding_method,
    remarks = p_remarks,
    status = p_status,
    cash_in = case when p_customer_pay_method = 'cash' then v_new_collected else 0 end,
    bank_in = case when p_customer_pay_method in ('bank', 'upi') then v_new_collected else 0 end,
    updated_at = now()
  where id = p_txn_id;

  -- 4) Audit log
  insert into public.audit_logs(user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'edit', 'transaction', p_txn_id::text,
    'Complete Edit & Reconciliation on ' || v_txn.transaction_number,
    jsonb_build_object(
      'transaction_number', v_txn.transaction_number,
      'amount', p_amount,
      'funding_instrument_id', p_funding_instrument_id,
      'customer_pay_method', p_customer_pay_method
    )
  );

  return (select to_jsonb(t.*) from public.transactions t where t.id = p_txn_id);
end;
$$;

GRANT EXECUTE ON FUNCTION public.edit_bill_payment TO authenticated;

-- 2. update_business_txn RPC (Enhanced with instrument tracking and reversal)
CREATE OR REPLACE FUNCTION public.update_business_txn(
  p_txn_id uuid,
  p_transaction_date date,
  p_transaction_timestamp timestamp with time zone,
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
  p_fee_source text DEFAULT NULL::text,
  p_paid_from text DEFAULT NULL::text,
  p_customer_pay_method text DEFAULT NULL::text,
  p_pay_from_instrument_id uuid DEFAULT NULL::uuid,
  p_pay_from_method text DEFAULT 'bank'::text,
  p_receiver_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_txn record;
  v_cash_out numeric := 0;
  v_cash_in numeric := 0;
  v_bank_out numeric := 0;
  v_bank_in numeric := 0;
  v_pool_out numeric := 0;
  v_pool_credit numeric := 0;
  v_pool_type text;
  v_upi_fee numeric := 0;
  v_fee numeric := coalesce(p_service_fee, 0);
  v_final_pay_from_method text := 'bank';
  v_resolved_pay_from_id uuid := p_pay_from_instrument_id;
  v_cash_id uuid;
  v_upi_id uuid;
  v_collection_id uuid;
  v_collection_method text;
  v_collection numeric := 0;
  v_due numeric := 0;
  v_prev_balance numeric := 0;
  v_new_balance numeric := 0;
  r record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_service_fee is null or p_service_fee < 0 then raise exception 'Service fee cannot be negative'; end if;
  if p_portal_commission is null or p_portal_commission < 0 then raise exception 'Portal commission cannot be negative'; end if;

  perform set_config('erp.internal_cash_mutation_authorized', 'on', true);
  perform pg_advisory_xact_lock(hashtextextended('erp:transaction-update:'||p_txn_id::text, 0));

  select * into v_txn from public.transactions where id = p_txn_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_txn.status <> 'success' then raise exception 'Only successful transactions can be edited'; end if;

  select id into v_cash_id from public.payment_instruments where is_active = true and lower(type) = 'cash' order by created_at asc limit 1;

  if coalesce(p_merchant_qr_id, v_txn.merchant_qr_id) is not null then
    select payment_instrument_id into v_upi_id
    from public.upi_merchant_qrs
    where id = coalesce(p_merchant_qr_id, v_txn.merchant_qr_id);
  end if;
  if v_upi_id is null then
    select id into v_upi_id from public.payment_instruments where is_active = true and lower(type) in ('upi', 'upi_qr') order by created_at asc limit 1;
  end if;

  -- Resolve funding instrument
  if v_resolved_pay_from_id is null then
    if coalesce(p_paid_from, v_txn.paid_from) = 'portal' and coalesce(p_portal_id, v_txn.portal_id) is not null then
      select ap.payment_instrument_id into v_resolved_pay_from_id
      from public.aeps_portals ap where ap.id = coalesce(p_portal_id, v_txn.portal_id);
    elsif v_txn.service_type = 'dmt' or coalesce(p_paid_from, v_txn.paid_from) = 'bank' then
      select id into v_resolved_pay_from_id
      from public.payment_instruments
      where is_active = true and lower(type) in ('bank', 'debit_card')
      order by created_at asc limit 1;
    elsif v_txn.service_type = 'aeps' and coalesce(p_portal_id, v_txn.portal_id) is not null then
      select ap.payment_instrument_id into v_resolved_pay_from_id
      from public.aeps_portals ap where ap.id = coalesce(p_portal_id, v_txn.portal_id);
    end if;
  end if;

  if v_resolved_pay_from_id is not null then
    select case lower(type)
      when 'aeps_portal' then 'aeps'
      when 'dmt_portal' then 'dmt'
      when 'upi_qr' then 'upi'
      else lower(type)
    end into v_final_pay_from_method
    from public.payment_instruments where id = v_resolved_pay_from_id;
  else
    v_final_pay_from_method := coalesce(p_pay_from_method, 'bank');
  end if;

  -- 1) Reverse previous cash_entries for this transaction (opposite direction, exact instrument_id)
  for r in select * from public.cash_entries where ref_type = 'transaction' and ref_id = p_txn_id loop
    insert into public.cash_entries(
      entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id
    ) values (
      coalesce(v_txn.transaction_date, current_date),
      r.method,
      case when r.direction = 'out' then 'in' else 'out' end,
      r.amount,
      'Reversal on edit: ' || coalesce(r.description, upper(v_txn.service_type) || ' ' || v_txn.transaction_number),
      'transaction',
      p_txn_id,
      r.instrument_id
    );
  end loop;

  -- 2) Calculate new legs based on service type
  if v_txn.service_type = 'aeps' then
    if p_fee_source = 'upi' or (p_fee_source in ('separate_cash', 'customer_paid_extra') and coalesce(p_customer_pay_method, 'cash') = 'upi') then
      v_cash_out := p_amount;
      v_upi_fee := v_fee;
    elsif p_fee_source in ('separate_cash', 'customer_paid_extra') then
      v_cash_out := p_amount;
      v_cash_in := v_fee;
    else
      v_cash_out := greatest(0, p_amount - v_fee);
    end if;
    v_pool_credit := p_amount + coalesce(p_portal_commission, 0);
    v_pool_out := 0;
    v_pool_type := 'aeps';

    -- Cash payout to customer
    if v_cash_out > 0 then
      insert into public.cash_entries(entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values(p_transaction_date, 'cash', 'out', v_cash_out, 'AEPS ' || v_txn.transaction_number || ' cash payout', 'transaction', p_txn_id, v_cash_id);
    end if;
    -- Cash fee received
    if v_cash_in > 0 then
      insert into public.cash_entries(entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values(p_transaction_date, 'cash', 'in', v_cash_in, 'AEPS ' || v_txn.transaction_number || ' fee received in cash', 'transaction', p_txn_id, v_cash_id);
    end if;
    -- UPI fee received
    if v_upi_fee > 0 and v_upi_id is not null then
      insert into public.cash_entries(entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values(p_transaction_date, 'upi', 'in', v_upi_fee, 'AEPS ' || v_txn.transaction_number || ' fee received via UPI', 'transaction', p_txn_id, v_upi_id);
    end if;

  elsif v_txn.service_type = 'dmt' then
    v_collection_method := lower(coalesce(p_customer_pay_method, 'cash'));
    v_collection := p_amount + v_fee;

    if v_collection_method = 'cash' then
      v_collection_id := v_cash_id;
    elsif v_collection_method in ('upi', 'qr', 'upi_qr') then
      v_collection_id := v_upi_id;
    elsif v_collection_method = 'bank' then
      select id into v_collection_id from public.payment_instruments where is_active = true and lower(type) in ('bank', 'debit_card') order by created_at asc limit 1;
    elsif v_collection_method = 'wallet' then
      select id into v_collection_id from public.payment_instruments where is_active = true and lower(type) = 'wallet' order by created_at asc limit 1;
    end if;

    -- Customer Collection (IN)
    if v_collection_method <> 'due' and v_collection > 0 then
      insert into public.cash_entries(entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values(p_transaction_date, case when v_collection_method in ('qr', 'upi_qr') then 'upi' else v_collection_method end, 'in', v_collection, 'DMT ' || v_txn.transaction_number || ' customer collection', 'transaction', p_txn_id, v_collection_id);
    end if;

    -- Provider Funding Out (OUT from funding instrument)
    if p_amount > 0 and v_resolved_pay_from_id is not null then
      insert into public.cash_entries(entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values(p_transaction_date, v_final_pay_from_method, 'out', p_amount, 'DMT ' || v_txn.transaction_number || ' funded from ' || (select name from public.payment_instruments where id = v_resolved_pay_from_id), 'transaction', p_txn_id, v_resolved_pay_from_id);
    end if;

    v_cash_in := case when v_collection_method = 'cash' then v_collection else 0 end;
    v_bank_in := case when v_collection_method = 'bank' then v_collection else 0 end;
    v_bank_out := case when v_final_pay_from_method = 'bank' then p_amount else 0 end;

  elsif v_txn.service_type = 'upi' then
    if coalesce(p_customer_pay_method, 'qr') = 'cash' then
      v_cash_in := p_amount + v_fee;
      v_cash_out := p_amount;
      insert into public.cash_entries(entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values(p_transaction_date, 'cash', 'in', v_cash_in, 'UPI ' || v_txn.transaction_number || ' received in cash', 'transaction', p_txn_id, v_cash_id);
    else
      if p_fee_source = 'customer_paid_extra' then
        v_pool_credit := p_amount + v_fee;
        v_cash_out := p_amount;
      else
        v_pool_credit := p_amount;
        v_cash_out := greatest(0, p_amount - v_fee);
      end if;
      v_pool_type := 'upi_qr';
      insert into public.cash_entries(entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values(p_transaction_date, 'upi', 'in', v_pool_credit, 'UPI ' || v_txn.transaction_number || ' received via QR', 'transaction', p_txn_id, v_upi_id);
    end if;

    insert into public.cash_entries(entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values(p_transaction_date, 'cash', 'out', v_cash_out, 'UPI ' || v_txn.transaction_number || ' cash payout', 'transaction', p_txn_id, v_cash_id);
  end if;

  -- 3) Update transaction record
  update public.transactions set
    transaction_date = p_transaction_date,
    transaction_timestamp = coalesce(p_transaction_timestamp, p_transaction_date::timestamptz),
    customer_id = p_customer_id,
    customer_mobile = p_customer_mobile,
    reference = nullif(p_reference, ''),
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
    portal_commission = coalesce(p_portal_commission, 0),
    fee_source = p_fee_source,
    paid_from = p_paid_from,
    customer_pay_method = p_customer_pay_method,
    instrument_id = coalesce(v_resolved_pay_from_id, v_txn.instrument_id),
    pay_from_instrument_id = v_resolved_pay_from_id,
    pay_from_method = v_final_pay_from_method,
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

  -- 4) Audit log
  insert into public.audit_logs(user_id, user_name, action, entity, entity_id, description, details)
  values(
    auth.uid(), null, 'transaction_updated', 'transactions', p_txn_id::text,
    'Updated ' || upper(v_txn.service_type) || ' ' || v_txn.transaction_number,
    jsonb_build_object(
      'amount', p_amount,
      'reference', p_reference,
      'pay_from_instrument_id', v_resolved_pay_from_id,
      'pay_from_method', v_final_pay_from_method
    )
  );

  return (select to_jsonb(t.*) from public.transactions t where t.id = p_txn_id);
end;
$$;

GRANT EXECUTE ON FUNCTION public.update_business_txn TO authenticated;

-- 3. update_recharge RPC (Enhanced with wallet/bank funding tracking & reversal)
DROP FUNCTION IF EXISTS public.update_recharge(uuid, uuid, date, timestamp with time zone, uuid, text, text, text, numeric);

CREATE OR REPLACE FUNCTION public.update_recharge(
  p_txn_id uuid,
  p_provider_id uuid,
  p_transaction_date date,
  p_transaction_timestamp timestamp with time zone,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_remarks text,
  p_amount numeric,
  p_customer_pay_method text DEFAULT 'cash',
  p_pay_from_instrument_id uuid DEFAULT NULL,
  p_pay_from_method text DEFAULT 'bank'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_txn record;
  v_commission numeric := 0;
  v_cost numeric := 0;
  v_provider_name text := 'Recharge';
  v_cash_id uuid;
  v_upi_id uuid;
  v_bank_id uuid;
  v_collection_id uuid;
  v_collection_method text;
  v_funding_id uuid := p_pay_from_instrument_id;
  v_funding_method text := coalesce(p_pay_from_method, 'bank');
  r record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  perform set_config('erp.internal_cash_mutation_authorized', 'on', true);
  perform pg_advisory_xact_lock(hashtextextended('erp:recharge-update:'||p_txn_id::text, 0));

  select * into v_txn from public.transactions where id = p_txn_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_txn.status <> 'success' then raise exception 'Only successful transactions can be edited'; end if;

  select id into v_cash_id from public.payment_instruments where is_active = true and lower(type) = 'cash' order by created_at asc limit 1;
  select id into v_upi_id from public.payment_instruments where is_active = true and lower(type) in ('upi', 'upi_qr') order by created_at asc limit 1;
  select id into v_bank_id from public.payment_instruments where is_active = true and lower(type) in ('bank', 'debit_card') order by created_at asc limit 1;

  if p_provider_id is not null then
    select name into v_provider_name from public.recharge_providers where id = p_provider_id and is_active;
    select (get_recharge_commission(p_provider_id, p_amount)->>'commission')::numeric,
           (get_recharge_commission(p_provider_id, p_amount)->>'cost')::numeric
    into v_commission, v_cost;
  else
    v_cost := p_amount;
  end if;

  if v_funding_id is null then
    v_funding_id := v_txn.pay_from_instrument_id;
  end if;

  if v_funding_id is not null then
    select case lower(type)
      when 'aeps_portal' then 'aeps'
      when 'dmt_portal' then 'dmt'
      when 'upi_qr' then 'upi'
      else lower(type)
    end into v_funding_method
    from public.payment_instruments where id = v_funding_id;
  end if;

  -- 1) Reverse previous cash_entries for this transaction (opposite direction, same instrument_id)
  for r in select * from public.cash_entries where ref_type = 'transaction' and ref_id = p_txn_id loop
    insert into public.cash_entries(
      entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id
    ) values (
      coalesce(v_txn.transaction_date, current_date),
      r.method,
      case when r.direction = 'out' then 'in' else 'out' end,
      r.amount,
      'Reversal on edit: ' || coalesce(r.description, 'Recharge ' || v_txn.transaction_number),
      'transaction',
      p_txn_id,
      r.instrument_id
    );
  end loop;

  -- 2) Post new legs
  v_collection_method := coalesce(p_customer_pay_method, 'cash');
  if v_collection_method = 'cash' then
    v_collection_id := v_cash_id;
  elsif v_collection_method in ('upi', 'qr', 'upi_qr') then
    v_collection_id := v_upi_id;
  else
    v_collection_id := v_bank_id;
  end if;

  if v_collection_method <> 'due' and p_amount > 0 then
    insert into public.cash_entries(entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values(
      p_transaction_date,
      case when v_collection_method in ('qr', 'upi_qr') then 'upi' else v_collection_method end,
      'in',
      p_amount,
      'Recharge ' || v_txn.transaction_number || ' received in ' || upper(v_collection_method),
      'transaction',
      p_txn_id,
      v_collection_id
    );
  end if;

  if v_cost > 0 and v_funding_id is not null then
    insert into public.cash_entries(entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values(
      p_transaction_date,
      v_funding_method,
      'out',
      v_cost,
      'Recharge ' || v_txn.transaction_number || ' settlement to ' || v_provider_name || ' from ' || (select name from public.payment_instruments where id = v_funding_id),
      'transaction',
      p_txn_id,
      v_funding_id
    );
  end if;

  -- 3) Update transaction record
  update public.transactions set
    transaction_date = p_transaction_date,
    transaction_timestamp = coalesce(p_transaction_timestamp, p_transaction_date::timestamptz),
    customer_id = p_customer_id,
    customer_mobile = p_customer_mobile,
    reference = nullif(p_reference, ''),
    remarks = p_remarks,
    provider_id = p_provider_id,
    amount = p_amount,
    portal_commission = v_commission,
    cash_in = case when v_collection_method = 'cash' then p_amount else 0 end,
    bank_in = case when v_collection_method in ('bank', 'upi') then p_amount else 0 end,
    pool_out = v_cost,
    customer_pay_method = v_collection_method,
    instrument_id = v_funding_id,
    pay_from_instrument_id = v_funding_id,
    pay_from_method = v_funding_method,
    updated_at = now()
  where id = p_txn_id;

  -- 4) Audit log
  insert into public.audit_logs(user_id, user_name, action, entity, entity_id, description, details)
  values(
    auth.uid(), null, 'transaction_updated', 'transactions', p_txn_id::text,
    'Edited ' || v_txn.transaction_number || ' to ' || p_amount || ' via ' || v_provider_name || ' | funding: ' || coalesce(v_funding_method, 'bank'),
    jsonb_build_object(
      'amount', p_amount,
      'commission', v_commission,
      'cost', v_cost,
      'funding_instrument_id', v_funding_id
    )
  );

  return (select to_jsonb(t.*) from public.transactions t where t.id = p_txn_id);
end;
$$;

GRANT EXECUTE ON FUNCTION public.update_recharge TO authenticated;
