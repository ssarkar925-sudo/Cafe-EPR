-- ============================================================================
-- G6 EXIT GATE — sections A..H per requirements. Fails on any mismatch.
-- Requires: G0-G5 applied. Run with ON_ERROR_STOP=1. Local test DB only.
-- Journals are IMMUTABLE by design: this gate never deletes them. Teardown
-- removes gate documents (leaving their batches); reruns of THIS gate need
-- a fresh rebuild, which the turn flow performs before the final matrix.
-- ============================================================================

SELECT id AS g6t FROM public.tenants
WHERE name = 'CyberCafe & Digital Services ERP' LIMIT 1 \gset
SELECT set_config('g6.tenant', :'g6t', false);
-- Run timestamp: orphan sweep below covers batches created during THIS run.
-- Older batches orphaned by other gates' document cleanups (which predate
-- journals) are a test-DB artifact, not a posting defect: in production,
-- posted documents are never deleted, so this artifact cannot arise.
SELECT set_config('g6.start', now()::text, false);

-- --------------------------------------------------------------------------
-- 0. Fixtures: supplier/customer(product), purchase 60 units
--    Cleanup-first (same order as teardown) for idempotent reruns.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  DELETE FROM public.collection_allocations WHERE claim_id IN
    (SELECT id FROM public.payment_claims
     WHERE tenant_id = (SELECT current_setting('g6.tenant'))::uuid
       AND (customer_id IN (SELECT id FROM public.customers WHERE name LIKE 'G6%')
            OR service_transaction_id IS NOT NULL));
  DELETE FROM public.payment_claims
  WHERE tenant_id = (SELECT current_setting('g6.tenant'))::uuid
    AND (customer_id IN (SELECT id FROM public.customers WHERE name LIKE 'G6%')
         OR service_transaction_id IS NOT NULL);
  DELETE FROM public.invoice_line_lots WHERE invoice_line_id IN
    (SELECT il.id FROM public.invoice_lines il
     JOIN public.invoices i ON i.id = il.invoice_id
     WHERE i.provisional_number LIKE 'g6-%');
  DELETE FROM public.invoice_lines WHERE invoice_id IN
    (SELECT id FROM public.invoices WHERE provisional_number LIKE 'g6-%');
  UPDATE public.invoices SET edited_from = NULL, recreated_by = NULL
  WHERE provisional_number LIKE 'g6-%';
  DELETE FROM public.invoices WHERE provisional_number LIKE 'g6-%';
  DELETE FROM public.purchase_lines WHERE purchase_id IN
    (SELECT p.id FROM public.purchases p
     JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE s.name LIKE 'G6%');
  DELETE FROM public.stock_reservations WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g6-%' OR s.name LIKE 'G6%');
  DELETE FROM public.adjustments WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g6-%' OR s.name LIKE 'G6%');
  DELETE FROM public.stock_lots
  WHERE source_ref LIKE 'g6-%'
     OR purchase_id IN (SELECT p.id FROM public.purchases p
                        JOIN public.suppliers s ON s.id = p.supplier_id
                        WHERE s.name LIKE 'G6%');
  DELETE FROM public.purchases WHERE supplier_id IN
    (SELECT id FROM public.suppliers WHERE name LIKE 'G6%');
  DELETE FROM public.service_transactions
  WHERE tenant_id = (SELECT current_setting('g6.tenant'))::uuid
    AND transaction_number LIKE 'SRV-%' AND transaction_number <> 'SRV-B-1';
  DELETE FROM public.idempotency_keys WHERE key LIKE 'g6-%';
  DELETE FROM public.products WHERE name LIKE 'G6%';
  DELETE FROM public.suppliers WHERE name LIKE 'G6%';
  DELETE FROM public.customers WHERE name LIKE 'G6%';
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g6t';
DO $$
DECLARE v_sup uuid; v_cust uuid; v_prod uuid;
BEGIN
  v_sup := public.mg_supplier_upsert(NULL, 'G6 Supplier', NULL, true);
  PERFORM set_config('g6.supplier', v_sup::text, false);
  v_cust := public.mg_customer_upsert(NULL, 'G6 Customer', NULL, 100000, true);
  PERFORM set_config('g6.customer', v_cust::text, false);
  v_prod := public.mg_product_upsert(NULL, 'G6 Widget', 'G6W-1', 'G6W-BAR-1',
    'pc', 100, 60, 'GENERAL', true);
  PERFORM set_config('g6.product', v_prod::text, false);
  PERFORM public.create_purchase(v_sup, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', v_prod,
      'qty', 60, 'unit_cost', 10, 'expiry_date', '2028-01-01',
      'source_ref', 'g6-stock')),
    'g6-stock-key');
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- A. Double-entry invariants (per-entry, global, invalid, rounding)
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g6t';
DO $$
DECLARE
  v_sale jsonb; v_inv uuid; v_bad integer;
