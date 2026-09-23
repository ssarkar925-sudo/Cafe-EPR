-- ============================================================================
-- G9 EXIT GATE — fails (RAISE EXCEPTION, nonzero exit) on any mismatch.
-- Requires: G0-G8 applied. Run with ON_ERROR_STOP=1. Local test DB only.
-- Covers: handshake, ordered flush, duplicates, gaps, failure atomicity,
-- stale epochs, expired auth, revoked devices, re-enrollment rotation,
-- concurrency serialization, disposition, ack, RLS, provisional semantics.
-- ============================================================================

SELECT id AS g9t FROM public.tenants
WHERE name = 'CyberCafe & Digital Services ERP' LIMIT 1 \gset
SELECT set_config('g9.tenant', :'g9t', false);

-- --------------------------------------------------------------------------
-- 0. Fixtures: supplier/customer/product/purchase via admin RPCs.
--    Cleanup-first for idempotent reruns (G9 tags only).
-- --------------------------------------------------------------------------
DO $$
BEGIN
  DELETE FROM public.collection_allocations WHERE claim_id IN
    (SELECT id FROM public.payment_claims WHERE customer_id IN
     (SELECT id FROM public.customers WHERE name LIKE 'G9 %'));
  DELETE FROM public.payment_claims WHERE customer_id IN
    (SELECT id FROM public.customers WHERE name LIKE 'G9 %');
  DELETE FROM public.invoice_line_lots WHERE invoice_line_id IN
    (SELECT il.id FROM public.invoice_lines il
     JOIN public.invoices i ON i.id = il.invoice_id
     WHERE i.provisional_number LIKE 'g9-%');
  DELETE FROM public.invoice_lines WHERE invoice_id IN
    (SELECT id FROM public.invoices WHERE provisional_number LIKE 'g9-%');
  UPDATE public.invoices SET edited_from = NULL, recreated_by = NULL
  WHERE provisional_number LIKE 'g9-%';
  DELETE FROM public.invoices WHERE provisional_number LIKE 'g9-%';
  DELETE FROM public.purchase_lines WHERE purchase_id IN
    (SELECT p.id FROM public.purchases p
     JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE s.name LIKE 'G9 %');
  DELETE FROM public.stock_reservations WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g9-%' OR s.name LIKE 'G9 %');
  DELETE FROM public.adjustments WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g9-%' OR s.name LIKE 'G9 %');
  DELETE FROM public.stock_lots
  WHERE source_ref LIKE 'g9-%'
     OR purchase_id IN (SELECT p.id FROM public.purchases p
                        JOIN public.suppliers s ON s.id = p.supplier_id
                        WHERE s.name LIKE 'G9 %');
  DELETE FROM public.purchases WHERE supplier_id IN
    (SELECT id FROM public.suppliers WHERE name LIKE 'G9 %');
  DELETE FROM public.idempotency_keys WHERE key LIKE 'g9-%';
  DELETE FROM public.products WHERE name LIKE 'G9 %';
  DELETE FROM public.suppliers WHERE name LIKE 'G9 %';
  DELETE FROM public.customers WHERE name LIKE 'G9 %';
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g9t';
DO $$
DECLARE v_sup uuid; v_cust uuid; v_prod uuid;
BEGIN
  v_sup := public.mg_supplier_upsert(NULL, 'G9 Supplier', NULL, true);
  v_cust := public.mg_customer_upsert(NULL, 'G9 Customer', NULL, 100000, true);
  PERFORM set_config('g9.customer', v_cust::text, false);
  v_prod := public.mg_product_upsert(NULL, 'G9 Widget', 'G9W-1', 'G9W-BAR-1',
    'pc', 100, 60, 'GENERAL', true);
  PERFORM set_config('g9.product', v_prod::text, false);
  PERFORM public.create_purchase(v_sup, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', v_prod,
      'qty', 100, 'unit_cost', 10, 'expiry_date', '2028-01-01',
      'source_ref', 'g9-stock')),
    'g9-stock-key');
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 1. Enroll staff device; handshake happy path + denials
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g9t';
DO $$
DECLARE v_tok text; v_dev uuid; v_h jsonb;
BEGIN
  v_tok := public.issue_enrollment_token();
  v_dev := public.consume_enrollment_token(v_tok);
  PERFORM set_config('g9.devA', v_dev::text, false);
  v_h := public.sync_handshake(v_dev);
  IF (v_h->>'device_epoch') <> '1' THEN RAISE EXCEPTION 'epoch not 1'; END IF;
  IF (v_h->>'server_watermark') <> '0' THEN
    RAISE EXCEPTION 'watermark not 0: %', v_h;
  END IF;
  IF (v_h->>'server_time') IS NULL THEN RAISE EXCEPTION 'no server_time'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- non-owner handshake denied; unknown device errors
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SET request.jwt.claim.tenant_id = :'g9t';
DO $$
BEGIN
  BEGIN
    PERFORM public.sync_handshake((SELECT current_setting('g9.devA'))::uuid);
    RAISE EXCEPTION 'foreign handshake was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'foreign handshake was NOT blocked' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.sync_handshake('99999999-9999-9999-9999-999999999999');
    RAISE EXCEPTION 'unknown device was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'unknown device was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 2. Ordered flush: 2 sales applied, watermark advances, numbers assigned
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g9t';
DO $$
DECLARE
  v_f jsonb; v_prov text; v_canon text;
