-- ============================================================================
-- G5 EXIT GATE — fails (RAISE EXCEPTION, nonzero exit) on any mismatch.
-- Requires: G0-G4 applied. Run with ON_ERROR_STOP=1. Local test DB only.
-- All gate service calls collect (linked claim) so teardown is complete.
-- Ends with teardown of its own rows for later regressions.
-- ============================================================================

SELECT id AS g5t FROM public.tenants
WHERE name = 'CyberCafe & Digital Services ERP' LIMIT 1 \gset
SELECT set_config('g5.tenant', :'g5t', false);

DO $$
BEGIN
  DELETE FROM public.payment_claims
  WHERE service_transaction_id IS NOT NULL
    AND tenant_id = (SELECT current_setting('g5.tenant'))::uuid;
  DELETE FROM public.service_transactions
  WHERE tenant_id = (SELECT current_setting('g5.tenant'))::uuid;
  DELETE FROM public.idempotency_keys WHERE key LIKE 'g5-%';
END
$$;

-- cash instrument for collections
DO $$
DECLARE v_cash uuid;
BEGIN
  SELECT id INTO v_cash FROM public.payment_instruments
  WHERE tenant_id = (SELECT current_setting('g5.tenant'))::uuid
    AND itype = 'cash' AND is_active LIMIT 1;
  PERFORM set_config('g5.cash', v_cash::text, false);
END
$$;

-- --------------------------------------------------------------------------
-- 1. Per-type happy paths (cashier records; all collect via cash)
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SET request.jwt.claim.tenant_id = :'g5t';
DO $$
DECLARE
  r jsonb;
BEGIN
  r := public.record_service_txn('aeps', CURRENT_DATE, 2000, 15, 6,
    jsonb_build_object('aadhaar_last4','1234','aeps_txn_type','cash_out',
      'bank_ref','G5BANK','portal_ref','G5PORTAL'),
    'cash', (SELECT current_setting('g5.cash'))::uuid, 'g5-aeps-1');
  PERFORM set_config('g5.aeps', (r->>'id'), false);

  r := public.record_service_txn('dmt', CURRENT_DATE, 5000, 50, 0,
    jsonb_build_object('sender_name','Gate Sender','sender_mobile','9000000001',
      'beneficiary_name','Gate Ben','beneficiary_mobile','9000000002',
      'beneficiary_bank','Gate Bank','beneficiary_ifsc','GATE0001',
      'beneficiary_account','123456789012','transfer_method','bank_account'),
    'cash', (SELECT current_setting('g5.cash'))::uuid, 'g5-dmt-1');
  PERFORM set_config('g5.dmt', (r->>'id'), false);

  r := public.record_service_txn('upi', CURRENT_DATE, 1500, 0, 0,
    jsonb_build_object('upi_id','gatepayer@upi','merchant_qr_ref','G5QR1'),
    'cash', (SELECT current_setting('g5.cash'))::uuid, 'g5-upi-1');
  PERFORM set_config('g5.upi', (r->>'id'), false);

  r := public.record_service_txn('recharge', CURRENT_DATE, 299, 0, 5,
    jsonb_build_object('provider_ref','G5TELCO','receiver_number','9000000003',
      'plan_ref','G5PLAN'),
    'cash', (SELECT current_setting('g5.cash'))::uuid, 'g5-rech-1');
  PERFORM set_config('g5.rech', (r->>'id'), false);

  r := public.record_service_txn('bbps', CURRENT_DATE, 1250, 20, 0,
    jsonb_build_object('biller_ref','G5ELEC','consumer_number','C1234567890',
      'bill_amount', 1230),
    'cash', (SELECT current_setting('g5.cash'))::uuid, 'g5-bbps-1');
  PERFORM set_config('g5.bbps', (r->>'id'), false);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- verify all five: recorded state, SRV- numbers, linked claims
DO $$
DECLARE
  v_ids uuid[]; v_id uuid; v_st text; v_num text; v_cl uuid;
BEGIN
  v_ids := ARRAY[
    (SELECT current_setting('g5.aeps'))::uuid,
    (SELECT current_setting('g5.dmt'))::uuid,
    (SELECT current_setting('g5.upi'))::uuid,
    (SELECT current_setting('g5.rech'))::uuid,
    (SELECT current_setting('g5.bbps'))::uuid];
  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT status, transaction_number INTO v_st, v_num
    FROM public.service_transactions WHERE id = v_id;
    IF v_st <> 'recorded' THEN RAISE EXCEPTION 'not recorded: %', v_id; END IF;
    IF v_num IS NULL OR v_num NOT LIKE 'SRV-%' THEN
      RAISE EXCEPTION 'bad number %', v_num;
    END IF;
    SELECT id INTO v_cl FROM public.payment_claims
    WHERE service_transaction_id = v_id;
    IF v_cl IS NULL THEN RAISE EXCEPTION 'claim link missing for %', v_id; END IF;
  END LOOP;
END
$$;