BEGIN
  -- baseline sale: 3 x 33.333 rate exercises half-up rounding (99.999 -> 100.00)
  v_sale := public.create_sale(
    (SELECT current_setting('g6.customer'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('g6.product'),
      'qty', 3, 'rate', 33.333)), 0, NULL, 'g6-inv-1', 'g6-inv-key-1');
  v_inv := (v_sale->>'id')::uuid;
  PERFORM set_config('g6.invoice', v_inv::text, false);

  -- every posted entry: >=1 debit AND >=1 credit line
  -- (scoped to main tenant: the JE-B-1 isolation probe in the probe tenant
  -- is intentionally lineless and covered by section C instead)
  SELECT count(*) INTO v_bad FROM public.journal_entries e
  WHERE e.status = 'posted'
    AND e.tenant_id = (SELECT current_setting('g6.tenant'))::uuid
    AND (NOT EXISTS (SELECT 1 FROM public.journal_lines l
                     WHERE l.journal_entry_id = e.id AND l.debit > 0)
         OR NOT EXISTS (SELECT 1 FROM public.journal_lines l
                        WHERE l.journal_entry_id = e.id AND l.credit > 0));
  IF v_bad <> 0 THEN RAISE EXCEPTION '% one-sided posted entries', v_bad; END IF;

  -- per-entry balance
  SELECT count(*) INTO v_bad FROM public.journal_entries e
  WHERE e.status = 'posted'
    AND e.tenant_id = (SELECT current_setting('g6.tenant'))::uuid
    AND (SELECT coalesce(sum(debit),0) FROM public.journal_lines l
         WHERE l.journal_entry_id = e.id)
       <> (SELECT coalesce(sum(credit),0) FROM public.journal_lines l
           WHERE l.journal_entry_id = e.id);
  IF v_bad <> 0 THEN RAISE EXCEPTION '% unbalanced entries', v_bad; END IF;

  -- tenant balance (global balance follows from per-entry balance)
  SELECT count(*) INTO v_bad FROM (
    SELECT (SELECT coalesce(sum(debit),0) FROM public.journal_lines l
            WHERE l.tenant_id = (SELECT current_setting('g6.tenant'))::uuid) AS d,
           (SELECT coalesce(sum(credit),0) FROM public.journal_lines l
            WHERE l.tenant_id = (SELECT current_setting('g6.tenant'))::uuid) AS c) s
  WHERE s.d <> s.c;
  IF v_bad <> 0 THEN RAISE EXCEPTION 'tenant imbalance'; END IF;

  -- rounding: stored line amount is exact 2dp
  SELECT count(*) INTO v_bad FROM public.invoice_lines il
  JOIN public.invoices i ON i.id = il.invoice_id
  WHERE i.id = v_inv AND il.amount <> 100.00;
  IF v_bad <> 0 THEN RAISE EXCEPTION 'rounding not half-up 2dp'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- invalid batches: unbalanced / zero / negative / unknown account (as owner:
-- triggers + checks fire regardless of role, proving defense in depth)
DO $$
DECLARE v_eid uuid;
BEGIN
  -- Force deferred constraints to fire per-statement so violations surface
  -- inside this block (at normal commit they fire after the block exits and
  -- cannot be trapped). Trigger configuration itself is asserted below.
  SET CONSTRAINTS ALL IMMEDIATE;
  BEGIN
    INSERT INTO public.journal_entries
      (tenant_id, entry_number, entry_date, source_type, source_id, description)
    VALUES ((SELECT current_setting('g6.tenant'))::uuid, 'JE-PROBE-1', CURRENT_DATE,
            'sale', gen_random_uuid(), 'probe')
    RETURNING id INTO v_eid;
    INSERT INTO public.journal_lines
      (tenant_id, journal_entry_id, account_id, line_no, debit, credit)
    VALUES ((SELECT current_setting('g6.tenant'))::uuid, v_eid,
      (SELECT id FROM public.chart_of_accounts WHERE code = '1000'
       AND tenant_id = (SELECT current_setting('g6.tenant'))::uuid),
      1, 100, 0);
    RAISE EXCEPTION 'unbalanced batch was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'unbalanced batch was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.journal_lines
      (tenant_id, journal_entry_id, account_id, line_no, debit, credit)
    VALUES ((SELECT current_setting('g6.tenant'))::uuid, gen_random_uuid(),
      (SELECT id FROM public.chart_of_accounts WHERE code = '1000'
       AND tenant_id = (SELECT current_setting('g6.tenant'))::uuid),
      1, 0, 0);
    RAISE EXCEPTION 'zero line was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'zero line was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.journal_lines
      (tenant_id, journal_entry_id, account_id, line_no, debit, credit)
    VALUES ((SELECT current_setting('g6.tenant'))::uuid, gen_random_uuid(),
      (SELECT id FROM public.chart_of_accounts WHERE code = '1000'
       AND tenant_id = (SELECT current_setting('g6.tenant'))::uuid),
      1, -5, 0);
    RAISE EXCEPTION 'negative debit was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'negative debit was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;

