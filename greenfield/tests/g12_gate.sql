-- ============================================================================
-- G12 EXIT GATE — fails (RAISE EXCEPTION, nonzero exit) on any mismatch.
-- Requires: G0-G11 applied. Run with ON_ERROR_STOP=1. Local test DB only.
-- Historic window: [2025-01-01, 2026-01-01). Lock tests run LAST (the
-- window lock is irreversible); teardown removes it for reruns.
-- ============================================================================

SELECT id AS g12t FROM public.tenants
WHERE name = 'CyberCafe & Digital Services ERP' LIMIT 1 \gset
SELECT set_config('g12.tenant', :'g12t', false);

-- --------------------------------------------------------------------------
-- 0. Fixtures + cleanup-first (G12 tags; journals stay immutable)
-- --------------------------------------------------------------------------
DO $$
BEGIN
  DELETE FROM public.suspense_records
  WHERE batch_id IN (SELECT id FROM public.back_entry_batches
                     WHERE batch_key LIKE 'g12%');
  DELETE FROM public.back_entry_lines WHERE batch_id IN
    (SELECT id FROM public.back_entry_batches WHERE batch_key LIKE 'g12%');
  DELETE FROM public.payment_claims
  WHERE back_entry_batch_id IN (SELECT id FROM public.back_entry_batches
                                WHERE batch_key LIKE 'g12%');
  DELETE FROM public.back_entry_batches WHERE batch_key LIKE 'g12%';
  DELETE FROM public.back_entry_lock
  WHERE tenant_id = (SELECT current_setting('g12.tenant'))::uuid;
  DELETE FROM public.stock_reservations WHERE lot_id IN
    (SELECT id FROM public.stock_lots
     WHERE source_ref LIKE 'g12%' OR source_ref LIKE 'aggregate:%');
  DELETE FROM public.adjustments WHERE lot_id IN
    (SELECT id FROM public.stock_lots
     WHERE source_ref LIKE 'g12%' OR source_ref LIKE 'aggregate:%');
  DELETE FROM public.purchase_lines WHERE purchase_id IN
    (SELECT p.id FROM public.purchases p
     JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE s.name LIKE 'G12 %');
  DELETE FROM public.stock_lots
  WHERE source_ref LIKE 'g12%' OR source_ref LIKE 'aggregate:%'
     OR purchase_id IN (SELECT p.id FROM public.purchases p
                        JOIN public.suppliers s ON s.id = p.supplier_id
                        WHERE s.name LIKE 'G12 %');
  DELETE FROM public.purchases WHERE supplier_id IN
    (SELECT id FROM public.suppliers WHERE name LIKE 'G12 %');
  DELETE FROM public.idempotency_keys WHERE key LIKE 'g12%';
  DELETE FROM public.products WHERE name LIKE 'G12 %';
  DELETE FROM public.suppliers WHERE name LIKE 'G12 %';
  DELETE FROM public.customers WHERE name LIKE 'G12 %';
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g12t';
DO $$
DECLARE v_sup uuid; v_cust uuid; v_prod uuid; v_cash uuid;
BEGIN
  v_sup := public.mg_supplier_upsert(NULL, 'G12 Supplier', NULL, true);
  PERFORM set_config('g12.supplier', v_sup::text, false);
  v_cust := public.mg_customer_upsert(NULL, 'G12 Customer', NULL, 100000, true);
  PERFORM set_config('g12.customer', v_cust::text, false);
  v_prod := public.mg_product_upsert(NULL, 'G12 Widget', 'G12W-1', 'G12W-BAR-1',
    'pc', 100, 60, 'GENERAL', true);
  PERFORM set_config('g12.product', v_prod::text, false);
  SELECT id INTO v_cash FROM public.payment_instruments
  WHERE tenant_id = (SELECT current_setting('g12.tenant'))::uuid
    AND itype = 'cash' AND is_active LIMIT 1;
  PERFORM set_config('g12.cash', v_cash::text, false);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 1. Valid purchase batch, known granularity: exact lots + balanced journals
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g12t';
DO $$
DECLARE
  v_r jsonb; v_bid uuid; v_lots integer; v_j integer; v_d numeric; v_c numeric;
