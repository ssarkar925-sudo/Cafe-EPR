-- Migration: 20260920_harden_portal_instrument_type_resolution.sql
-- Normalize legacy AEPS/DMT instrument-type predicates in affected RPCs.

BEGIN;

SELECT set_config('erp.internal_cash_mutation_authorized', 'on', true);
SELECT set_config('erp.financial_edit_in_progress', 'on', true);

DO $$
DECLARE
  v_proc RECORD;
  v_def TEXT;
  v_new_def TEXT;
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

    -- Match stored function formatting case-insensitively and tolerate spacing.
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

    IF v_new_def <> v_def THEN
      EXECUTE v_new_def;
      RAISE NOTICE 'Hardened % (%)', v_proc.proname, v_proc.args;
    END IF;
  END LOOP;
END $$;

COMMIT;