-- balance trigger is configured deferred + enabled (commit-time safety net;
-- the SET CONSTRAINTS probe above proves it fires when forced immediate)
DO $$
BEGIN
  PERFORM 1 FROM pg_trigger
  WHERE tgname = 'trg_journal_lines_balanced'
    AND tgenabled = 'O' AND tgdeferrable AND tginitdeferred;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'balance trigger not deferred+enabled';
  END IF;
END
$$;

-- --------------------------------------------------------------------------
-- B. Immutability: owner UPDATE/DELETE raise; staff denied; cancel mirrors
-- --------------------------------------------------------------------------
DO $$
DECLARE v_eid uuid; v_n integer;
BEGIN
  SELECT e.id INTO v_eid FROM public.journal_entries e
  JOIN public.invoices i ON i.id = e.source_id AND e.source_type = 'sale'
  WHERE i.provisional_number = 'g6-inv-1' LIMIT 1;
  BEGIN
    UPDATE public.journal_entries SET description = 'hacked' WHERE id = v_eid;
    RAISE EXCEPTION 'owner update was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'owner update was NOT blocked' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.journal_entries WHERE id = v_eid;
    RAISE EXCEPTION 'owner delete was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'owner delete was NOT blocked' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.journal_lines SET debit = debit + 1 WHERE journal_entry_id = v_eid;
    RAISE EXCEPTION 'owner line update was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'owner line update was NOT blocked' THEN RAISE; END IF;
  END;
  -- status flip without reversal link is denied even though flips exist
  BEGIN
    UPDATE public.journal_entries SET status = 'reversed' WHERE id = v_eid;
    RAISE EXCEPTION 'linkless flip was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'linkless flip was NOT blocked' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO v_n FROM public.journal_entries WHERE id = v_eid AND status = 'posted';
  IF v_n <> 1 THEN RAISE EXCEPTION 'entry disturbed by blocked writes'; END IF;