-- --------------------------------------------------------------------------
-- 2. Required-field + value rejections (representative per type)
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SET request.jwt.claim.tenant_id = :'g5t';
DO $$
BEGIN
  BEGIN
    PERFORM public.record_service_txn('aeps', CURRENT_DATE, 100, 0, 0,
      jsonb_build_object('aadhaar_last4','12','aeps_txn_type','cash_out'),
      'cash', (SELECT current_setting('g5.cash'))::uuid, 'g5-e1');
    RAISE EXCEPTION 'bad aadhaar was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'bad aadhaar was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_service_txn('aeps', CURRENT_DATE, 100, 0, 0,
      jsonb_build_object('aadhaar_last4','1234'),
      'cash', (SELECT current_setting('g5.cash'))::uuid, 'g5-e2');
    RAISE EXCEPTION 'missing txn_type was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'missing txn_type was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_service_txn('dmt', CURRENT_DATE, 100, 0, 0,
      jsonb_build_object('sender_name','X'),
      'cash', (SELECT current_setting('g5.cash'))::uuid, 'g5-e3');
    RAISE EXCEPTION 'incomplete dmt was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'incomplete dmt was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_service_txn('upi', CURRENT_DATE, 100, 0, 0,
      jsonb_build_object('merchant_qr_ref','Q'),
      'cash', (SELECT current_setting('g5.cash'))::uuid, 'g5-e4');
    RAISE EXCEPTION 'upi without id was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'upi without id was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_service_txn('recharge', CURRENT_DATE, 100, 0, 0,
      jsonb_build_object('receiver_number','9000000009'),
      'cash', (SELECT current_setting('g5.cash'))::uuid, 'g5-e5');
    RAISE EXCEPTION 'provider-less recharge was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'provider-less recharge was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_service_txn('bbps', CURRENT_DATE, 100, 0, 0,
      jsonb_build_object('biller_ref','B'),
      'cash', (SELECT current_setting('g5.cash'))::uuid, 'g5-e6');
    RAISE EXCEPTION 'consumer-less bbps was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'consumer-less bbps was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_service_txn('bbps', CURRENT_DATE, 100, 0, 0,
      jsonb_build_object('biller_ref','B','consumer_number','C','bill_amount',-5),
      'cash', (SELECT current_setting('g5.cash'))::uuid, 'g5-e7');
    RAISE EXCEPTION 'negative bill was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'negative bill was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_service_txn('carrier-pigeon', CURRENT_DATE, 100, 0, 0,
      '{}'::jsonb, 'cash', (SELECT current_setting('g5.cash'))::uuid, 'g5-e8');
    RAISE EXCEPTION 'bad service type was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'bad service type was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_service_txn('upi', CURRENT_DATE, 100, 0, 0,
      jsonb_build_object('upi_id','x@y','merchant_qr_ref','Q'),
      'cash', NULL, 'g5-e9');
    RAISE EXCEPTION 'half collection was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'half collection was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_service_txn('upi', CURRENT_DATE, 100, 0, 0,
      jsonb_build_object('upi_id','x@y','merchant_qr_ref','Q'),
      'cash', '99999999-9999-9999-9999-999999999999', 'g5-e10');
    RAISE EXCEPTION 'bad instrument was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'bad instrument was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 3. BBPS frozen-field compliance + sensitive-data denylist
-- --------------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'service_transactions'
    AND column_name NOT IN ('id','tenant_id','service_type','client_uuid',
      'idempotency_key','transaction_number','transaction_date','amount',
      'fee','commission','status','reverses','reversed_by',
      'recorded_by_profile','recorded_at','aadhaar_last4','bank_ref',
      'portal_ref','aeps_txn_type','sender_name','sender_mobile',
      'beneficiary_name','beneficiary_mobile','beneficiary_bank',
      'beneficiary_ifsc','beneficiary_account','transfer_method','upi_id',
      'merchant_qr_ref','provider_ref','receiver_number','plan_ref',
      'biller_ref','consumer_number','bill_amount','created_at','updated_at');
  IF n <> 0 THEN RAISE EXCEPTION '% non-frozen columns present', n; END IF;

  SELECT count(*) INTO n FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'service_transactions'
    AND column_name ~* '(card_number|^pin$|mpin|[^4]aadhaar|otp|cvv|password|secret|credential|api_key|full_account)';
  IF n <> 0 THEN RAISE EXCEPTION '% prohibited sensitive columns', n; END IF;
END
$$;

