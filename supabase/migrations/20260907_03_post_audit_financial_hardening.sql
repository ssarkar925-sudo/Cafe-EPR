-- 20260907_03_post_audit_financial_hardening.sql
-- Post-audit ACCESS-CONTROL hardening only.
--
-- This migration intentionally does NOT rewrite financial business logic.
-- The current production audit already contains working back-office checks
-- on the sensitive wrapper RPCs. This migration closes the remaining
-- anonymous EXECUTE surface and locks internal worker RPCs to server roles.
--
-- No financial rows are modified.

BEGIN;

-- ============================================================
-- Internal financial workers: never directly callable by client roles.
-- We discover overloads from pg_proc so the migration is resilient to
-- signature variants already present in production.
-- ============================================================
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_sale_internal',
        'record_quick_sale_internal',
        'record_invoice_payment_internal',
        'post_journal_entry',
        'append_journal_mirror_reversal',
        'post_service_transaction_journal_snapshot'
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      r.sig
    );
  END LOOP;
END
$do$;

-- ============================================================
-- Sensitive public financial mutations: anonymous callers are never valid.
-- Authenticated access remains because the functions enforce the
-- back-office/admin authorization checks in their bodies.
-- ============================================================
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_dmt_business_txn',
        'create_dmt_business_txn_multi_collection',
        'edit_bill_payment',
        'update_recharge',
        'record_invoice_multi_payment',
        'record_customer_multi_payment',
        'apply_transaction_customer_payment_split',
        'reverse_business_txn',
        'cancel_invoice',
        'cancel_quick_sale',
        'create_purchase',
        'record_supplier_payment',
        'record_advance',
        'return_advance',
        'process_return',
        'process_purchase_return',
        'adjust_customer_ledger',
        'adjust_stock_manual'
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',
      r.sig
    );
  END LOOP;
END
$do$;

-- ============================================================
-- Guard the idempotency primitives once 20260907_01 exists.
-- These blocks are no-ops when 20260907_01 has not yet been deployed.
-- ============================================================
DO $do$
BEGIN
  IF to_regprocedure('public.idempotency_acquire(text,text,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.idempotency_acquire(text,text,jsonb) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.idempotency_acquire(text,text,jsonb) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.idempotency_commit(text,text,text,uuid,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.idempotency_commit(text,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.idempotency_commit(text,text,text,uuid,jsonb) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.hash_idempotency_payload(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.hash_idempotency_payload(jsonb) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.hash_idempotency_payload(jsonb) TO authenticated, service_role';
  END IF;
END
$do$;

COMMIT;