END
$$;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g6t';
DO $$
BEGIN
  BEGIN
    UPDATE public.journal_entries SET description = 'x' WHERE entry_number LIKE 'JE-%';
    RAISE EXCEPTION 'staff journal update was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.journal_lines WHERE line_no = 1;
    RAISE EXCEPTION 'staff line delete was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.journal_entries (tenant_id, entry_number, entry_date,
      source_type, source_id, description)
    VALUES (current_setting('request.jwt.claim.tenant_id')::uuid, 'JE-X',
      CURRENT_DATE, 'sale', gen_random_uuid(), 'x');
    RAISE EXCEPTION 'staff journal insert was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- correction only via approved reversal path (cancel -> mirror, links both ways)
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g6t';
DO $$
DECLARE v_orig uuid; v_mirr uuid; v_back uuid; v_o integer; v_m integer;
BEGIN
  SELECT e.id INTO v_orig FROM public.journal_entries e
  JOIN public.invoices i ON i.id = e.source_id AND e.source_type = 'sale'
  WHERE i.provisional_number = 'g6-inv-1' LIMIT 1;
  PERFORM public.cancel_invoice(
    (SELECT current_setting('g6.invoice'))::uuid, 'g6-cancel-1');
  SELECT reversed_by INTO v_mirr FROM public.journal_entries WHERE id = v_orig;
  SELECT reverses INTO v_back FROM public.journal_entries WHERE id = v_mirr;
  IF v_back <> v_orig THEN RAISE EXCEPTION 'mirror link broken'; END IF;
  SELECT count(*) INTO v_o FROM public.journal_lines WHERE journal_entry_id = v_orig;
  SELECT count(*) INTO v_m FROM public.journal_lines WHERE journal_entry_id = v_mirr;
  IF v_o = 0 OR v_o <> v_m THEN RAISE EXCEPTION 'mirror line count wrong'; END IF;
  SELECT count(*) INTO v_o FROM (
    SELECT l.line_no, l.debit AS d1, l.credit AS c1, m.debit AS d2, m.credit AS c2
    FROM public.journal_lines l
    JOIN public.journal_lines m ON m.journal_entry_id = v_mirr AND m.line_no = l.line_no
    WHERE l.journal_entry_id = v_orig
      AND (l.debit <> m.credit OR l.credit <> m.debit)) s;
  IF v_o <> 0 THEN RAISE EXCEPTION 'mirror amounts wrong'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- C. Posting authorization: guards, PUBLIC sweep, tenant isolation on reads
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g6t';
DO $$
BEGIN
  BEGIN
    PERFORM public.reverse_journal_entry(
      (SELECT id FROM public.journal_entries LIMIT 1), 'k');
    RAISE EXCEPTION 'staff reversal was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff reversal was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

DO $$
DECLARE n integer;
BEGIN
  -- no PUBLIC execute on any posting/trigger/helper function
  SELECT count(*) INTO n
  FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace,
       LATERAL aclexplode(p.proacl) AS a
  WHERE s.nspname = 'public'
    AND p.proname IN ('post_journal','reverse_journal_entry',
      'trg_journal_immutable','trg_journal_balanced',
      'allocate_fifo','dues_of','idempotency_begin','idempotency_commit')
    AND a.grantee = 0;
  IF n <> 0 THEN RAISE EXCEPTION 'PUBLIC execute on % posting functions', n; END IF;
END
$$;

