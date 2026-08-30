-- ============================================================================
-- Migration: 20260830_bill_payment_commission_config.sql
-- Description: Persistent Bill Payment & Google Play commission/margin table
-- Safety: Idempotent (IF NOT EXISTS), zero impact on existing financial tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bill_payment_commission_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type TEXT NOT NULL DEFAULT 'utility_bill',
  category_id TEXT NULL,
  biller_id TEXT NULL,
  commission_type TEXT NOT NULL CHECK (commission_type IN ('flat', 'percentage')),
  commission_value NUMERIC NOT NULL DEFAULT 0 CHECK (commission_value >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- Allow write for authenticated & anon (service role / client operations)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bill_payment_commission_config' 
      AND policyname = 'Allow all operations on bill_payment_commission_config'
  ) THEN
    CREATE POLICY "Allow all operations on bill_payment_commission_config"
      ON public.bill_payment_commission_config FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
