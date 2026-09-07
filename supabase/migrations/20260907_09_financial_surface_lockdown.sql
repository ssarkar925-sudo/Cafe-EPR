-- 20260907_09_financial_surface_lockdown.sql
-- Post-application database boundary hardening.
--
-- DO NOT APPLY before the application has been migrated away from direct
-- client writes to financial tables. The current repository still contains
-- browser code that performs direct cashbook synchronization.
--
-- This migration is intentionally separated from 20260907_01.
-- It contains no financial-row DML.

BEGIN;

-- ============================================================
-- Core financial/ledger tables: client roles become read-only.
-- SELECT remains available according to existing RLS/grants.
-- ============================================================

DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass::text AS rel
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','p')
      AND c.relname IN (
        'transactions',
        'invoices',
        'invoice_items',
        'quick_sales',
        'quick_sale_items',
        'payments',
        'cash_entries',
        'customer_ledger',
        'stock_movements',
        'purchases',
        'purchase_items',
        'purchase_returns',
        'supplier_ledger',
        'journal_entries',
        'journal_lines',
        'settlements'
      )
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %s FROM PUBLIC, anon, authenticated',
      r.rel
    );
  END LOOP;
END
$do$;

-- ============================================================
-- Anonymous clients must never invoke financial mutation RPCs.
-- Discover overloads dynamically so this remains signature-safe.
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
        'update_recharge'
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',
      r.sig
    );
  END LOOP;
END
$do$;

-- The authenticated back-office wrappers remain governed by their
-- in-function authorization checks. Internal worker functions should
-- already be locked down by the preceding hardening migration.

COMMENT ON TABLE public.transactions IS
  'Financial mutation authority is server-side; client roles are read-only after surface lockdown.';
COMMENT ON TABLE public.cash_entries IS
  'Append-only financial money trail; client roles are read-only after surface lockdown.';
COMMENT ON TABLE public.customer_ledger IS
  'Append-only customer financial ledger; client roles are read-only after surface lockdown.';
COMMENT ON TABLE public.journal_entries IS
  'General Ledger header; client roles are read-only after surface lockdown.';
COMMENT ON TABLE public.journal_lines IS
  'General Ledger lines; client roles are read-only after surface lockdown.';

COMMIT;
