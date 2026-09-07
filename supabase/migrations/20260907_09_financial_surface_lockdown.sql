-- 20260907_09_financial_surface_lockdown.sql
-- Post-01 database boundary hardening.
--
-- This migration does NOT implement or replace 20260907_01.
-- Apply only after the approved 20260907_01 idempotency remediation has
-- been independently deployed and verified.
--
-- Purpose:
-- 1. Remove direct client DML from append-only/core financial ledgers.
-- 2. Remove anonymous EXECUTE access from sensitive financial mutation RPCs.
-- 3. Preserve SELECT access for authenticated reporting/read paths.
--
-- No financial rows are modified by this migration.

BEGIN;

-- ============================================================
-- Core financial/ledger tables: server-side mutation only.
-- SELECT remains available according to existing policies/grants.
-- ============================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.transactions
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.invoices
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.invoice_items
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.quick_sales
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.quick_sale_items
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.payments
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.cash_entries
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.customer_ledger
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.stock_movements
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.journal_entries
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.journal_lines
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.settlements
  FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Sensitive financial RPCs: anonymous clients must never invoke them.
-- Existing authenticated/service_role access is retained because the
-- functions themselves enforce the back-office authorization boundary.
-- ============================================================

-- DMT canonical overload with customer collection fields.
REVOKE EXECUTE ON FUNCTION public.create_dmt_business_txn(
  text,date,timestamptz,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,
  text,text,text,text,text,numeric,numeric,numeric,text,text,text,uuid,text,text,numeric,
  numeric,numeric,text,uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_dmt_business_txn(
  text,date,timestamptz,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,
  text,text,text,text,text,numeric,numeric,numeric,text,text,text,uuid,text,text,numeric,
  numeric,numeric,text,uuid
) TO authenticated, service_role;

-- DMT legacy-compatible overload.
REVOKE EXECUTE ON FUNCTION public.create_dmt_business_txn(
  text,date,timestamptz,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,
  text,text,text,text,text,numeric,numeric,numeric,text,text,text,uuid,text,text,numeric
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_dmt_business_txn(
  text,date,timestamptz,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,
  text,text,text,text,text,numeric,numeric,numeric,text,text,text,uuid,text,text,numeric
) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_dmt_business_txn_multi_collection(
  text,date,timestamptz,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,
  text,text,text,text,text,numeric,numeric,numeric,text,text,uuid,text,text,numeric,jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_dmt_business_txn_multi_collection(
  text,date,timestamptz,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,
  text,text,text,text,text,numeric,numeric,numeric,text,text,uuid,text,text,numeric,jsonb
) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.edit_bill_payment(
  uuid,uuid,text,text,numeric,numeric,numeric,text,uuid,text,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_bill_payment(
  uuid,uuid,text,text,numeric,numeric,numeric,text,uuid,text,text
) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_recharge(
  uuid,uuid,date,timestamptz,uuid,text,text,text,numeric,text,uuid,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_recharge(
  uuid,uuid,date,timestamptz,uuid,text,text,text,numeric,text,uuid,text
) TO authenticated, service_role;

COMMENT ON TABLE public.transactions IS
  'Financial mutation authority is server-side; client roles are read-only.';
COMMENT ON TABLE public.cash_entries IS
  'Append-only financial money trail; client roles are read-only.';
COMMENT ON TABLE public.customer_ledger IS
  'Append-only customer financial ledger; client roles are read-only.';
COMMENT ON TABLE public.journal_entries IS
  'General Ledger header; client roles are read-only.';
COMMENT ON TABLE public.journal_lines IS
  'General Ledger lines; client roles are read-only.';

COMMIT;
