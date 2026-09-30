-- 20260930 safe performance cleanup
-- Removes only proven-redundant indexes and redundant permissive RLS
-- overlap. Runtime authorization semantics are preserved.
--
-- Intentionally NOT removing workload-sensitive unused indexes.

BEGIN;

-- 1) Exact duplicate indexes: keep the more descriptive / active copy.
DROP INDEX IF EXISTS public.aeps_portal_collection_runs_portal_idx;
DROP INDEX IF EXISTS public.idx_invoices_edited_from;

-- 2) bill_payment_commission_config:
--    the FOR ALL backoffice policy already grants SELECT to the same audience.
DROP POLICY IF EXISTS "bill commission config backoffice read"
  ON public.bill_payment_commission_config;

-- 3) Catalog tables:
--    replace FOR ALL backoffice/admin write policies with explicit
--    INSERT/UPDATE/DELETE policies so SELECT is handled only by the
--    authenticated read policy.
DO $$
DECLARE
  t text;
  p text;
BEGIN
  FOREACH t IN ARRAY ARRAY['brands','categories','products','services','units']
  LOOP
    p := t || '_write_backoffice';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
       WITH CHECK (is_back_office() OR is_admin())',
      t || '_insert_backoffice', t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
       USING (is_back_office() OR is_admin())
       WITH CHECK (is_back_office() OR is_admin())',
      t || '_update_backoffice', t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
       USING (is_back_office() OR is_admin())',
      t || '_delete_backoffice', t
    );
  END LOOP;
END
$$;

-- 4) transactions:
--    "insert denied" was a PERMISSIVE policy with WITH CHECK (false).
--    Such a policy does not deny a row when another permissive INSERT
--    policy allows it; removing it preserves the effective authorization
--    while eliminating the redundant policy evaluation.
DROP POLICY IF EXISTS "transactions insert denied" ON public.transactions;

COMMIT;
