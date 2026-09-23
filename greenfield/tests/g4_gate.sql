-- ============================================================================
-- G4 EXIT GATE — fails (RAISE EXCEPTION, nonzero exit) on any mismatch.
-- Requires: G0-G3 applied. Run with ON_ERROR_STOP=1. Local test DB only.
-- Ends with teardown of its own rows so later regressions stay green.
-- ============================================================================

SELECT id AS g4t FROM public.tenants
WHERE name = 'CyberCafe & Digital Services ERP' LIMIT 1 \gset
SELECT set_config('g4.tenant', :'g4t', false);

-- --------------------------------------------------------------------------
-- 0. Fixtures (admin RPCs): supplier, customer (limit 5000), product,
--    purchase 100 units; one posted invoice for claim linkage
-- --------------------------------------------------------------------------
DO $$
BEGIN
  -- cleanup-first for idempotent reruns (same order discipline as teardown)
  DELETE FROM public.collection_allocations WHERE claim_id IN
    (SELECT id FROM public.payment_claims WHERE customer_id IN
     (SELECT id FROM public.customers WHERE name LIKE 'Gate G4%'));
  DELETE FROM public.payment_claims WHERE customer_id IN
    (SELECT id FROM public.customers WHERE name LIKE 'Gate G4%');
  DELETE FROM public.invoice_line_lots WHERE invoice_line_id IN
    (SELECT il.id FROM public.invoice_lines il
     JOIN public.invoices i ON i.id = il.invoice_id
     WHERE i.provisional_number LIKE 'g4-%');
  DELETE FROM public.invoice_lines WHERE invoice_id IN
    (SELECT id FROM public.invoices WHERE provisional_number LIKE 'g4-%');
  DELETE FROM public.invoices WHERE provisional_number LIKE 'g4-%';
  DELETE FROM public.purchase_lines WHERE purchase_id IN
    (SELECT p.id FROM public.purchases p
     JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE s.name LIKE 'Gate G4%');
  DELETE FROM public.stock_reservations WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g4-%' OR s.name LIKE 'Gate G4%');
  DELETE FROM public.adjustments WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g4-%' OR s.name LIKE 'Gate G4%');
  DELETE FROM public.stock_lots
  WHERE source_ref LIKE 'g4-%'
     OR purchase_id IN (SELECT p.id FROM public.purchases p
                        JOIN public.suppliers s ON s.id = p.supplier_id
                        WHERE s.name LIKE 'Gate G4%');
  DELETE FROM public.purchases WHERE supplier_id IN
    (SELECT id FROM public.suppliers WHERE name LIKE 'Gate G4%');
  DELETE FROM public.idempotency_keys WHERE key LIKE 'g4-%';
  DELETE FROM public.products WHERE name LIKE 'Gate G4%';
  DELETE FROM public.suppliers WHERE name LIKE 'Gate G4%';
  DELETE FROM public.customers WHERE name LIKE 'Gate G4%';
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g4t';
DO $$
DECLARE v_sup uuid; v_cust uuid; v_prod uuid; v_pur jsonb; v_sale jsonb;
BEGIN
  v_sup := public.mg_supplier_upsert(NULL, 'Gate G4 Supplier', NULL, true);
  PERFORM set_config('g4.supplier', v_sup::text, false);
  v_cust := public.mg_customer_upsert(NULL, 'Gate G4 Customer', NULL, 5000, true);
  PERFORM set_config('g4.customer', v_cust::text, false);
  v_prod := public.mg_product_upsert(NULL, 'Gate G4 Widget', 'G4W-1', 'G4W-BAR-1',
    'pc', 100, 60, 'GENERAL', true);
  PERFORM set_config('g4.product', v_prod::text, false);
  v_pur := public.create_purchase(v_sup, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', v_prod,
      'qty', 100, 'unit_cost', 10, 'expiry_date', '2028-01-01',
      'source_ref', 'g4-stock')),
    'g4-stock-key');
  v_sale := public.create_sale(v_cust, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', v_prod,
      'qty', 2, 'rate', 100)), 0, NULL, 'g4-inv-1', 'g4-inv-key-1');
  PERFORM set_config('g4.invoice', (v_sale->>'id'), false);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 1. record_claim happy path (cashier collects) + replay
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SET request.jwt.claim.tenant_id = :'g4t';
DO $$
DECLARE a jsonb; b jsonb; v_state text; v_cash uuid;
BEGIN
  SELECT id INTO v_cash FROM public.payment_instruments
  WHERE tenant_id = (SELECT current_setting('g4.tenant'))::uuid
    AND itype = 'cash' AND is_active LIMIT 1;
  PERFORM set_config('g4.cashinst', v_cash::text, false);
  a := public.record_claim(
    (SELECT current_setting('g4.customer'))::uuid,
    (SELECT current_setting('g4.invoice'))::uuid,
    'cash', 200, v_cash, 'g4-claim-key-1');
  PERFORM set_config('g4.claim1', (a->>'id'), false);
  SELECT claim_state INTO v_state FROM public.payment_claims
  WHERE id = (a->>'id')::uuid;
  IF v_state <> 'recorded' THEN RAISE EXCEPTION 'claim not recorded'; END IF;
  -- replay with different payload, same key -> identical result, no new row
  b := public.record_claim(
    (SELECT current_setting('g4.customer'))::uuid, NULL,
    'upi', 999, v_cash, 'g4-claim-key-1');
  IF (a->>'id') <> (b->>'id') THEN RAISE EXCEPTION 'claim replay diverged'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- record validation failures
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SET request.jwt.claim.tenant_id = :'g4t';
DO $$
BEGIN
  BEGIN
    PERFORM public.record_claim(
      (SELECT current_setting('g4.customer'))::uuid, NULL,
      'crypto', 10,
      (SELECT current_setting('g4.cashinst'))::uuid, 'k-bad1');
    RAISE EXCEPTION 'bad method was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'bad method was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_claim(
      (SELECT current_setting('g4.customer'))::uuid, NULL,
      'cash', -5,
      (SELECT current_setting('g4.cashinst'))::uuid, 'k-bad2');
    RAISE EXCEPTION 'negative amount was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'negative amount was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_claim(
      (SELECT current_setting('g4.customer'))::uuid, NULL,
      'cash', 10, '99999999-9999-9999-9999-999999999999', 'k-bad3');
    RAISE EXCEPTION 'bad instrument was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'bad instrument was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_claim(
      '99999999-9999-9999-9999-999999999999', NULL,
      'cash', 10,
      (SELECT current_setting('g4.cashinst'))::uuid, 'k-bad4');
    RAISE EXCEPTION 'bad customer was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'bad customer was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 2. Allocations: split + mismatch + post-recognition block
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SET request.jwt.claim.tenant_id = :'g4t';
DO $$
DECLARE v_upi uuid;
BEGIN
  SELECT id INTO v_upi FROM public.payment_instruments
  WHERE tenant_id = (SELECT current_setting('g4.tenant'))::uuid
    AND itype = 'upi_qr' AND is_active LIMIT 1;
  PERFORM public.allocate_claim(
    (SELECT current_setting('g4.claim1'))::uuid, 'cash', 120,
    (SELECT current_setting('g4.cashinst'))::uuid);
  PERFORM public.allocate_claim(
    (SELECT current_setting('g4.claim1'))::uuid, 'upi', 80, v_upi);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- mismatched split claim: recognize must fail
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g4t';
DO $$
DECLARE v_c jsonb;
BEGIN
  v_c := public.record_claim(
    (SELECT current_setting('g4.customer'))::uuid, NULL,
    'cash', 200,
    (SELECT current_setting('g4.cashinst'))::uuid, 'g4-claim-key-2');
  PERFORM set_config('g4.claim2', (v_c->>'id'), false);
  PERFORM public.allocate_claim((v_c->>'id')::uuid, 'cash', 150,
    (SELECT current_setting('g4.cashinst'))::uuid);
  BEGIN
    PERFORM public.recognize_claim((v_c->>'id')::uuid, 'g4-rec-key-2');
    RAISE EXCEPTION 'split mismatch was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'split mismatch was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 3. recognize: back-office ok; double denied; staff denied; replay ok
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g4t';
DO $$
DECLARE v_r jsonb; v_state text;
BEGIN
  v_r := public.recognize_claim(
    (SELECT current_setting('g4.claim1'))::uuid, 'g4-rec-key-1');
  SELECT claim_state INTO v_state FROM public.payment_claims
  WHERE id = (SELECT current_setting('g4.claim1'))::uuid;
  IF v_state <> 'recognized' THEN RAISE EXCEPTION 'recognize failed'; END IF;
  v_r := public.recognize_claim(
    (SELECT current_setting('g4.claim1'))::uuid, 'g4-rec-key-1');
  IF (v_r->>'state') <> 'recognized' THEN RAISE EXCEPTION 'replay broken'; END IF;
  BEGIN
    PERFORM public.recognize_claim(
      (SELECT current_setting('g4.claim1'))::uuid, 'g4-rec-key-9');
    RAISE EXCEPTION 'double recognize was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'double recognize was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g4t';