-- --------------------------------------------------------------------------
-- 4. RLS: cross-tenant invisibility; direct DML denied
-- --------------------------------------------------------------------------
DO $$
DECLARE v_b uuid; v_bprof uuid;
BEGIN
  SELECT id INTO v_b FROM public.tenants WHERE name = 'Gate Probe Tenant';
  SELECT id INTO v_bprof FROM public.profiles
  WHERE user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  INSERT INTO public.service_transactions
    (tenant_id, service_type, client_uuid, transaction_number,
     transaction_date, amount, recorded_by_profile,
     upi_id, merchant_qr_ref)
  VALUES (v_b, 'upi', gen_random_uuid(), 'SRV-B-1', CURRENT_DATE, 10,
    v_bprof, 'b@upi', 'QB')
  ON CONFLICT DO NOTHING;
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g5t';
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM public.service_transactions LOOP
    IF r.tenant_id::text <> current_setting('request.jwt.claim.tenant_id') THEN
      RAISE EXCEPTION 'staff sees foreign service row';
    END IF;
  END LOOP;
  BEGIN
    INSERT INTO public.service_transactions (tenant_id, service_type, client_uuid,
      transaction_number, transaction_date, amount, recorded_by_profile,
      upi_id, merchant_qr_ref)
    VALUES (current_setting('request.jwt.claim.tenant_id')::uuid, 'upi',
      gen_random_uuid(), 'SRV-X', CURRENT_DATE, 1,
      (SELECT id FROM public.profiles WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
      'x@y', 'Q');
    RAISE EXCEPTION 'staff service insert was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.service_transactions SET amount = amount
    WHERE transaction_number LIKE 'SRV-%';
    RAISE EXCEPTION 'staff service update was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.service_transactions
    WHERE transaction_number LIKE 'SRV-%';
    RAISE EXCEPTION 'staff service delete was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 5. Idempotent replay: same key, different payload -> identical result
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SET request.jwt.claim.tenant_id = :'g5t';
DO $$
DECLARE a jsonb; b jsonb; n integer;
BEGIN
  a := public.record_service_txn('upi', CURRENT_DATE, 111, 0, 0,
    jsonb_build_object('upi_id','r@upi','merchant_qr_ref','QR'),
    'cash', (SELECT current_setting('g5.cash'))::uuid, 'g5-replay-1');
  b := public.record_service_txn('upi', CURRENT_DATE, 999, 0, 0,
    jsonb_build_object('upi_id','other@upi','merchant_qr_ref','QR2'),
    'cash', (SELECT current_setting('g5.cash'))::uuid, 'g5-replay-1');
  IF (a->>'id') <> (b->>'id') THEN RAISE EXCEPTION 'service replay diverged'; END IF;
  SELECT count(*) INTO n FROM public.service_transactions
  WHERE idempotency_key = 'g5-replay-1';
  IF n <> 1 THEN RAISE EXCEPTION 'service replay duplicated: %', n; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 6. Reversal: back-office ok with links; double + staff denied
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g5t';
DO $$
DECLARE v_new jsonb; v_old_status text; v_link uuid;
BEGIN
  v_new := public.reverse_service_txn(
    (SELECT current_setting('g5.aeps'))::uuid, 'g5-rev-1');
  SELECT status INTO v_old_status FROM public.service_transactions
  WHERE id = (SELECT current_setting('g5.aeps'))::uuid;
  IF v_old_status <> 'reversed' THEN RAISE EXCEPTION 'original not reversed'; END IF;
  SELECT reverses INTO v_link FROM public.service_transactions
  WHERE id = (v_new->>'id')::uuid;
  IF v_link::text <> current_setting('g5.aeps') THEN
    RAISE EXCEPTION 'reversal link broken';
  END IF;
  BEGIN
    PERFORM public.reverse_service_txn(
      (SELECT current_setting('g5.aeps'))::uuid, 'g5-rev-2');
    RAISE EXCEPTION 'double reverse was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'double reverse was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g5t';
DO $$
BEGIN
  BEGIN
    PERFORM public.reverse_service_txn(
      (SELECT current_setting('g5.bbps'))::uuid, 'g5-rev-3');
    RAISE EXCEPTION 'staff reverse was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff reverse was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 7. Uniform-path linkage: recognize the linked claim end-to-end (to journals)
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g5t';
DO $$
DECLARE v_claim uuid; v_state text;
BEGIN
  SELECT id INTO v_claim FROM public.payment_claims
  WHERE service_transaction_id = (SELECT current_setting('g5.bbps'))::uuid;
  IF v_claim IS NULL THEN RAISE EXCEPTION 'BBPS claim link missing'; END IF;
  PERFORM public.recognize_claim(v_claim, 'g5-bbps-rec-1');
  SELECT claim_state INTO v_state FROM public.payment_claims WHERE id = v_claim;
  IF v_state <> 'recognized' THEN RAISE EXCEPTION 'claim not recognized'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 8. Teardown own rows (keeps later regressions green)
-- --------------------------------------------------------------------------
DO $$
BEGIN
  DELETE FROM public.collection_allocations WHERE claim_id IN
    (SELECT id FROM public.payment_claims
     WHERE service_transaction_id IS NOT NULL
       AND tenant_id = (SELECT current_setting('g5.tenant'))::uuid);
  DELETE FROM public.payment_claims
  WHERE service_transaction_id IS NOT NULL
    AND tenant_id = (SELECT current_setting('g5.tenant'))::uuid;
  DELETE FROM public.service_transactions
  WHERE tenant_id = (SELECT current_setting('g5.tenant'))::uuid
    AND transaction_number LIKE 'SRV-%';
  DELETE FROM public.idempotency_keys WHERE key LIKE 'g5-%';
END
$$;

SELECT 'G5_GATE_ALL_GREEN' AS gate_result;
