-- Migration: 20260919_repair_aeps_provider_credits_and_split_instruments.sql
-- Safe, idempotent financial repair. Apply to staging only after a fresh backup.

BEGIN;

SELECT set_config('erp.internal_cash_mutation_authorized', 'on', true);
SELECT set_config('erp.financial_edit_in_progress', 'on', true);

-- ============================================================================
-- PART 1: Repair the four known AEPS provider-credit entries
-- ============================================================================
DO $$
DECLARE
  v_txn RECORD;
  v_portal_inst_id UUID;
  v_credit_amount NUMERIC;
  v_repaired_count INTEGER := 0;
BEGIN
  FOR v_txn IN
    SELECT t.*
    FROM public.transactions t
    WHERE t.transaction_number IN ('AEP-0098', 'AEP-0103', 'AEP-0105', 'AEP-0119')
      AND t.status = 'success'
    ORDER BY t.transaction_date ASC, t.id ASC
  LOOP
    v_credit_amount := COALESCE(v_txn.pool_credit, v_txn.amount + COALESCE(v_txn.portal_commission, 0));

    IF v_txn.pool_credit IS NULL OR v_txn.pool_credit = 0 THEN
      UPDATE public.transactions
      SET pool_credit = v_credit_amount,
          pool_credit_type = 'aeps',
          updated_at = NOW()
      WHERE id = v_txn.id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.cash_entries ce
      WHERE ce.ref_type = 'transaction'
        AND ce.ref_id = v_txn.id
        AND ce.direction = 'in'
        AND lower(COALESCE(ce.method, '')) IN ('aeps', 'aeps_portal')
    ) THEN
      v_portal_inst_id := NULL;

      IF v_txn.portal_id IS NOT NULL THEN
        SELECT ap.payment_instrument_id
        INTO v_portal_inst_id
        FROM public.aeps_portals ap
        WHERE ap.id = v_txn.portal_id;
      END IF;

      IF v_portal_inst_id IS NULL THEN
        SELECT pi.id
        INTO v_portal_inst_id
        FROM public.payment_instruments pi
        WHERE pi.is_active = true
          AND lower(pi.type) IN ('aeps_portal', 'aeps')
        ORDER BY pi.created_at ASC, pi.id ASC
        LIMIT 1;
      END IF;

      IF v_portal_inst_id IS NULL THEN
        RAISE EXCEPTION 'AEPS repair blocked: no active AEPS payment instrument for transaction %', v_txn.transaction_number;
      END IF;

      IF v_credit_amount <= 0 THEN
        RAISE EXCEPTION 'AEPS repair blocked: non-positive credit amount for transaction %', v_txn.transaction_number;
      END IF;

      INSERT INTO public.cash_entries (
        entry_date, method, direction, amount, description,
        ref_type, ref_id, instrument_id
      ) VALUES (
        COALESCE(v_txn.transaction_date, CURRENT_DATE),
        'aeps', 'in', v_credit_amount,
        'AEPS ' || v_txn.transaction_number || ' float credited [Historical Repair]',
        'transaction', v_txn.id, v_portal_inst_id
      );

      v_repaired_count := v_repaired_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Repaired % missing AEPS provider credit entries', v_repaired_count;
END $$;

-- ============================================================================
-- PART 2: Repair NULL allocation instruments without unsafe casts
-- ============================================================================
DO $$
DECLARE
  v_txn RECORD;
  v_new_allocs JSONB;
  v_item JSONB;
  v_method TEXT;
  v_raw_inst TEXT;
  v_raw_amount TEXT;
  v_inst UUID;
  v_default_cash UUID;
  v_default_upi UUID;
  v_default_bank UUID;
  v_default_wallet UUID;
  v_default_card UUID;
  v_repaired_count INTEGER := 0;
