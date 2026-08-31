-- ==============================================================================
-- Minimal Migration: Fix business transaction RPC overload ambiguity
-- ==============================================================================
-- Drops ONLY obsolete create_business_txn / update_business_txn overloads.
-- Preserves the canonical 33-param create + 35-param update signatures.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- 1. List currently installed signatures (for verification before/after)
-- -----------------------------------------------------------------------------
-- Run this query manually in Supabase SQL Editor to verify current state:
-- SELECT proname, pg_get_function_identity_arguments(oid) as signature
-- FROM pg_proc
-- WHERE proname IN ('create_business_txn', 'update_business_txn')
--   AND pronamespace = 'public'::regnamespace
-- ORDER BY proname, oid;

-- -----------------------------------------------------------------------------
-- 2. Drop OBSOLETE create_business_txn overloads (31 and 32 parameters)
--    Keep ONLY the canonical 33-param version with:
--    p_pay_from_instrument_id uuid, p_pay_from_method text, p_receiver_name text
-- -----------------------------------------------------------------------------

-- Drop 31-param overload (no p_receiver_name, no p_pay_from_instrument_id, no p_pay_from_method)
DROP FUNCTION IF EXISTS public.create_business_txn(
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
  p_customer_pay_method text
);

-- Drop 32-param overload (has p_receiver_name but NOT p_pay_from_instrument_id / p_pay_from_method)
DROP FUNCTION IF EXISTS public.create_business_txn(
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
  p_receiver_name text
);

-- -----------------------------------------------------------------------------
-- 3. Drop OBSOLETE update_business_txn overloads
--    Keep ONLY the canonical 35-param version with:
--    p_pay_from_instrument_id uuid, p_pay_from_method text, p_receiver_name text
-- -----------------------------------------------------------------------------

-- Drop 31-param overload (no p_receiver_name, no p_pay_from_instrument_id, no p_pay_from_method)
DROP FUNCTION IF EXISTS public.update_business_txn(
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
  p_fee_source text,
  p_paid_from text,
  p_customer_pay_method text
);

-- Drop 32-param overload (has p_receiver_name but NOT p_pay_from_instrument_id / p_pay_from_method)
DROP FUNCTION IF EXISTS public.update_business_txn(
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
  p_fee_source text,
  p_paid_from text,
  p_customer_pay_method text,
  p_receiver_name text
);

-- Drop 33-param overload (has p_receiver_name + p_customer_pay_method but NOT p_pay_from_instrument_id / p_pay_from_method)
-- This signature exists in fix-aeps-float-calculation.sql
DROP FUNCTION IF EXISTS public.update_business_txn(
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
  p_fee_source text,
  p_paid_from text,
  p_customer_pay_method text,
  p_receiver_name text
);

-- -----------------------------------------------------------------------------
-- 4. Verify: Re-run the signature query to confirm only canonical versions remain
-- -----------------------------------------------------------------------------
-- Expected remaining signatures:
-- create_business_txn(...) with 33 parameters including p_pay_from_instrument_id, p_pay_from_method, p_receiver_name
-- update_business_txn(...) with 35 parameters including p_pay_from_instrument_id, p_pay_from_method, p_receiver_name