-- 20260907_13_enforce_idempotent_financial_boundary.sql
-- Final ACL hardening for financial mutations.
-- Legacy non-idempotent overloads remain available only to trusted server roles.
-- The client-facing overloads must carry p_idempotency_key.

BEGIN;

-- Trigger-only implementation helper: never directly exposed through PostgREST.
REVOKE EXECUTE ON FUNCTION public.trg_enforce_idempotency_immutability() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_enforce_idempotency_immutability() TO postgres, service_role;

-- The table contains financial request coordination data; anonymous clients have no
-- legitimate reason to write purchase-return records directly.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.purchase_returns FROM anon;

DO $do$
DECLARE
  r record;
  v_has_idempotency boolean;
BEGIN
  FOR r IN
    SELECT
      p.oid,
      p.oid::regprocedure::text AS sig,
      p.proargnames
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN (
        'create_sale',
        'record_quick_sale',
        'create_business_txn',
        'create_recharge',
        'record_invoice_payment',
        'record_invoice_multi_payment',
        'cancel_invoice',
        'cancel_quick_sale',
        'reverse_business_txn',
        'edit_bill_payment',
        'update_recharge',
        'edit_invoice',
        'update_business_txn',
        'record_advance',
        'return_advance',
        'process_return',
        'cancel_expense',
        'set_opening_balance',
        'record_customer_multi_payment'
      )
  LOOP
    v_has_idempotency := coalesce('p_idempotency_key' = ANY(r.proargnames), false);

    IF NOT v_has_idempotency THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres, service_role', r.sig);
    END IF;
  END LOOP;
END
$do$;

COMMIT;