BEGIN
  v_r := public.submit_back_entry_batch('g12-pur-1', 'g12 opening purchases',
    jsonb_build_array(
      jsonb_build_object('line_type','purchase','source_ref','g12b-101',
        'business_date','2025-11-02','product_id', current_setting('g12.product'),
        'supplier_id', current_setting('g12.supplier'),
        'qty', 10, 'unit_cost', 40, 'expiry_date','2027-01-01'),
      jsonb_build_object('line_type','purchase','source_ref','g12b-102',
        'business_date','2025-12-05','product_id', current_setting('g12.product'),
        'supplier_id', current_setting('g12.supplier'),
        'qty', 10, 'unit_cost', 50, 'expiry_date','2027-06-01')));
  v_bid := (v_r->>'id')::uuid;
  PERFORM set_config('g12.purbatch', v_bid::text, false);
  IF (v_r->>'lines_posted')::integer <> 2 THEN
    RAISE EXCEPTION 'lines_posted %, want 2', v_r;
  END IF;
  SELECT count(*) INTO v_lots FROM public.stock_lots
  WHERE source_ref IN ('g12b-101','g12b-102');
  IF v_lots <> 2 THEN RAISE EXCEPTION 'exact lots %, want 2', v_lots; END IF;
  SELECT count(*) INTO v_j FROM public.journal_entries
  WHERE source_id = v_bid AND origin = 'back_entry';
  IF v_j <> 2 THEN RAISE EXCEPTION 'purchase batches %, want 2', v_j; END IF;
  SELECT coalesce(sum(l.debit),0), coalesce(sum(l.credit),0) INTO v_d, v_c
  FROM public.journal_lines l JOIN public.journal_entries e ON e.id = l.journal_entry_id
  WHERE e.source_id = v_bid;
  IF v_d <> 900 OR v_c <> 900 THEN
    RAISE EXCEPTION 'purchase money wrong: %/%', v_d, v_c;
  END IF;
  -- entry dates follow business dates, not today
  SELECT count(*) INTO v_j FROM public.journal_entries
  WHERE source_id = v_bid AND entry_date NOT IN (DATE '2025-11-02', DATE '2025-12-05');
  IF v_j <> 0 THEN RAISE EXCEPTION 'entry dates not historical'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 2. Boundary: 2025-01-01 accepted; 2024-12-31 and 2026-01-01 rejected
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g12t';
DO $$
DECLARE v_r jsonb;
BEGIN
  v_r := public.submit_back_entry_batch('g12-edge-1', 'g12 boundary check',
    jsonb_build_array(
      jsonb_build_object('line_type','purchase','source_ref','g12b-EDGE',
        'business_date','2025-01-01','product_id', current_setting('g12.product'),
        'supplier_id', current_setting('g12.supplier'),
        'qty', 1, 'unit_cost', 10, 'expiry_date','2027-01-01')));
  PERFORM public.void_back_entry_batch((v_r->>'id')::uuid);
  BEGIN
    PERFORM public.submit_back_entry_batch('g12-old-1', 'g12 too old',
      jsonb_build_array(
        jsonb_build_object('line_type','purchase','source_ref','g12b-OLD',
          'business_date','2024-12-31','product_id', current_setting('g12.product'),
          'supplier_id', current_setting('g12.supplier'),
          'qty', 1, 'unit_cost', 10, 'expiry_date','2027-01-01')));
    RAISE EXCEPTION 'pre-window date was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'pre-window date was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.submit_back_entry_batch('g12-new-1', 'g12 too new',
      jsonb_build_array(
        jsonb_build_object('line_type','purchase','source_ref','g12b-NEW',
          'business_date','2026-01-01','product_id', current_setting('g12.product'),
          'supplier_id', current_setting('g12.supplier'),
          'qty', 1, 'unit_cost', 10, 'expiry_date','2027-01-01')));
    RAISE EXCEPTION 'post-window date was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'post-window date was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 3. Unknown granularity -> monthly aggregate (same product+month+cost merge)
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g12t';
DO $$
DECLARE v_r jsonb; v_n integer; v_recvd timestamptz; v_rem numeric;
BEGIN
  v_r := public.submit_back_entry_batch('g12-agg-1', 'g12 aggregate check',
    jsonb_build_array(
      jsonb_build_object('line_type','purchase','source_ref','g12b-A1',
        'business_date','2025-10-03','product_id', current_setting('g12.product'),
        'supplier_id', current_setting('g12.supplier'),
        'qty', 4, 'unit_cost', 25, 'expiry_date','2027-01-01',
        'lot_mode','aggregate'),
      jsonb_build_object('line_type','purchase','source_ref','g12b-A2',
        'business_date','2025-10-20','product_id', current_setting('g12.product'),
        'supplier_id', current_setting('g12.supplier'),
        'qty', 6, 'unit_cost', 25, 'expiry_date','2027-01-01',
        'lot_mode','aggregate'),
      jsonb_build_object('line_type','purchase','source_ref','g12b-A3',
        'business_date','2025-10-11','product_id', current_setting('g12.product'),
        'supplier_id', current_setting('g12.supplier'),
        'qty', 5, 'unit_cost', 30, 'expiry_date','2027-01-01',
        'lot_mode','aggregate')));
  SELECT count(*) INTO v_n FROM public.stock_lots
  WHERE source_ref LIKE 'aggregate:2025-10%';
  IF v_n <> 2 THEN RAISE EXCEPTION 'aggregate lots %, want 2 (cost-split)', v_n; END IF;
  SELECT qty_remaining, received_at INTO v_rem, v_recvd FROM public.stock_lots
  WHERE source_ref = 'aggregate:2025-10:25.00' LIMIT 1;
  IF v_rem <> 10 THEN RAISE EXCEPTION 'aggregate qty %, want 10', v_rem; END IF;
  IF v_recvd <> date_trunc('month', DATE '2025-10-03') THEN
    RAISE EXCEPTION 'aggregate received_at not month-start';
  END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 4. Unknown expiry rejected with zero side effects (atomicity proof)
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g12t';
DO $$
DECLARE b0 integer; l0 integer; j0 integer; ln0 integer;
BEGIN
  SELECT count(*) INTO b0 FROM public.back_entry_batches
  WHERE batch_key LIKE 'g12%';
  SELECT count(*) INTO l0 FROM public.stock_lots WHERE source_ref LIKE 'g12%';
  SELECT count(*) INTO j0 FROM public.journal_entries e
  JOIN public.back_entry_batches b ON b.id = e.source_id
  WHERE b.batch_key LIKE 'g12%';
  SELECT count(*) INTO ln0 FROM public.back_entry_lines l
  JOIN public.back_entry_batches b ON b.id = l.batch_id
  WHERE b.batch_key LIKE 'g12%';
  BEGIN
    PERFORM public.submit_back_entry_batch('g12-noexp-1', 'g12 missing expiry',
      jsonb_build_array(
        jsonb_build_object('line_type','purchase','source_ref','g12b-GOOD',
          'business_date','2025-09-01','product_id', current_setting('g12.product'),
          'supplier_id', current_setting('g12.supplier'),
          'qty', 2, 'unit_cost', 10, 'expiry_date','2027-01-01'),
        jsonb_build_object('line_type','purchase','source_ref','g12b-BADEXP',
          'business_date','2025-09-02','product_id', current_setting('g12.product'),
          'supplier_id', current_setting('g12.supplier'),
          'qty', 2, 'unit_cost', 10)));
    RAISE EXCEPTION 'unknown expiry was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'unknown expiry was NOT rejected' THEN RAISE; END IF;
  END;
  PERFORM 1 FROM public.back_entry_batches WHERE batch_key = 'g12-noexp-1';
  IF FOUND THEN RAISE EXCEPTION 'failed batch persisted'; END IF;
  IF (SELECT count(*) FROM public.back_entry_batches WHERE batch_key LIKE 'g12%') <> b0
     OR (SELECT count(*) FROM public.stock_lots WHERE source_ref LIKE 'g12%') <> l0
     OR (SELECT count(*) FROM public.journal_entries e
         JOIN public.back_entry_batches b ON b.id = e.source_id
         WHERE b.batch_key LIKE 'g12%') <> j0
     OR (SELECT count(*) FROM public.back_entry_lines l
         JOIN public.back_entry_batches b ON b.id = l.batch_id
         WHERE b.batch_key LIKE 'g12%') <> ln0 THEN
    RAISE EXCEPTION 'failed batch left partial rows';
  END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 5. Suspense: supplier-less purchase parks; resolve works
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g12t';
DO $$
DECLARE v_r jsonb; v_s uuid; v_n integer; v_st text;
BEGIN
  v_r := public.submit_back_entry_batch('g12-susp-1', 'g12 suspense check',
    jsonb_build_array(
      jsonb_build_object('line_type','purchase','source_ref','g12b-SUSP',
        'business_date','2025-08-01','product_id', current_setting('g12.product'),
        'qty', 3, 'unit_cost', 12, 'expiry_date','2027-01-01')));
  IF (v_r->>'lines_posted')::integer <> 0 THEN
    RAISE EXCEPTION 'parked batch posted lines';
  END IF;
  IF (v_r->>'lines_parked')::integer <> 1 THEN
    RAISE EXCEPTION 'parked count wrong: %', v_r;
  END IF;
  SELECT id INTO v_s FROM public.suspense_records
  WHERE batch_id = (v_r->>'id')::uuid AND status = 'parked';
  IF v_s IS NULL THEN RAISE EXCEPTION 'suspense row missing'; END IF;
  PERFORM set_config('g12.susp', v_s::text, false);
  SELECT count(*) INTO v_n FROM public.stock_lots WHERE source_ref = 'g12b-SUSP';
  IF v_n <> 0 THEN RAISE EXCEPTION 'parked line created stock'; END IF;
  PERFORM public.resolve_suspense(v_s, 'excluded', 'g12 unresolvable test');
  SELECT status INTO v_st FROM public.suspense_records WHERE id = v_s;
  IF v_st <> 'excluded' THEN RAISE EXCEPTION 'resolve failed'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 6. Historical sale consumes FIFO oldest-first; payment + dues cohere
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g12t';
DO $$
DECLARE
  v_r jsonb; v_first_cost numeric; v_rem numeric; v_dues numeric;