BEGIN
  SELECT id INTO v_default_cash FROM public.payment_instruments WHERE is_active = true AND lower(type) = 'cash' ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_default_upi FROM public.payment_instruments WHERE is_active = true AND lower(type) IN ('upi_qr', 'upi') ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_default_bank FROM public.payment_instruments WHERE is_active = true AND lower(type) IN ('bank', 'bank_account', 'current_account', 'savings') ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_default_wallet FROM public.payment_instruments WHERE is_active = true AND lower(type) = 'wallet' ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_default_card FROM public.payment_instruments WHERE is_active = true AND lower(type) IN ('credit_card', 'debit_card', 'card', 'cc') ORDER BY created_at, id LIMIT 1;

  FOR v_txn IN
    SELECT t.id, t.transaction_number, t.customer_payment_allocations, t.customer_collection_instrument_id, t.transaction_date
    FROM public.transactions t
    WHERE jsonb_typeof(t.customer_payment_allocations) = 'array'
      AND jsonb_array_length(t.customer_payment_allocations) > 0
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(t.customer_payment_allocations) a
        WHERE NULLIF(btrim(a->>'instrument_id'), '') IS NULL
           OR lower(btrim(a->>'instrument_id')) = 'null'
      )
    ORDER BY t.transaction_date ASC, t.id ASC
  LOOP
    v_new_allocs := '[]'::jsonb;

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_txn.customer_payment_allocations) LOOP
      v_method := lower(COALESCE(NULLIF(btrim(v_item->>'method'), ''), 'cash'));
      IF v_method IN ('qr', 'upi_qr') THEN v_method := 'upi'; END IF;
      IF v_method = 'card' THEN v_method := 'credit_card'; END IF;

      v_raw_inst := NULLIF(btrim(v_item->>'instrument_id'), '');
      v_inst := NULL;

      IF v_raw_inst IS NOT NULL AND lower(v_raw_inst) <> 'null' THEN
        IF v_raw_inst !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
          RAISE EXCEPTION 'Allocation repair blocked: invalid instrument UUID for transaction %, value %', v_txn.transaction_number, v_raw_inst;
        END IF;
        v_inst := v_raw_inst::uuid;
      ELSE
        IF v_txn.customer_collection_instrument_id IS NOT NULL
           AND jsonb_array_length(v_txn.customer_payment_allocations) = 1 THEN
          v_inst := v_txn.customer_collection_instrument_id;
        ELSIF v_method = 'cash' THEN
          v_inst := v_default_cash;
        ELSIF v_method = 'upi' THEN
          v_inst := v_default_upi;
        ELSIF v_method = 'bank' THEN
          v_inst := v_default_bank;
        ELSIF v_method = 'wallet' THEN
          v_inst := v_default_wallet;
        ELSIF v_method IN ('credit_card', 'debit_card') THEN
          v_inst := v_default_card;
        END IF;

        IF v_inst IS NULL THEN
          RAISE EXCEPTION 'Allocation repair blocked: no active instrument for method % on transaction %', v_method, v_txn.transaction_number;
        END IF;
      END IF;

      v_raw_amount := NULLIF(btrim(v_item->>'amount'), '');
      IF v_raw_amount IS NULL OR lower(v_raw_amount) = 'null' OR v_raw_amount !~ '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$' THEN
        RAISE EXCEPTION 'Allocation repair blocked: invalid amount for transaction %, value %', v_txn.transaction_number, v_raw_amount;
      END IF;

      v_new_allocs := v_new_allocs || jsonb_build_array(
        jsonb_build_object(
          'method', v_method,
          'amount', round(v_raw_amount::numeric, 2),
          'instrument_id', v_inst
        )
      );
    END LOOP;

    UPDATE public.transactions
    SET customer_payment_allocations = v_new_allocs,
        customer_collection_instrument_id = COALESCE(customer_collection_instrument_id, (v_new_allocs->0->>'instrument_id')::uuid),
        updated_at = NOW()
    WHERE id = v_txn.id;

    v_repaired_count := v_repaired_count + 1;
  END LOOP;

  RAISE NOTICE 'Repaired % transactions with NULL allocation instrument IDs', v_repaired_count;
END $$;

-- Only repair incoming transaction cash entries when their method has a known,
-- unambiguous instrument mapping. DMT is intentionally NOT resolved through
-- aeps_portals; no cross-domain table is used as a DMT source.
DO $$
DECLARE
  v_default_cash UUID;
  v_default_upi UUID;
  v_default_bank UUID;
  v_default_wallet UUID;
  v_default_card UUID;
BEGIN
  SELECT id INTO v_default_cash FROM public.payment_instruments WHERE is_active = true AND lower(type) = 'cash' ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_default_upi FROM public.payment_instruments WHERE is_active = true AND lower(type) IN ('upi_qr', 'upi') ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_default_bank FROM public.payment_instruments WHERE is_active = true AND lower(type) IN ('bank', 'bank_account', 'current_account', 'savings') ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_default_wallet FROM public.payment_instruments WHERE is_active = true AND lower(type) = 'wallet' ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_default_card FROM public.payment_instruments WHERE is_active = true AND lower(type) IN ('credit_card', 'debit_card', 'card', 'cc') ORDER BY created_at, id LIMIT 1;

  UPDATE public.cash_entries ce
  SET instrument_id = CASE
    WHEN lower(ce.method) = 'cash' THEN v_default_cash
    WHEN lower(ce.method) IN ('upi', 'upi_qr', 'qr') THEN v_default_upi
    WHEN lower(ce.method) = 'bank' THEN v_default_bank
    WHEN lower(ce.method) = 'wallet' THEN v_default_wallet
    WHEN lower(ce.method) IN ('card', 'credit_card', 'debit_card') THEN v_default_card
    ELSE ce.instrument_id
  END
  WHERE ce.ref_type = 'transaction'
    AND ce.direction = 'in'
    AND ce.instrument_id IS NULL
    AND lower(ce.method) IN ('cash', 'upi', 'upi_qr', 'qr', 'bank', 'wallet', 'card', 'credit_card', 'debit_card');
END $$;

-- ============================================================================
-- PART 3: RPC hardening, limited to exact known text replacements
-- ============================================================================
DO $$
DECLARE
  v_proc RECORD;
  v_def TEXT;
  v_modified BOOLEAN;
BEGIN
  FOR v_proc IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_business_txn', 'update_business_txn')
  LOOP
    v_def := pg_get_functiondef(v_proc.oid);
    v_modified := false;

    IF position('where type = ''aeps'' and is_active = true' in v_def) > 0 THEN
      v_def := replace(v_def, 'where type = ''aeps'' and is_active = true', 'where type in (''aeps_portal'', ''aeps'') and is_active = true');
      v_modified := true;
    END IF;

    IF position('where type = ''dmt'' and is_active = true' in v_def) > 0 THEN
      v_def := replace(v_def, 'where type = ''dmt'' and is_active = true', 'where type in (''dmt_portal'', ''dmt'') and is_active = true');
      v_modified := true;
    END IF;

    IF v_modified THEN
      EXECUTE v_def;
      RAISE NOTICE 'Updated % (%) for portal instrument types', v_proc.proname, v_proc.args;
    END IF;
  END LOOP;
END $$;

COMMIT;