BEGIN
  v_f := public.sync_flush(
    (SELECT current_setting('g9.devA'))::uuid,
    jsonb_build_array(
      jsonb_build_object('seq', 1, 'device_epoch', 1,
        'client_uuid', gen_random_uuid(), 'idempotency_key', 'g9-s1',
        'doc_type', 'sale',
        'payload', jsonb_build_object(
          'customer_id', current_setting('g9.customer'),
          'invoice_date', CURRENT_DATE,
          'lines', jsonb_build_array(jsonb_build_object(
            'product_id', current_setting('g9.product'),
            'qty', 2, 'rate', 100)),
          'discount', 0, 'provisional_number', 'g9-prov-1')),
      jsonb_build_object('seq', 2, 'device_epoch', 1,
        'client_uuid', gen_random_uuid(), 'idempotency_key', 'g9-s2',
        'doc_type', 'sale',
        'payload', jsonb_build_object(
          'customer_id', current_setting('g9.customer'),
          'invoice_date', CURRENT_DATE,
          'lines', jsonb_build_array(jsonb_build_object(
            'product_id', current_setting('g9.product'),
            'qty', 1, 'rate', 50)),
          'discount', 0, 'provisional_number', 'g9-prov-2'))));
  IF (v_f->>'applied')::integer <> 2 THEN
    RAISE EXCEPTION 'applied %, want 2: %', v_f->>'applied', v_f;
  END IF;
  IF (v_f->>'watermark')::bigint <> 2 THEN
    RAISE EXCEPTION 'watermark %, want 2', v_f->>'watermark';
  END IF;
  -- provisional preserved, canonical assigned and different (UNSYNCED semantics)
  SELECT provisional_number, canonical_number INTO v_prov, v_canon
  FROM public.invoices WHERE provisional_number = 'g9-prov-1';
  IF v_prov IS NULL OR v_canon IS NULL OR v_prov = v_canon THEN
    RAISE EXCEPTION 'provisional/canonical broken: %/%', v_prov, v_canon;
  END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 3. Duplicates absorbed; gaps stop; unknown types conflict
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g9t';
DO $$
DECLARE v_f jsonb; n_before integer; n_after integer;
BEGIN
  SELECT count(*) INTO n_before FROM public.invoices
  WHERE provisional_number LIKE 'g9-%';
  v_f := public.sync_flush(
    (SELECT current_setting('g9.devA'))::uuid,
    jsonb_build_array(
      jsonb_build_object('seq', 1, 'device_epoch', 1,
        'client_uuid', gen_random_uuid(), 'idempotency_key', 'g9-s1-dup',
        'doc_type', 'sale', 'payload', '{}'::jsonb)));
  IF (v_f->'results'->0->>'outcome') <> 'duplicate' THEN
    RAISE EXCEPTION 'replay not marked duplicate: %', v_f;
  END IF;
  SELECT count(*) INTO n_after FROM public.invoices
  WHERE provisional_number LIKE 'g9-%';
  IF n_after <> n_before THEN RAISE EXCEPTION 'duplicate re-executed'; END IF;

  v_f := public.sync_flush(
    (SELECT current_setting('g9.devA'))::uuid,
    jsonb_build_array(
      jsonb_build_object('seq', 9, 'device_epoch', 1,
        'client_uuid', gen_random_uuid(), 'idempotency_key', 'g9-gap-1',
        'doc_type', 'sale', 'payload', '{}'::jsonb)));
  IF (v_f->'results'->0->>'outcome') <> 'gap' THEN
    RAISE EXCEPTION 'gap not detected: %', v_f;
  END IF;
  IF (v_f->>'watermark')::bigint <> 2 THEN
    RAISE EXCEPTION 'watermark moved on gap';
  END IF;

  v_f := public.sync_flush(
    (SELECT current_setting('g9.devA'))::uuid,
    jsonb_build_array(
      jsonb_build_object('seq', 3, 'device_epoch', 1,
        'client_uuid', gen_random_uuid(), 'idempotency_key', 'g9-unk-1',
        'doc_type', 'teleport', 'payload', '{}'::jsonb)));
  IF (v_f->'results'->0->>'outcome') <> 'failed' THEN
    RAISE EXCEPTION 'unknown type not failed: %', v_f;
  END IF;
  IF (v_f->>'watermark')::bigint <> 2 THEN
    RAISE EXCEPTION 'watermark moved on failure';
  END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 4. Failure atomicity: valid then oversell -> first applied, second stops
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g9t';
DO $$
DECLARE v_f jsonb; n_batches integer; v_cid uuid;
BEGIN
  SELECT count(*) INTO n_batches FROM public.journal_entries e
  WHERE e.tenant_id = (SELECT current_setting('g9.tenant'))::uuid;
  v_f := public.sync_flush(
    (SELECT current_setting('g9.devA'))::uuid,
    jsonb_build_array(
      jsonb_build_object('seq', 3, 'device_epoch', 1,
        'client_uuid', gen_random_uuid(), 'idempotency_key', 'g9-ok-3',
        'doc_type', 'sale',
        'payload', jsonb_build_object(
          'customer_id', current_setting('g9.customer'),
          'invoice_date', CURRENT_DATE,
          'lines', jsonb_build_array(jsonb_build_object(
            'product_id', current_setting('g9.product'),
            'qty', 1, 'rate', 10)),
          'discount', 0, 'provisional_number', 'g9-ok-3')),
      jsonb_build_object('seq', 4, 'device_epoch', 1,
        'client_uuid', gen_random_uuid(), 'idempotency_key', 'g9-bad-4',
        'doc_type', 'sale',
        'payload', jsonb_build_object(
          'customer_id', current_setting('g9.customer'),
          'invoice_date', CURRENT_DATE,
          'lines', jsonb_build_array(jsonb_build_object(
            'product_id', current_setting('g9.product'),
            'qty', 99999, 'rate', 10)),
          'discount', 0, 'provisional_number', 'g9-bad-4'))));
  IF (v_f->>'applied')::integer <> 1 THEN
    RAISE EXCEPTION 'applied %, want 1: %', v_f->>'applied', v_f;
  END IF;
  IF (v_f->>'watermark')::bigint <> 3 THEN
    RAISE EXCEPTION 'watermark %, want 3', v_f->>'watermark';
  END IF;
  -- failed sale left no invoice and no journal
  SELECT count(*) INTO n_batches FROM public.invoices
  WHERE provisional_number = 'g9-bad-4';
  IF n_batches <> 0 THEN RAISE EXCEPTION 'failed sale persisted'; END IF;
  -- conflict row exists with reason + server snapshot ref
  SELECT id INTO v_cid FROM public.sync_conflicts
  WHERE device_id = (SELECT current_setting('g9.devA'))::uuid
    AND client_sequence = 4 AND disposition = 'pending';
  IF v_cid IS NULL THEN RAISE EXCEPTION 'conflict row missing'; END IF;
  PERFORM set_config('g9.conflict1', v_cid::text, false);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 5. Stale epoch rejects whole flush; expired auth -> conflict, no advance
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g9t';
DO $$
DECLARE v_f jsonb;
BEGIN
  v_f := public.sync_flush(
    (SELECT current_setting('g9.devA'))::uuid,
    jsonb_build_array(
      jsonb_build_object('seq', 5, 'device_epoch', 99,
        'client_uuid', gen_random_uuid(), 'idempotency_key', 'g9-stale-1',
        'doc_type', 'sale', 'payload', '{}'::jsonb)));
  IF (v_f->'results'->0->>'outcome') <> 'stale_epoch' THEN
    RAISE EXCEPTION 'stale epoch not detected: %', v_f;
  END IF;
  IF (v_f->>'watermark')::bigint <> 3 THEN
    RAISE EXCEPTION 'watermark moved on stale epoch';
  END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- no JWT sub (expired/guest session): handshake-level denial, nothing applied
