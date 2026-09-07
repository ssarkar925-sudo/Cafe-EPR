-- 20260907_17_lock_internal_dmt_overloads.sql
-- The application routes DMT creation through the canonical create_business_txn
-- RPC. The legacy/direct DMT mutation overloads are not referenced by the
-- repository and must not remain client-callable.

BEGIN;

DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('create_dmt_business_txn','create_dmt_business_txn_multi_collection')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres, service_role', r.sig);
  END LOOP;
END
$do$;

COMMIT;