DO $$
BEGIN
  BEGIN
    PERFORM public.recognize_claim(
      (SELECT current_setting('g4.claim2'))::uuid, 'g4-rec-key-3');
    RAISE EXCEPTION 'staff recognize was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff recognize was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- allocations on recognized claim blocked
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SET request.jwt.claim.tenant_id = :'g4t';
DO $$
BEGIN
  BEGIN
    PERFORM public.allocate_claim(
      (SELECT current_setting('g4.claim1'))::uuid, 'cash', 10,
      (SELECT current_setting('g4.cashinst'))::uuid);
    RAISE EXCEPTION 'post-recognition allocate was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'post-recognition allocate was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 4. Khata limits: dues math, over-limit sale denied, boundary allowed
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g4t';
DO $$
DECLARE v_dues numeric; v_sale jsonb;
BEGIN
  -- dues = 200 (invoice) - 200 (recognized) = 0
  SELECT
    (SELECT coalesce(sum(total),0) FROM public.invoices
     WHERE customer_id = (SELECT current_setting('g4.customer'))::uuid
       AND status = 'posted')
    - (SELECT coalesce(sum(amount),0) FROM public.payment_claims
       WHERE customer_id = (SELECT current_setting('g4.customer'))::uuid
         AND claim_state = 'recognized')
  INTO v_dues;
  IF v_dues <> 0 THEN RAISE EXCEPTION 'dues %, want 0', v_dues; END IF;

  -- raise dues to 4800 with more sales (limit 5000)
  PERFORM public.create_sale(
    (SELECT current_setting('g4.customer'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('g4.product'),
      'qty', 46, 'rate', 100)), 0, NULL, 'g4-dues-1', 'g4-dues-key-1');
  SELECT
    (SELECT coalesce(sum(total),0) FROM public.invoices
     WHERE customer_id = (SELECT current_setting('g4.customer'))::uuid
       AND status = 'posted')
    - (SELECT coalesce(sum(amount),0) FROM public.payment_claims
       WHERE customer_id = (SELECT current_setting('g4.customer'))::uuid
         AND claim_state = 'recognized')
  INTO v_dues;
  IF v_dues <> 4600 THEN RAISE EXCEPTION 'dues %, want 4600', v_dues; END IF;

  -- 4600 + 500 = 5100 > 5000 -> denied
  BEGIN
    PERFORM public.create_sale(
      (SELECT current_setting('g4.customer'))::uuid, CURRENT_DATE,
      jsonb_build_array(jsonb_build_object('product_id', current_setting('g4.product'),
        'qty', 5, 'rate', 100)), 0, NULL, 'g4-dues-2', 'g4-dues-key-2');
    RAISE EXCEPTION 'over-limit sale was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'over-limit sale was NOT blocked' THEN RAISE; END IF;
  END;

  -- 4600 + 400 = 5000 boundary allowed
  v_sale := public.create_sale(
    (SELECT current_setting('g4.customer'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('g4.product'),
      'qty', 4, 'rate', 100)), 0, NULL, 'g4-dues-3', 'g4-dues-key-3');
  PERFORM set_config('g4.boundary', (v_sale->>'id'), false);

  -- limit-0 customer: any sale denied
  PERFORM public.mg_customer_upsert(NULL, 'Gate G4 NoCredit', NULL, 0, true);
  BEGIN
    PERFORM public.create_sale(
      (SELECT id FROM public.customers WHERE name = 'Gate G4 NoCredit' LIMIT 1),
      CURRENT_DATE,
      jsonb_build_array(jsonb_build_object('product_id', current_setting('g4.product'),
        'qty', 1, 'rate', 10)), 0, NULL, 'g4-dues-4', 'g4-dues-key-4');
    RAISE EXCEPTION 'zero-limit sale was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'zero-limit sale was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 5. RLS/isolation/DML-denied + sensitive-column scan
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g4t';
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM public.payment_claims LOOP
    IF r.tenant_id::text <> current_setting('request.jwt.claim.tenant_id') THEN
      RAISE EXCEPTION 'staff sees foreign claim';
    END IF;
  END LOOP;
  BEGIN
    INSERT INTO public.payment_claims (tenant_id, method, amount, instrument_id, recorded_by_profile)
    VALUES (current_setting('request.jwt.claim.tenant_id')::uuid, 'cash', 1,
      (SELECT current_setting('g4.cashinst'))::uuid,
      (SELECT id FROM public.profiles WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'));
    RAISE EXCEPTION 'staff claim insert was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.payment_claims SET amount = amount WHERE claim_state = 'recorded';
    RAISE EXCEPTION 'staff claim update was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.collection_allocations WHERE claim_id = (SELECT current_setting('g4.claim1'))::uuid;
    RAISE EXCEPTION 'staff allocation delete was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('payment_claims','collection_allocations')
    AND column_name ~* '(card_number|^pin$|mpin|aadhaar|otp|cvv|password|secret|credential|token)';
  IF n <> 0 THEN RAISE EXCEPTION '% prohibited sensitive columns', n; END IF;
END
$$;

-- --------------------------------------------------------------------------
-- 6. Teardown own rows (FK order; keeps later regressions green)
-- --------------------------------------------------------------------------
DO $$
BEGIN
  DELETE FROM public.collection_allocations WHERE claim_id IN
    (SELECT id FROM public.payment_claims
     WHERE customer_id IN (SELECT id FROM public.customers WHERE name LIKE 'Gate G4%'));
  DELETE FROM public.payment_claims WHERE customer_id IN
    (SELECT id FROM public.customers WHERE name LIKE 'Gate G4%');
  DELETE FROM public.invoice_line_lots WHERE invoice_line_id IN
    (SELECT il.id FROM public.invoice_lines il
     JOIN public.invoices i ON i.id = il.invoice_id
     WHERE i.provisional_number LIKE 'g4-%');
  DELETE FROM public.invoice_lines WHERE invoice_id IN
    (SELECT id FROM public.invoices WHERE provisional_number LIKE 'g4-%');
  DELETE FROM public.invoices WHERE provisional_number LIKE 'g4-%';
  DELETE FROM public.purchase_lines WHERE purchase_id IN
    (SELECT p.id FROM public.purchases p
     JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE s.name LIKE 'Gate G4%');
  DELETE FROM public.stock_reservations WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g4-%' OR s.name LIKE 'Gate G4%');
  DELETE FROM public.adjustments WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g4-%' OR s.name LIKE 'Gate G4%');
  DELETE FROM public.stock_lots
  WHERE source_ref LIKE 'g4-%'
     OR purchase_id IN (SELECT p.id FROM public.purchases p
                        JOIN public.suppliers s ON s.id = p.supplier_id
                        WHERE s.name LIKE 'Gate G4%');
  DELETE FROM public.purchases WHERE supplier_id IN
    (SELECT id FROM public.suppliers WHERE name LIKE 'Gate G4%');
  DELETE FROM public.idempotency_keys WHERE key LIKE 'g4-%';
  DELETE FROM public.products WHERE name LIKE 'Gate G4%';
  DELETE FROM public.suppliers WHERE name LIKE 'Gate G4%';
  DELETE FROM public.customers WHERE name LIKE 'Gate G4%';
END
$$;

SELECT 'G4_GATE_ALL_GREEN' AS gate_result;