BEGIN
  -- sale of 12 against lots of 10@40 (Nov) + 10@50 (Dec) + aggregates
  v_r := public.submit_back_entry_batch('g12-sale-1', 'g12 historical sale',
    jsonb_build_array(
      jsonb_build_object('line_type','sale','source_ref','G12S-1',
        'business_date','2025-12-20','product_id', current_setting('g12.product'),
        'customer_id', current_setting('g12.customer'),
        'qty', 12, 'rate', 100)));
  SELECT (a->>'unit_cost')::numeric INTO v_first_cost
  FROM public.back_entry_lines l,
       jsonb_array_elements(l.allocation) a
  WHERE l.batch_id = (v_r->>'id')::uuid AND l.line_type = 'sale'
  ORDER BY (a->>'unit_cost')::numeric ASC LIMIT 1;
  IF v_first_cost <> 25 THEN
    RAISE EXCEPTION 'FIFO oldest-first broken, cheapest consumed %', v_first_cost;
  END IF;
  -- payment 400 then dues must net: sales 1200 - payment 400 = 800
  v_r := public.submit_back_entry_batch('g12-pay-1', 'g12 historical payment',
    jsonb_build_array(
      jsonb_build_object('line_type','payment','source_ref','G12P-1',
        'business_date','2025-12-21',
        'customer_id', current_setting('g12.customer'),
        'method','cash','amount', 400,
        'instrument_id', current_setting('g12.cash'))));
  SELECT round(sum(
           CASE WHEN l.line_type = 'sale' THEN (l.amount)::numeric ELSE 0 END), 2)
         - (SELECT coalesce(sum(c.amount), 0) FROM public.payment_claims c
            WHERE c.customer_id = (SELECT current_setting('g12.customer'))::uuid
              AND c.claim_state = 'recognized')
  INTO v_dues
  FROM public.back_entry_lines l
  JOIN public.back_entry_batches b ON b.id = l.batch_id
  WHERE b.status = 'posted' AND l.line_type = 'sale';
  IF v_dues <> 800 THEN RAISE EXCEPTION 'historical dues %, want 800', v_dues; END IF;
  -- dues_of() is internal-only (no caller grants, by design); verify the
  -- same math inline: posted live invoices + posted back-entry sales,
  -- minus recognized claims
  SELECT
    coalesce((SELECT sum(total) FROM public.invoices
              WHERE customer_id = (SELECT current_setting('g12.customer'))::uuid
                AND status = 'posted'), 0)
    + coalesce((SELECT sum(l.amount) FROM public.back_entry_lines l
                JOIN public.back_entry_batches b ON b.id = l.batch_id
                WHERE l.customer_id = (SELECT current_setting('g12.customer'))::uuid
                  AND l.line_type = 'sale' AND b.status = 'posted'), 0)
    - coalesce((SELECT sum(c.amount) FROM public.payment_claims c
                WHERE c.customer_id = (SELECT current_setting('g12.customer'))::uuid
                  AND c.claim_state = 'recognized'), 0)
  INTO v_rem;
  IF v_rem <> 800 THEN RAISE EXCEPTION 'dues_of %, want 800', v_rem; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;