-- tenant B batch invisible to tenant A back-office
DO $$
DECLARE v_b uuid;
BEGIN
  SELECT id INTO v_b FROM public.tenants WHERE name = 'Gate Probe Tenant';
  INSERT INTO public.journal_entries
    (tenant_id, entry_number, entry_date, source_type, source_id, description)
  VALUES (v_b, 'JE-B-1', CURRENT_DATE, 'sale', gen_random_uuid(), 'probe B')
  ON CONFLICT (tenant_id, entry_number) DO NOTHING;
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g6t';
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM public.journal_entries LOOP
    IF r.tenant_id::text <> current_setting('request.jwt.claim.tenant_id') THEN
      RAISE EXCEPTION 'admin sees foreign journal';
    END IF;
  END LOOP;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- D. Source linkage: sale, claim, service, reversals, orphan sweep
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g6t';
DO $$
DECLARE v_cl jsonb; v_cid uuid;
BEGIN
  -- recognized claim posts a batch
  v_cl := public.record_claim(
    (SELECT current_setting('g6.customer'))::uuid, NULL,
    'cash', 500,
    (SELECT id FROM public.payment_instruments
     WHERE tenant_id = (SELECT current_setting('g6.tenant'))::uuid
       AND itype = 'cash' AND is_active LIMIT 1),
    'g6-claim-1');
  PERFORM public.recognize_claim((v_cl->>'id')::uuid, 'g6-rec-1');
  PERFORM set_config('g6.claim', (v_cl->>'id'), false);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

DO $$
DECLARE n integer; v_tenant uuid;
BEGIN
  -- Scoped to main tenant: the JE-B-1 isolation probe (other tenant,
  -- intentionally lineless/sourceless) is covered by section C instead.
  v_tenant := (SELECT current_setting('g6.tenant'))::uuid;
  -- every batch created during this run resolves to an existing source
  -- row of matching type (main tenant; JE-B-1 probe excluded by tenant)
  SELECT count(*) INTO n FROM public.journal_entries e
  WHERE e.source_type = 'sale' AND e.tenant_id = v_tenant
    AND e.created_at >= (SELECT current_setting('g6.start'))::timestamptz
    AND NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = e.source_id);
  IF n <> 0 THEN RAISE EXCEPTION '% orphan sale batches', n; END IF;
  SELECT count(*) INTO n FROM public.journal_entries e
  WHERE e.source_type = 'purchase' AND e.tenant_id = v_tenant
    AND e.created_at >= (SELECT current_setting('g6.start'))::timestamptz
    AND NOT EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = e.source_id);
  IF n <> 0 THEN RAISE EXCEPTION '% orphan purchase batches', n; END IF;
  SELECT count(*) INTO n FROM public.journal_entries e
  WHERE e.source_type = 'payment' AND e.tenant_id = v_tenant
    AND e.created_at >= (SELECT current_setting('g6.start'))::timestamptz
    AND NOT EXISTS (SELECT 1 FROM public.payment_claims c WHERE c.id = e.source_id);
  IF n <> 0 THEN RAISE EXCEPTION '% orphan payment batches', n; END IF;
  SELECT count(*) INTO n FROM public.journal_entries e
  WHERE e.source_type = 'service' AND e.tenant_id = v_tenant
    AND e.created_at >= (SELECT current_setting('g6.start'))::timestamptz
    AND NOT EXISTS (SELECT 1 FROM public.service_transactions s WHERE s.id = e.source_id);
  IF n <> 0 THEN RAISE EXCEPTION '% orphan service batches', n; END IF;
  SELECT count(*) INTO n FROM public.journal_entries e
  WHERE e.source_type = 'adjustment' AND e.tenant_id = v_tenant
    AND e.created_at >= (SELECT current_setting('g6.start'))::timestamptz
    AND NOT EXISTS (SELECT 1 FROM public.adjustments a WHERE a.id = e.source_id);
  IF n <> 0 THEN RAISE EXCEPTION '% orphan adjustment batches', n; END IF;
  -- reversal linkage both ways
  SELECT count(*) INTO n FROM public.journal_entries e
  WHERE e.status = 'reversed'
    AND (e.reversed_by IS NULL
         OR NOT EXISTS (SELECT 1 FROM public.journal_entries m
                        WHERE m.id = e.reversed_by AND m.reverses = e.id));
  IF n <> 0 THEN RAISE EXCEPTION '% broken reversal links', n; END IF;
END
$$;

