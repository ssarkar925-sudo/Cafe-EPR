-- Migration: 20260920_harden_portal_instrument_type_resolution.sql
-- Normalize legacy AEPS/DMT instrument-type predicates in affected RPCs.
-- Fail closed if a legacy predicate is detected but cannot be fully removed.

BEGIN;

SELECT set_config('erp.internal_cash_mutation_authorized', 'on', true);
SELECT set_config('erp.financial_edit_in_progress', 'on', true);

DO $body$
DECLARE
  v_proc RECORD;
  v_def TEXT;
  v_new_def TEXT;
  v_legacy_found BOOLEAN;
BEGIN
  FOR v_proc IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_business_txn', 'update_business_txn', 'create_settlement')
  LOOP
    v_def := pg_get_functiondef(v_proc.oid);
    v_new_def := v_def;
    v_legacy_found := v_def ~* $$lower\s*\(\s*type\s*\)\s*=\s*'(aeps|dmt)'$$
      OR v_def ~* $$\btype\s*=\s*'(aeps|dmt)'$$;

    IF NOT v_legacy_found THEN
      CONTINUE;
    END IF;

    v_new_def := regexp_replace(
      v_new_def,
      $$lower\s*\(\s*type\s*\)\s*=\s*'aeps'$$,
      $$lower(type) IN ('aeps_portal', 'aeps')$$,
      'gi'
    );
    v_new_def := regexp_replace(
      v_new_def,
      $$lower\s*\(\s*type\s*\)\s*=\s*'dmt'$$,
      $$lower(type) IN ('dmt_portal', 'dmt')$$,
      'gi'
    );
    v_new_def := regexp_replace(
      v_new_def,
      $$\btype\s*=\s*'aeps'$$,
      $$type IN ('aeps_portal', 'aeps')$$,
      'gi'
    );
    v_new_def := regexp_replace(
      v_new_def,
      $$\btype\s*=\s*'dmt'$$,
      $$type IN ('dmt_portal', 'dmt')$$,
      'gi'
    );

    IF v_new_def = v_def THEN
      RAISE EXCEPTION 'Could not rewrite legacy instrument predicate in %.%', v_proc.proname, v_proc.args;
    END IF;

    IF v_new_def ~* $$lower\s*\(\s*type\s*\)\s*=\s*'(aeps|dmt)'$$
       OR v_new_def ~* $$\btype\s*=\s*'(aeps|dmt)'$$ THEN
      RAISE EXCEPTION 'Legacy instrument predicate remains in %.% after rewrite', v_proc.proname, v_proc.args;
    END IF;

    EXECUTE v_new_def;
    RAISE NOTICE 'Hardened % (%)', v_proc.proname, v_proc.args;
  END LOOP;
END;
$body$;

COMMIT;