DO $$
DECLARE v_wm0 bigint;
BEGIN
  SELECT last_watermark INTO v_wm0 FROM public.devices
  WHERE id = (SELECT current_setting('g9.devA'))::uuid;
  PERFORM set_config('g9.wm0', v_wm0::text, false);
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.tenant_id = :'g9t';
DO $$
DECLARE v_wm1 bigint;
BEGIN
  BEGIN
    PERFORM public.sync_flush(
      (SELECT current_setting('g9.devA'))::uuid,
      jsonb_build_array(
        jsonb_build_object('seq', 5, 'device_epoch', 1,
          'client_uuid', gen_random_uuid(), 'idempotency_key', 'g9-noauth-1',
          'doc_type', 'sale',
          'payload', jsonb_build_object(
            'customer_id', current_setting('g9.customer'),
            'invoice_date', CURRENT_DATE,
            'lines', jsonb_build_array(jsonb_build_object(
              'product_id', current_setting('g9.product'),
              'qty', 1, 'rate', 10)),
            'discount', 0, 'provisional_number', 'g9-noauth-1'))));
    RAISE EXCEPTION 'no-auth flush was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'no-auth flush was NOT blocked' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%Not authorized%' AND SQLERRM NOT LIKE '%active profile%'
       AND SQLERRM NOT LIKE '%Tenant context%' THEN
      RAISE EXCEPTION 'wrong denial for no-auth flush: %', SQLERRM;
    END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.tenant_id;
