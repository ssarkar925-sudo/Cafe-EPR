-- Migration: 20260919_repair_aeps_provider_credits_and_split_instruments.sql
-- 1. Idempotently repairs missing AEPS provider-credit cash entries for AEP-0098, AEP-0103, AEP-0105, AEP-0119.
-- 2. Idempotently repairs split payment allocations and cash entries with null instrument_id.
-- 3. Hardens business transaction RPCs to resolve 'aeps_portal' and 'dmt_portal' payment instruments.

BEGIN;

-- Top-level transaction authorization for ledger repairs
SELECT set_config('erp.internal_cash_mutation_authorized', 'on', true);
SELECT set_config('erp.financial_edit_in_progress', 'on', true);

-- ============================================================================
-- PART 1: Historical Repair for AEP-0098, AEP-0103, AEP-0105, AEP-0119
-- ============================================================================
DO $$
DECLARE
  v_txn RECORD;
  v_portal_inst_id UUID;
  v_credit_amount NUMERIC;
  v_repaired_count INTEGER := 0;
BEGIN
  PERFORM set_config('erp.internal_cash_mutation_authorized', 'on', true);
  PERFORM set_config('erp.financial_edit_in_progress', 'on', true);

  FOR v_txn IN
    SELECT t.*
    FROM public.transactions t
    WHERE t.transaction_number IN ('AEP-0098', 'AEP-0103', 'AEP-0105', 'AEP-0119')
      AND t.status = 'success'
    ORDER BY t.transaction_date ASC, t.id ASC
  LOOP
    -- 1. Ensure pool_credit is populated on the transaction record if missing
    v_credit_amount := COALESCE(v_txn.pool_credit, v_txn.amount + COALESCE(v_txn.portal_commission, 0));
    IF v_txn.pool_credit IS NULL OR v_txn.pool_credit = 0 THEN
      UPDATE public.transactions
      SET pool_credit = v_credit_amount,
          pool_credit_type = 'aeps',
          updated_at = NOW()
      WHERE id = v_txn.id;
    END IF;

    -- 2. Check if float credit cash entry already exists
    IF NOT EXISTS (
      SELECT 1 FROM public.cash_entries
      WHERE ref_type = 'transaction'
        AND ref_id = v_txn.id
        AND direction = 'in'
        AND lower(method) IN ('aeps', 'aeps_portal')
    ) THEN
      -- Resolve portal instrument from aeps_portals
      v_portal_inst_id := NULL;
      IF v_txn.portal_id IS NOT NULL THEN
        SELECT payment_instrument_id INTO v_portal_inst_id
        FROM public.aeps_portals
        WHERE id = v_txn.portal_id;
      END IF;

      -- If not linked via portal_id, resolve from active aeps_portal/aeps instrument
      IF v_portal_inst_id IS NULL THEN
        SELECT id INTO v_portal_inst_id
        FROM public.payment_instruments
        WHERE is_active = true
          AND lower(type) IN ('aeps_portal', 'aeps')
        ORDER BY created_at ASC, id ASC
        LIMIT 1;
      END IF;

      IF v_portal_inst_id IS NOT NULL AND v_credit_amount > 0 THEN
        INSERT INTO public.cash_entries (
          entry_date,
          method,
          direction,
          amount,
          description,
          ref_type,
          ref_id,
          instrument_id
        ) VALUES (
          COALESCE(v_txn.transaction_date, CURRENT_DATE),
          'aeps',
          'in',
          v_credit_amount,
          'AEPS ' || v_txn.transaction_number || ' float credited [Historical Repair]',
          'transaction',
          v_txn.id,
          v_portal_inst_id
        );
        v_repaired_count := v_repaired_count + 1;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Repaired % missing AEPS provider credit entries', v_repaired_count;
END $$;


-- ============================================================================
-- PART 2: Historical Repair for Split Allocations with NULL instrument_id
-- ============================================================================
DO $$
DECLARE
  v_txn RECORD;
  v_new_allocs JSONB;
  v_item JSONB;
  v_method TEXT;
  v_inst UUID;
  v_default_cash UUID;
  v_default_upi UUID;
  v_default_bank UUID;
  v_default_wallet UUID;
  v_default_card UUID;
  v_default_aeps UUID;
  v_default_dmt UUID;
  v_repaired_allocs BOOLEAN;
  v_tx_count INTEGER := 0;