-- the extended dues_of() itself (owner-executable; no caller grants by design)
DO $$
DECLARE v_d numeric;
BEGIN
  SELECT public.dues_of(
    (SELECT id FROM public.customers WHERE name LIKE 'G12 %' LIMIT 1))
  INTO v_d;
  IF v_d <> 800 THEN RAISE EXCEPTION 'dues_of() %, want 800', v_d; END IF;
END
$$;

-- --------------------------------------------------------------------------
-- 7. Adjustment + opening lines post correctly
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g12t';
DO $$
DECLARE v_lot uuid; v_r jsonb; v_d numeric; v_c numeric;
BEGIN
  SELECT id INTO v_lot FROM public.stock_lots WHERE source_ref = 'g12b-101';
  v_r := public.submit_back_entry_batch('g12-adj-1', 'g12 historical adjustment',
    jsonb_build_array(
      jsonb_build_object('line_type','adjustment','source_ref','G12A-1',
        'business_date','2025-12-28','lot_id', v_lot,
        'qty_delta', -2, 'reason', 'g12 damage found')));
  SELECT coalesce(sum(l.debit),0), coalesce(sum(l.credit),0) INTO v_d, v_c
  FROM public.journal_lines l JOIN public.journal_entries e ON e.id = l.journal_entry_id
  WHERE e.source_id = (v_r->>'id')::uuid;
  IF v_d <> v_c OR v_d <= 0 THEN RAISE EXCEPTION 'adjustment unbalanced'; END IF;
  v_r := public.submit_back_entry_batch('g12-open-1', 'g12 opening cash',
    jsonb_build_array(
      jsonb_build_object('line_type','opening_balance','source_ref','G12O-1',
        'business_date','2025-12-31',
        'instrument_id', current_setting('g12.cash'), 'amount', 5000)));
  SELECT coalesce(sum(l.debit),0) INTO v_d
  FROM public.journal_lines l JOIN public.journal_entries e ON e.id = l.journal_entry_id
  WHERE e.source_id = (v_r->>'id')::uuid AND l.debit > 0;
  IF v_d <> 5000 THEN RAISE EXCEPTION 'opening debit %, want 5000', v_d; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 8. Void: journals reverse, stock restores, double-void denied
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g12t';
DO $$
DECLARE v_bid uuid; v_r jsonb; v_n integer; v_rem numeric;
BEGIN
  v_r := public.submit_back_entry_batch('g12-void-1', 'g12 void target',
    jsonb_build_array(
      jsonb_build_object('line_type','purchase','source_ref','g12b-VOID',
        'business_date','2025-07-01','product_id', current_setting('g12.product'),
        'supplier_id', current_setting('g12.supplier'),
        'qty', 7, 'unit_cost', 22, 'expiry_date','2027-01-01')));
  v_bid := (v_r->>'id')::uuid;
  SELECT qty_remaining INTO v_rem FROM public.stock_lots WHERE source_ref = 'g12b-VOID';
  v_r := public.void_back_entry_batch(v_bid);
  IF (v_r->>'status') <> 'voided' THEN RAISE EXCEPTION 'not voided'; END IF;
  SELECT count(*) INTO v_n FROM public.journal_entries
  WHERE source_id = v_bid AND status = 'reversed';
  IF v_n <> 1 THEN RAISE EXCEPTION 'original not reversed'; END IF;
  SELECT count(*) INTO v_n FROM public.journal_entries
  WHERE source_id = v_bid AND status = 'posted' AND description LIKE 'Reversal%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'mirror missing'; END IF;
  SELECT qty_remaining INTO v_rem FROM public.stock_lots WHERE source_ref = 'g12b-VOID';
  IF v_rem <> 0 THEN RAISE EXCEPTION 'void did not consume lot, remaining %', v_rem; END IF;
  BEGIN
    PERFORM public.void_back_entry_batch(v_bid);
    RAISE EXCEPTION 'double void was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'double void was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 9. Roles: staff/manager submit denied; cross-tenant submit denied
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g12t';
DO $$
BEGIN
  BEGIN
    PERFORM public.submit_back_entry_batch('g12-staff-1', 'g12 staff try',
      jsonb_build_array(
        jsonb_build_object('line_type','purchase','source_ref','g12b-ST',
          'business_date','2025-05-01','product_id', current_setting('g12.product'),
          'supplier_id', current_setting('g12.supplier'),
          'qty', 1, 'unit_cost', 10, 'expiry_date','2027-01-01')));
    RAISE EXCEPTION 'staff submit was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff submit was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