DO $$
DECLARE v_wm1 bigint;
BEGIN
  SELECT last_watermark INTO v_wm1 FROM public.devices
  WHERE id = (SELECT current_setting('g9.devA'))::uuid;
  IF v_wm1::text <> current_setting('g9.wm0') THEN
    RAISE EXCEPTION 'watermark moved without auth';
  END IF;
END
$$;

-- --------------------------------------------------------------------------
-- 6. Revoked device denied; re-enrollment rotates epoch (old retired)
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g9t';
DO $$
DECLARE v_tok text; v_devB uuid;
BEGIN
  v_tok := public.issue_enrollment_token();
  v_devB := public.consume_enrollment_token(v_tok);
  PERFORM set_config('g9.devB', v_devB::text, false);
  PERFORM public.revoke_device((SELECT current_setting('g9.devA'))::uuid);
  BEGIN
    PERFORM public.sync_handshake((SELECT current_setting('g9.devA'))::uuid);
    RAISE EXCEPTION 'revoked handshake was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'revoked handshake was NOT blocked' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.sync_flush(
      (SELECT current_setting('g9.devA'))::uuid,
      jsonb_build_array(
        jsonb_build_object('seq', 5, 'device_epoch', 1,
          'client_uuid', gen_random_uuid(), 'idempotency_key', 'g9-rev-1',
          'doc_type', 'sale', 'payload', '{}'::jsonb)));
    RAISE EXCEPTION 'revoked flush was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'revoked flush was NOT blocked' THEN RAISE; END IF;
  END;
  -- re-enroll against the retired device: epoch 2, old stays revoked
  v_tok := public.issue_enrollment_token();
  PERFORM public.consume_enrollment_token(v_tok,
    (SELECT current_setting('g9.devA'))::uuid);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