BEGIN
  PERFORM set_config('erp.internal_cash_mutation_authorized', 'on', true);
  PERFORM set_config('erp.financial_edit_in_progress', 'on', true);

  -- Resolve default active instruments deterministically
  SELECT id INTO v_default_cash FROM public.payment_instruments WHERE is_active = true AND lower(type) = 'cash' ORDER BY created_at ASC, id ASC LIMIT 1;
  SELECT id INTO v_default_upi FROM public.payment_instruments WHERE is_active = true AND lower(type) IN ('upi_qr', 'upi') ORDER BY created_at ASC, id ASC LIMIT 1;
  SELECT id INTO v_default_bank FROM public.payment_instruments WHERE is_active = true AND lower(type) = 'bank' ORDER BY created_at ASC, id ASC LIMIT 1;
  SELECT id INTO v_default_wallet FROM public.payment_instruments WHERE is_active = true AND lower(type) = 'wallet' ORDER BY created_at ASC, id ASC LIMIT 1;
  SELECT id INTO v_default_card FROM public.payment_instruments WHERE is_active = true AND lower(type) IN ('credit_card', 'debit_card') ORDER BY created_at ASC, id ASC LIMIT 1;
  IF v_default_card IS NULL THEN v_default_card := v_default_bank; END IF;

  SELECT id INTO v_default_aeps FROM public.payment_instruments WHERE is_active = true AND lower(type) IN ('aeps_portal', 'aeps') ORDER BY created_at ASC, id ASC LIMIT 1;
  SELECT id INTO v_default_dmt FROM public.payment_instruments WHERE is_active = true AND lower(type) IN ('dmt_portal', 'dmt') ORDER BY created_at ASC, id ASC LIMIT 1;

  FOR v_txn IN
    SELECT t.id, t.transaction_number, t.customer_payment_allocations, t.customer_collection_instrument_id
    FROM public.transactions t
    WHERE jsonb_typeof(t.customer_payment_allocations) = 'array'
      AND jsonb_array_length(t.customer_payment_allocations) > 0
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(t.customer_payment_allocations) a
        WHERE nullif(btrim(a->>'instrument_id'), '') IS NULL
           OR lower(btrim(a->>'instrument_id')) = 'null'
      )
    ORDER BY t.transaction_date ASC, t.id ASC
  LOOP
    v_new_allocs := '[]'::jsonb;
    v_repaired_allocs := false;

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_txn.customer_payment_allocations) LOOP
      v_method := lower(COALESCE(nullif(btrim(v_item->>'method'), ''), 'cash'));
      IF v_method IN ('qr', 'upi_qr') THEN v_method := 'upi'; END IF;
      IF v_method = 'card' THEN v_method := 'credit_card'; END IF;

      v_inst := nullif(btrim(v_item->>'instrument_id'), '')::uuid;
      IF v_inst IS NULL OR lower(btrim(v_item->>'instrument_id')) = 'null' THEN
        v_repaired_allocs := true;
        IF v_txn.customer_collection_instrument_id IS NOT NULL AND jsonb_array_length(v_txn.customer_payment_allocations) = 1 THEN
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
        ELSE
          v_inst := COALESCE(v_default_cash, v_default_bank);
        END IF;
      END IF;

      v_new_allocs := v_new_allocs || jsonb_build_array(
        jsonb_build_object(
          'method', v_method,
          'amount', round(COALESCE((v_item->>'amount')::numeric, 0), 2),
          'instrument_id', v_inst
        )
      );
    END LOOP;

    IF v_repaired_allocs THEN
      UPDATE public.transactions
      SET customer_payment_allocations = v_new_allocs,
          customer_collection_instrument_id = COALESCE(customer_collection_instrument_id, (v_new_allocs->0->>'instrument_id')::uuid),
          updated_at = NOW()
      WHERE id = v_txn.id;

      v_tx_count := v_tx_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Repaired % transactions with null allocation instrument IDs', v_tx_count;

  -- Also repair any existing customer collection cash_entries with instrument_id IS NULL
  UPDATE public.cash_entries ce
  SET instrument_id = CASE
    WHEN lower(ce.method) = 'cash' THEN v_default_cash
    WHEN lower(ce.method) IN ('upi', 'upi_qr', 'qr') THEN v_default_upi
    WHEN lower(ce.method) = 'bank' THEN v_default_bank
    WHEN lower(ce.method) = 'wallet' THEN v_default_wallet
    WHEN lower(ce.method) IN ('card', 'credit_card', 'debit_card') THEN v_default_card
    WHEN lower(ce.method) IN ('aeps', 'aeps_portal') THEN COALESCE(
      (SELECT ap.payment_instrument_id FROM public.aeps_portals ap JOIN public.transactions t ON t.id = ce.ref_id WHERE ap.id = t.portal_id AND ap.payment_instrument_id IS NOT NULL LIMIT 1),
      v_default_aeps
    )
    WHEN lower(ce.method) IN ('dmt', 'dmt_portal') THEN COALESCE(
      (SELECT ap.payment_instrument_id FROM public.aeps_portals ap JOIN public.transactions t ON t.id = ce.ref_id WHERE ap.id = t.portal_id AND ap.payment_instrument_id IS NOT NULL LIMIT 1),
      v_default_dmt
    )
    ELSE COALESCE(v_default_cash, v_default_bank)
  END
  WHERE ce.ref_type = 'transaction'
    AND ce.direction = 'in'
    AND ce.instrument_id IS NULL;

END $$;


-- ============================================================================
-- PART 3: RPC Hardening - Resolve 'aeps_portal' and 'dmt_portal' in create/update_business_txn
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
      RAISE NOTICE 'Updated % (%) to support aeps_portal/dmt_portal types', v_proc.proname, v_proc.args;
    END IF;
  END LOOP;
END $$;

COMMIT;