-- --------------------------------------------------------------------------
-- E. Service-leg verification: AEPS exact; others post nothing (deferred)
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g6t';
DO $$
DECLARE
  v_svc jsonb; v_sid uuid;
  v_dr1040 numeric; v_cr1000 numeric; v_cr4020 numeric; v_cr4030 numeric;
  v_lines integer;
BEGIN
  -- AEPS 2000 / fee 15 / commission 6:
  -- Dr 1040 2006 / Cr 1000 1985 / Cr 4020 15 / Cr 4030 6
  v_svc := public.record_service_txn('aeps', CURRENT_DATE, 2000, 15, 6,
    jsonb_build_object('aadhaar_last4','4321','aeps_txn_type','cash_out'),
    'cash',
    (SELECT id FROM public.payment_instruments
     WHERE tenant_id = (SELECT current_setting('g6.tenant'))::uuid
       AND itype = 'cash' AND is_active LIMIT 1),
    'g6-aeps-1');
  v_sid := (v_svc->>'id')::uuid;
  PERFORM set_config('g6.aeps', v_sid::text, false);
  SELECT
    coalesce(sum(debit) FILTER (WHERE a.code = '1040'), 0),
    coalesce(sum(credit) FILTER (WHERE a.code = '1000'), 0),
    coalesce(sum(credit) FILTER (WHERE a.code = '4020'), 0),
    coalesce(sum(credit) FILTER (WHERE a.code = '4030'), 0),
    count(*)
  INTO v_dr1040, v_cr1000, v_cr4020, v_cr4030, v_lines
  FROM public.journal_lines l
  JOIN public.journal_entries e ON e.id = l.journal_entry_id
  JOIN public.chart_of_accounts a ON a.id = l.account_id
  WHERE e.source_type = 'service' AND e.source_id = v_sid;
  IF v_dr1040 <> 2006 OR v_cr1000 <> 1985 OR v_cr4020 <> 15 OR v_cr4030 <> 6
     OR v_lines <> 4 THEN
    RAISE EXCEPTION 'AEPS legs wrong: %/%/%/% lines %',
      v_dr1040, v_cr1000, v_cr4020, v_cr4030, v_lines;
  END IF;

  -- other types record with zero journal legs (deferred scope, documented)
  v_svc := public.record_service_txn('dmt', CURRENT_DATE, 5000, 50, 0,
    jsonb_build_object('sender_name','S','beneficiary_name','B',
      'beneficiary_account','1','transfer_method','bank_account'),
    'cash',
    (SELECT id FROM public.payment_instruments
     WHERE tenant_id = (SELECT current_setting('g6.tenant'))::uuid
       AND itype = 'cash' AND is_active LIMIT 1),
    'g6-dmt-1');
  v_svc := public.record_service_txn('upi', CURRENT_DATE, 500, 0, 0,
    jsonb_build_object('upi_id','u@v','merchant_qr_ref','Q'),
    'cash',
    (SELECT id FROM public.payment_instruments
     WHERE tenant_id = (SELECT current_setting('g6.tenant'))::uuid
       AND itype = 'cash' AND is_active LIMIT 1),
    'g6-upi-1');
  v_svc := public.record_service_txn('recharge', CURRENT_DATE, 199, 0, 2,
    jsonb_build_object('provider_ref','P','receiver_number','9000000001'),
    'cash',
    (SELECT id FROM public.payment_instruments
     WHERE tenant_id = (SELECT current_setting('g6.tenant'))::uuid
       AND itype = 'cash' AND is_active LIMIT 1),
    'g6-rech-1');
  v_svc := public.record_service_txn('bbps', CURRENT_DATE, 1000, 10, 0,
    jsonb_build_object('biller_ref','B','consumer_number','C','bill_amount',990),
    'cash',
    (SELECT id FROM public.payment_instruments
     WHERE tenant_id = (SELECT current_setting('g6.tenant'))::uuid
       AND itype = 'cash' AND is_active LIMIT 1),
    'g6-bbps-1');
  SELECT count(*) INTO v_lines FROM public.journal_entries e
  JOIN public.service_transactions s ON s.id = e.source_id
  WHERE e.source_type = 'service'
    AND s.service_type IN ('dmt','upi','recharge','bbps')
    AND e.tenant_id = (SELECT current_setting('g6.tenant'))::uuid;
  IF v_lines <> 0 THEN
    RAISE EXCEPTION 'non-AEPS service posted % batches (must be 0)', v_lines;
  END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- F. Replay: same key twice -> single batch; cancel replay -> one mirror
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g6t';
DO $$
DECLARE n1 integer; n2 integer; v_cx jsonb;
BEGIN
  PERFORM public.create_sale(
    (SELECT current_setting('g6.customer'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id',
      (SELECT id FROM public.products WHERE name = 'G6 Widget' LIMIT 1),
      'qty', 1, 'rate', 50)), 0, NULL, 'g6-replay', 'g6-replay-key-7');
  PERFORM public.create_sale(
    (SELECT current_setting('g6.customer'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id',
      (SELECT id FROM public.products WHERE name = 'G6 Widget' LIMIT 1),
      'qty', 999, 'rate', 999)), 0, NULL, 'g6-replay2', 'g6-replay-key-7');
  SELECT count(*) INTO n1 FROM public.journal_entries e
  JOIN public.invoices i ON i.id = e.source_id AND e.source_type = 'sale'
  WHERE i.provisional_number IN ('g6-replay', 'g6-replay2');
  IF n1 <> 1 THEN RAISE EXCEPTION 'replay posted % batches, want 1', n1; END IF;

  -- cancel-replay on a dedicated invoice (g6-inv-1 was cancelled in section B)
  v_cx := public.create_sale(
    (SELECT current_setting('g6.customer'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id',
      (SELECT id FROM public.products WHERE name = 'G6 Widget' LIMIT 1),
      'qty', 1, 'rate', 60)), 0, NULL, 'g6-cancel-src', 'g6-cancel-src-key');
  PERFORM public.cancel_invoice((v_cx->>'id')::uuid, 'g6-cancel-replay-1');
  PERFORM public.cancel_invoice((v_cx->>'id')::uuid, 'g6-cancel-replay-1');
  SELECT count(*) INTO n2 FROM public.journal_entries e
  WHERE e.source_type = 'sale'
    AND e.source_id = (v_cx->>'id')::uuid;
  IF n2 <> 2 THEN RAISE EXCEPTION 'cancel replay batches %, want 2', n2; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- G. Failure atomicity + source/journal consistency
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g6t';
DO $$
DECLARE before_n integer; after_n integer; n integer;
BEGIN
  SELECT count(*) INTO before_n FROM public.journal_entries;
  BEGIN
    PERFORM public.create_sale(
      (SELECT current_setting('g6.customer'))::uuid, CURRENT_DATE,
      jsonb_build_array(jsonb_build_object('product_id',
        (SELECT id FROM public.products WHERE name = 'G6 Widget' LIMIT 1),
        'qty', 99999, 'rate', 100)), 0, NULL, 'g6-fail-1', 'g6-fail-key-1');
    RAISE EXCEPTION 'oversell posted (must fail)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'oversell posted (must fail)' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO after_n FROM public.journal_entries;
  IF after_n <> before_n THEN
    RAISE EXCEPTION 'failed posting left % partial batches', after_n - before_n;
  END IF;

  -- every posted uncancelled invoice carries exactly one sale batch
  SELECT count(*) INTO n FROM public.invoices i
  WHERE i.status = 'posted'
    AND (SELECT count(*) FROM public.journal_entries e
         WHERE e.source_type = 'sale' AND e.source_id = i.id) <> 1
    AND i.provisional_number LIKE 'g6-%';
  IF n <> 0 THEN RAISE EXCEPTION '% posted invoices lack exactly one batch', n; END IF;
  -- every cancelled invoice carries exactly two (sale + mirror)
  SELECT count(*) INTO n FROM public.invoices i
  WHERE i.status = 'cancelled'
    AND (SELECT count(*) FROM public.journal_entries e
         WHERE e.source_type = 'sale' AND e.source_id = i.id) <> 2
    AND i.provisional_number LIKE 'g6-%';
  IF n <> 0 THEN RAISE EXCEPTION '% cancelled invoices lack mirror pair', n; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- H. Cross-tenant isolation on writes (scoped post attempts fail loudly)
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
DO $$
BEGIN
  BEGIN
    PERFORM public.create_sale(
      (SELECT id FROM public.customers WHERE name = 'G6 Customer' LIMIT 1),
      CURRENT_DATE,
      jsonb_build_array(jsonb_build_object('product_id',
        (SELECT id FROM public.products WHERE name = 'G6 Widget' LIMIT 1),
        'qty', 1, 'rate', 10)), 0, NULL, 'g6-xeno', 'g6-xeno-key');
    RAISE EXCEPTION 'cross-tenant sale was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'cross-tenant sale was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub;

