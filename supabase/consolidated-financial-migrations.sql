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

-- 4. Drop Obsolete 30-argument Overload of create_business_txn
-- This permanently prevents the PostgreSQL "Could not choose a best candidate function" error.
DROP FUNCTION IF EXISTS public.create_business_txn(
  text, date, timestamp with time zone, uuid, text, text, text, text, uuid, uuid, uuid,
  text, text, text, text, text, text, text, text, text, text, numeric, numeric, numeric,
  text, text, text, uuid, text, text
);

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