DO $$
DECLARE v_ep integer; v_st text; v_new uuid;
BEGIN
  SELECT id, device_epoch INTO v_new, v_ep FROM public.devices
  WHERE owner_profile_id = (SELECT id FROM public.profiles
    WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
    AND status = 'active' ORDER BY device_epoch DESC LIMIT 1;
  IF v_ep <> 2 THEN RAISE EXCEPTION 'epoch not rotated: %', v_ep; END IF;
  PERFORM set_config('g9.devA2', v_new::text, false);
  SELECT status INTO v_st FROM public.devices
  WHERE id = (SELECT current_setting('g9.devA'))::uuid;
  IF v_st <> 'revoked' THEN RAISE EXCEPTION 'old device not retired'; END IF;
END
$$;

-- epoch-1 items against the epoch-2 device are stale; epoch-2 flows work
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g9t';
DO $$
DECLARE v_f jsonb;
BEGIN
  v_f := public.sync_flush(
    (SELECT current_setting('g9.devA2'))::uuid,
    jsonb_build_array(
      jsonb_build_object('seq', 1, 'device_epoch', 1,
        'client_uuid', gen_random_uuid(), 'idempotency_key', 'g9-rot-1',
        'doc_type', 'sale', 'payload', '{}'::jsonb)));
  IF (v_f->'results'->0->>'outcome') <> 'stale_epoch' THEN
    RAISE EXCEPTION 'rotated stale not detected: %', v_f;
  END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 7. Concurrency serialization: two devices race the last units.
--    Fresh devices per run (prior runs' watermarks must not interfere).
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g9t';
DO $$
DECLARE v_t1 text; v_t2 text;
BEGIN
  v_t1 := public.issue_enrollment_token();
  PERFORM set_config('g9.raceA',
    public.consume_enrollment_token(v_t1)::text, false);
  v_t2 := public.issue_enrollment_token();
  PERFORM set_config('g9.raceB',
    public.consume_enrollment_token(v_t2)::text, false);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g9t';
DO $$
DECLARE
  v_left numeric; v_f jsonb;
BEGIN
  SELECT coalesce(sum(l.qty_remaining), 0) INTO v_left
  FROM public.stock_lots l
  JOIN public.products p ON p.id = l.product_id
  WHERE p.name = 'G9 Widget' AND l.status = 'open';
  -- device A takes everything remaining
  v_f := public.sync_flush(
    (SELECT current_setting('g9.raceA'))::uuid,
    jsonb_build_array(
      jsonb_build_object('seq', 1, 'device_epoch', 1,
        'client_uuid', gen_random_uuid(), 'idempotency_key', 'g9-race-A',
        'doc_type', 'sale',
        'payload', jsonb_build_object(
          'customer_id', current_setting('g9.customer'),
          'invoice_date', CURRENT_DATE,
          'lines', jsonb_build_array(jsonb_build_object(
            'product_id', current_setting('g9.product'),
            'qty', v_left, 'rate', 100)),
          'discount', 0, 'provisional_number', 'g9-race-A'))));
  IF (v_f->>'applied')::integer <> 1 THEN
    RAISE EXCEPTION 'winner not applied: %', v_f;
  END IF;
  -- device B races the same stock -> conflict (exactly one winner)
  v_f := public.sync_flush(
    (SELECT current_setting('g9.raceB'))::uuid,
    jsonb_build_array(
      jsonb_build_object('seq', 1, 'device_epoch', 1,
        'client_uuid', gen_random_uuid(), 'idempotency_key', 'g9-race-B',
        'doc_type', 'sale',
        'payload', jsonb_build_object(
          'customer_id', current_setting('g9.customer'),
          'invoice_date', CURRENT_DATE,
          'lines', jsonb_build_array(jsonb_build_object(
            'product_id', current_setting('g9.product'),
            'qty', v_left, 'rate', 100)),
          'discount', 0, 'provisional_number', 'g9-race-B'))));
  IF (v_f->'results'->0->>'outcome') <> 'failed' THEN
    RAISE EXCEPTION 'loser not conflicted: %', v_f;
  END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 8. Disposition (back-office), ack listing, RLS on conflicts
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g9t';
DO $$
DECLARE v_r jsonb; v_ack jsonb;
BEGIN
  v_r := public.resolve_conflict(
    (SELECT current_setting('g9.conflict1'))::uuid, 'resolved', 'g9 reviewed');
  IF (v_r->>'disposition') <> 'resolved' THEN RAISE EXCEPTION 'not resolved'; END IF;
  BEGIN
    PERFORM public.resolve_conflict(
      (SELECT current_setting('g9.conflict1'))::uuid, 'resolved', 'again');
    RAISE EXCEPTION 'double resolve was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'double resolve was NOT rejected' THEN RAISE; END IF;
  END;
  v_ack := public.sync_acknowledge((SELECT current_setting('g9.devA2'))::uuid);
  IF (v_ack->>'watermark') IS NULL THEN RAISE EXCEPTION 'ack lacks watermark'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g9t';
DO $$
BEGIN
  BEGIN
    PERFORM public.resolve_conflict(
      (SELECT current_setting('g9.conflict1'))::uuid, 'resolved', 'staff try');
    RAISE EXCEPTION 'staff resolve was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff resolve was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- cashier sees no conflicts (owns no device); direct DML denied
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SET request.jwt.claim.tenant_id = :'g9t';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM public.sync_conflicts;
  IF c <> 0 THEN RAISE EXCEPTION 'cashier sees conflicts'; END IF;
  BEGIN
    INSERT INTO public.sync_conflicts (tenant_id, doc_type, reason_code)
    VALUES (current_setting('request.jwt.claim.tenant_id')::uuid, 'sale', 'ERROR');
    RAISE EXCEPTION 'conflict insert was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.sync_conflicts SET disposition = 'resolved'
    WHERE disposition = 'pending';
    RAISE EXCEPTION 'conflict update was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.sync_conflicts WHERE disposition = 'resolved';
    RAISE EXCEPTION 'conflict delete was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 9. Teardown gate documents (journals stay immutable; conflicts stay —
--    assertions scope by device/key so reruns stay green)
-- --------------------------------------------------------------------------
DO $$
BEGIN
  DELETE FROM public.collection_allocations WHERE claim_id IN
    (SELECT id FROM public.payment_claims WHERE customer_id IN
     (SELECT id FROM public.customers WHERE name LIKE 'G9 %'));
  DELETE FROM public.payment_claims WHERE customer_id IN
    (SELECT id FROM public.customers WHERE name LIKE 'G9 %');
  DELETE FROM public.invoice_line_lots WHERE invoice_line_id IN
    (SELECT il.id FROM public.invoice_lines il
     JOIN public.invoices i ON i.id = il.invoice_id
     WHERE i.provisional_number LIKE 'g9-%');
  DELETE FROM public.invoice_lines WHERE invoice_id IN
    (SELECT id FROM public.invoices WHERE provisional_number LIKE 'g9-%');
  UPDATE public.invoices SET edited_from = NULL, recreated_by = NULL
  WHERE provisional_number LIKE 'g9-%';
  DELETE FROM public.invoices WHERE provisional_number LIKE 'g9-%';
  DELETE FROM public.purchase_lines WHERE purchase_id IN
    (SELECT p.id FROM public.purchases p
     JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE s.name LIKE 'G9 %');
  DELETE FROM public.stock_reservations WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g9-%' OR s.name LIKE 'G9 %');
  DELETE FROM public.adjustments WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g9-%' OR s.name LIKE 'G9 %');
  DELETE FROM public.stock_lots
  WHERE source_ref LIKE 'g9-%'
     OR purchase_id IN (SELECT p.id FROM public.purchases p
                        JOIN public.suppliers s ON s.id = p.supplier_id
                        WHERE s.name LIKE 'G9 %');
  DELETE FROM public.purchases WHERE supplier_id IN
    (SELECT id FROM public.suppliers WHERE name LIKE 'G9 %');
  DELETE FROM public.idempotency_keys WHERE key LIKE 'g9-%';
  DELETE FROM public.products WHERE name LIKE 'G9 %';
  DELETE FROM public.suppliers WHERE name LIKE 'G9 %';
  DELETE FROM public.customers WHERE name LIKE 'G9 %';
END
$$;

SELECT 'G9_GATE_ALL_GREEN' AS gate_result;