-- --------------------------------------------------------------------------
-- Teardown gate documents (journals stay: immutable by design).
-- Leaves batches orphaned-by-design; DB is rebuilt for G6 reruns.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  DELETE FROM public.collection_allocations WHERE claim_id IN
    (SELECT id FROM public.payment_claims
     WHERE tenant_id = (SELECT current_setting('g6.tenant'))::uuid
       AND (customer_id IN (SELECT id FROM public.customers WHERE name LIKE 'G6%')
            OR service_transaction_id IS NOT NULL));
  DELETE FROM public.payment_claims
  WHERE tenant_id = (SELECT current_setting('g6.tenant'))::uuid
    AND (customer_id IN (SELECT id FROM public.customers WHERE name LIKE 'G6%')
         OR service_transaction_id IS NOT NULL);
  DELETE FROM public.invoice_line_lots WHERE invoice_line_id IN
    (SELECT il.id FROM public.invoice_lines il
     JOIN public.invoices i ON i.id = il.invoice_id
     WHERE i.provisional_number LIKE 'g6-%');
  DELETE FROM public.invoice_lines WHERE invoice_id IN
    (SELECT id FROM public.invoices WHERE provisional_number LIKE 'g6-%');
  UPDATE public.invoices SET edited_from = NULL, recreated_by = NULL
  WHERE provisional_number LIKE 'g6-%';
  DELETE FROM public.invoices WHERE provisional_number LIKE 'g6-%';
  DELETE FROM public.purchase_lines WHERE purchase_id IN
    (SELECT p.id FROM public.purchases p
     JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE s.name LIKE 'G6%');
  DELETE FROM public.stock_reservations WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g6-%' OR s.name LIKE 'G6%');
  DELETE FROM public.adjustments WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g6-%' OR s.name LIKE 'G6%');
  DELETE FROM public.stock_lots
  WHERE source_ref LIKE 'g6-%'
     OR purchase_id IN (SELECT p.id FROM public.purchases p
                        JOIN public.suppliers s ON s.id = p.supplier_id
                        WHERE s.name LIKE 'G6%');
  DELETE FROM public.purchases WHERE supplier_id IN
    (SELECT id FROM public.suppliers WHERE name LIKE 'G6%');
  DELETE FROM public.service_transactions
  WHERE tenant_id = (SELECT current_setting('g6.tenant'))::uuid
    AND transaction_number LIKE 'SRV-%' AND id NOT IN
    (SELECT id FROM public.service_transactions
     WHERE transaction_number = 'SRV-B-1');
  DELETE FROM public.idempotency_keys WHERE key LIKE 'g6-%';
  DELETE FROM public.products WHERE name LIKE 'G6%';
  DELETE FROM public.suppliers WHERE name LIKE 'G6%';
  DELETE FROM public.customers WHERE name LIKE 'G6%';
END
$$;

SELECT 'G6_GATE_ALL_GREEN' AS gate_result;