SET request.jwt.claim.tenant_id = :'g12t';
DO $$
BEGIN
  BEGIN
    PERFORM public.submit_back_entry_batch('g12-xeno-1', 'g12 outsider try',
      jsonb_build_array(
        jsonb_build_object('line_type','purchase','source_ref','g12b-XENO',
          'business_date','2025-05-01','product_id', current_setting('g12.product'),
          'supplier_id', current_setting('g12.supplier'),
          'qty', 1, 'unit_cost', 10, 'expiry_date','2027-01-01')));
    RAISE EXCEPTION 'cross-tenant submit was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'cross-tenant submit was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub;

-- staff direct DML on new tables denied
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g12t';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.back_entry_batches (tenant_id, batch_key, reason, actor_profile_id)
    VALUES (current_setting('request.jwt.claim.tenant_id')::uuid, 'g12-x', 'x',
      (SELECT id FROM public.profiles WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'));
    RAISE EXCEPTION 'staff batch insert was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.back_entry_lines SET reason = 'x' WHERE batch_id IS NULL;
    RAISE EXCEPTION 'staff line update was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.suspense_records WHERE status = 'parked';
    RAISE EXCEPTION 'staff suspense delete was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 10. Locked-period interaction: back-entry on a locked 2025 date fails
-- --------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO public.period_locks (tenant_id, locked_date, locked_by_profile, reason)
  VALUES ((SELECT current_setting('g12.tenant'))::uuid, DATE '2025-06-15',
    (SELECT id FROM public.profiles WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    'g12 locked-period probe')
  ON CONFLICT (tenant_id, locked_date) DO NOTHING;
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g12t';
DO $$
DECLARE b0 integer; l0 integer; j0 integer;
BEGIN
  SELECT count(*) INTO b0 FROM public.back_entry_batches WHERE batch_key LIKE 'g12%';
  SELECT count(*) INTO l0 FROM public.stock_lots WHERE source_ref LIKE 'g12%';
  SELECT count(*) INTO j0 FROM public.journal_entries e
  JOIN public.back_entry_batches b ON b.id = e.source_id
  WHERE b.batch_key LIKE 'g12%';
  BEGIN
    PERFORM public.submit_back_entry_batch('g12-locked-1', 'g12 locked date',
      jsonb_build_array(
        jsonb_build_object('line_type','purchase','source_ref','g12b-LOCK',
          'business_date','2025-06-15','product_id', current_setting('g12.product'),
          'supplier_id', current_setting('g12.supplier'),
          'qty', 2, 'unit_cost', 10, 'expiry_date','2027-01-01')));
    RAISE EXCEPTION 'locked-date back-entry was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'locked-date back-entry was NOT rejected' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.back_entry_batches WHERE batch_key LIKE 'g12%') <> b0
     OR (SELECT count(*) FROM public.stock_lots WHERE source_ref LIKE 'g12%') <> l0
     OR (SELECT count(*) FROM public.journal_entries e
         JOIN public.back_entry_batches b ON b.id = e.source_id
         WHERE b.batch_key LIKE 'g12%') <> j0 THEN
    RAISE EXCEPTION 'locked-date attempt left partial rows';
  END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;
-- probe lock cleanup runs as owner (period_locks is RPC-only for app roles)
DO $$
BEGIN
  DELETE FROM public.period_locks
  WHERE tenant_id = (SELECT current_setting('g12.tenant'))::uuid
    AND locked_date = DATE '2025-06-15';
END
$$;

-- --------------------------------------------------------------------------
-- 11. Replay: same key twice, identical result, single posting set
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g12t';
DO $$
DECLARE a jsonb; b jsonb; n integer;
BEGIN
  a := public.submit_back_entry_batch('g12-replay-1', 'g12 replay check',
    jsonb_build_array(
      jsonb_build_object('line_type','purchase','source_ref','g12b-RP',
        'business_date','2025-04-01','product_id', current_setting('g12.product'),
        'supplier_id', current_setting('g12.supplier'),
        'qty', 3, 'unit_cost', 33, 'expiry_date','2027-01-01')));
  b := public.submit_back_entry_batch('g12-replay-1', 'g12 replay check DIVERGENT',
    jsonb_build_array(
      jsonb_build_object('line_type','purchase','source_ref','g12b-RP2',
        'business_date','2025-04-02','product_id', current_setting('g12.product'),
        'supplier_id', current_setting('g12.supplier'),
        'qty', 999, 'unit_cost', 999, 'expiry_date','2027-01-01')));
  IF (a->>'id') <> (b->>'id') THEN RAISE EXCEPTION 'replay diverged'; END IF;
  IF a <> b THEN RAISE EXCEPTION 'replay payload differs'; END IF;
  SELECT count(*) INTO n FROM public.stock_lots WHERE source_ref LIKE 'g12b-RP%';
  IF n <> 1 THEN RAISE EXCEPTION 'replay duplicated lots: %', n; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 12. Audit trail: posted + voided batches logged with actor
-- --------------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.audit_logs
  WHERE action = 'back_entry_posted'
    AND details->>'reason' LIKE 'g12 %';
  IF n < 5 THEN RAISE EXCEPTION 'posted audits %, want >= 5', n; END IF;
  SELECT count(*) INTO n FROM public.audit_logs
  WHERE action = 'back_entry_voided';
  IF n < 1 THEN RAISE EXCEPTION 'void audit missing'; END IF;
END
$$;

-- --------------------------------------------------------------------------
-- 13. RLS reads: back-office sees rows; outsider sees nothing
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g12t';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM public.back_entry_batches
  WHERE tenant_id = (SELECT current_setting('g12.tenant'))::uuid;
  IF c < 5 THEN RAISE EXCEPTION 'admin sees % batches, want >= 5', c; END IF;
  SELECT count(*) INTO c FROM public.back_entry_lock
  WHERE tenant_id = (SELECT current_setting('g12.tenant'))::uuid;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM public.back_entry_batches;
  IF c <> 0 THEN RAISE EXCEPTION 'outsider sees batches'; END IF;
  SELECT count(*) INTO c FROM public.suspense_records;
  IF c <> 0 THEN RAISE EXCEPTION 'outsider sees suspense'; END IF;
  SELECT count(*) INTO c FROM public.back_entry_lock;
  IF c <> 0 THEN RAISE EXCEPTION 'outsider sees lock'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub;

-- --------------------------------------------------------------------------
-- 14. ACQUIRE THE WINDOW LOCK LAST (irreversible; teardown removes it)
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g12t';
DO $$
BEGIN
  PERFORM public.acquire_back_entry_lock('g12 window closure test');
  BEGIN
    PERFORM public.acquire_back_entry_lock('g12 concurrent attempt');
    RAISE EXCEPTION 'concurrent lock was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'concurrent lock was NOT blocked'
       OR SQLERRM = 'concurrent lock was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.submit_back_entry_batch('g12-after-lock-1', 'g12 must fail',
      jsonb_build_array(
        jsonb_build_object('line_type','purchase','source_ref','g12b-AL',
          'business_date','2025-03-01','product_id', current_setting('g12.product'),
          'supplier_id', current_setting('g12.supplier'),
          'qty', 1, 'unit_cost', 10, 'expiry_date','2027-01-01')));
    RAISE EXCEPTION 'post-lock submit was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'post-lock submit was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 15. PUBLIC sweep on new RPCs + teardown (journals stay by design)
-- --------------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
  FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace,
       LATERAL aclexplode(p.proacl) AS a
  WHERE s.nspname = 'public'
    AND p.proname IN ('submit_back_entry_batch','void_back_entry_batch',
      'resolve_suspense','acquire_back_entry_lock')
    AND a.grantee = 0;
  IF n <> 0 THEN RAISE EXCEPTION 'PUBLIC execute on % back-entry functions', n; END IF;
END
$$;

DO $$
BEGIN
  DELETE FROM public.back_entry_lock
  WHERE tenant_id = (SELECT current_setting('g12.tenant'))::uuid;
  DELETE FROM public.suspense_records
  WHERE batch_id IN (SELECT id FROM public.back_entry_batches
                     WHERE batch_key LIKE 'g12%');
  DELETE FROM public.back_entry_lines WHERE batch_id IN
    (SELECT id FROM public.back_entry_batches WHERE batch_key LIKE 'g12%');
  DELETE FROM public.payment_claims
  WHERE back_entry_batch_id IN (SELECT id FROM public.back_entry_batches
                                WHERE batch_key LIKE 'g12%');
  DELETE FROM public.back_entry_batches WHERE batch_key LIKE 'g12%';
  DELETE FROM public.stock_reservations WHERE lot_id IN
    (SELECT id FROM public.stock_lots
     WHERE source_ref LIKE 'g12%' OR source_ref LIKE 'aggregate:%');
  DELETE FROM public.adjustments WHERE lot_id IN
    (SELECT id FROM public.stock_lots
     WHERE source_ref LIKE 'g12%' OR source_ref LIKE 'aggregate:%');
  DELETE FROM public.invoice_line_lots WHERE invoice_line_id IN
    (SELECT il.id FROM public.invoice_lines il
     JOIN public.invoices i ON i.id = il.invoice_id
     WHERE i.provisional_number LIKE 'g12%');
  DELETE FROM public.invoice_lines WHERE invoice_id IN
    (SELECT id FROM public.invoices WHERE provisional_number LIKE 'g12%');
  UPDATE public.invoices SET edited_from = NULL, recreated_by = NULL
  WHERE provisional_number LIKE 'g12%';
  DELETE FROM public.invoices WHERE provisional_number LIKE 'g12%';
  DELETE FROM public.purchase_lines WHERE purchase_id IN
    (SELECT p.id FROM public.purchases p
     JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE s.name LIKE 'G12 %');
  DELETE FROM public.stock_lots
  WHERE source_ref LIKE 'g12%' OR source_ref LIKE 'aggregate:%'
     OR purchase_id IN (SELECT p.id FROM public.purchases p
                        JOIN public.suppliers s ON s.id = p.supplier_id
                        WHERE s.name LIKE 'G12 %');
  DELETE FROM public.purchases WHERE supplier_id IN
    (SELECT id FROM public.suppliers WHERE name LIKE 'G12 %');
  DELETE FROM public.idempotency_keys WHERE key LIKE 'g12%';
  DELETE FROM public.products WHERE name LIKE 'G12 %';
  DELETE FROM public.suppliers WHERE name LIKE 'G12 %';
  DELETE FROM public.customers WHERE name LIKE 'G12 %';
END
$$;

SELECT 'G12_GATE_ALL_GREEN' AS gate_result;
