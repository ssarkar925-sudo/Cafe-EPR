-- ============================================================================
-- G8 EXIT GATE — fails (RAISE EXCEPTION, nonzero exit) on any mismatch.
-- Requires: G0-G7 applied. Run with ON_ERROR_STOP=1. Local test DB only.
-- Fixed gate dates (2026-03-10/11) make reruns idempotent via cleanup-first.
-- ============================================================================

SELECT id AS g8t FROM public.tenants
WHERE name = 'CyberCafe & Digital Services ERP' LIMIT 1 \gset
SELECT set_config('g8.tenant', :'g8t', false);

-- --------------------------------------------------------------------------
-- 0. Cleanup-first + manager fixture (as owner)
-- --------------------------------------------------------------------------
DO $$
BEGIN
  DELETE FROM public.day_close_lines WHERE day_close_id IN
    (SELECT id FROM public.day_closes
     WHERE tenant_id = (SELECT current_setting('g8.tenant'))::uuid
       AND business_date IN (DATE '2026-03-10', DATE '2026-03-11'));
  DELETE FROM public.period_locks
  WHERE tenant_id = (SELECT current_setting('g8.tenant'))::uuid
    AND locked_date IN (DATE '2026-03-10', DATE '2026-03-11');
  DELETE FROM public.day_closes
  WHERE tenant_id = (SELECT current_setting('g8.tenant'))::uuid
    AND business_date IN (DATE '2026-03-10', DATE '2026-03-11');
  DELETE FROM public.idempotency_keys WHERE key LIKE 'g8-%';
  -- sale-capable fixtures from prior runs (non-'Gate' names)
  DELETE FROM public.stock_reservations WHERE lot_id IN
    (SELECT id FROM public.stock_lots WHERE source_ref LIKE 'g8-%');
  DELETE FROM public.adjustments WHERE lot_id IN
    (SELECT id FROM public.stock_lots WHERE source_ref LIKE 'g8-%');
  DELETE FROM public.purchase_lines WHERE purchase_id IN
    (SELECT p.id FROM public.purchases p
     JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE s.name = 'G8 Supplier');
  DELETE FROM public.stock_lots
  WHERE source_ref LIKE 'g8-%'
     OR purchase_id IN (SELECT p.id FROM public.purchases p
                        JOIN public.suppliers s ON s.id = p.supplier_id
                        WHERE s.name = 'G8 Supplier');
  DELETE FROM public.purchases WHERE supplier_id IN
    (SELECT id FROM public.suppliers WHERE name = 'G8 Supplier');
  DELETE FROM public.products WHERE name = 'G8 Widget';
  DELETE FROM public.suppliers WHERE name = 'G8 Supplier';

  INSERT INTO auth.users (id) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0002')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (user_id, tenant_id, display_name, role)
  VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0002',
    (SELECT current_setting('g8.tenant'))::uuid, 'Gate Manager', 'manager')
  ON CONFLICT (user_id) DO UPDATE SET role = 'manager', is_active = true;
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g8t';
DO $$
DECLARE v_sup uuid; v_prod uuid;
BEGIN
  -- sale-capable fixtures (non-'Gate'-prefixed to stay clear of other gates)
  v_sup := public.mg_supplier_upsert(NULL, 'G8 Supplier', NULL, true);
  v_prod := public.mg_product_upsert(NULL, 'G8 Widget', 'G8W-1', 'G8W-BAR-1',
    'pc', 100, 60, 'GENERAL', true);
  PERFORM public.create_purchase(v_sup, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', v_prod,
      'qty', 50, 'unit_cost', 10, 'expiry_date', '2028-01-01',
      'source_ref', 'g8-stock-fixture')),
    'g8-stock-fixture-key');
  PERFORM set_config('g8.product', v_prod::text, false);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 1. Open happy (manager): snapshot lines per active instrument
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'eeeeeeee-eeee-eeee-eeee-eeeeeeee0002';
SET request.jwt.claim.tenant_id = :'g8t';
DO $$
DECLARE v_close uuid; v_lines integer; v_active integer;
BEGIN
  v_close := public.open_day_close(DATE '2026-03-10');
  PERFORM set_config('g8.close1', v_close::text, false);
  SELECT count(*) INTO v_lines FROM public.day_close_lines
  WHERE day_close_id = v_close;
  SELECT count(*) INTO v_active FROM public.payment_instruments
  WHERE tenant_id = (SELECT current_setting('g8.tenant'))::uuid AND is_active;
  IF v_lines <> v_active OR v_lines < 1 THEN
    RAISE EXCEPTION 'snapshot lines %, active instruments %', v_lines, v_active;
  END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- cashier cannot open (not back-office)
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SET request.jwt.claim.tenant_id = :'g8t';
DO $$
BEGIN
  BEGIN
    PERFORM public.open_day_close(DATE '2026-03-10');
    RAISE EXCEPTION 'cashier open was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'cashier open was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 2. Exact counts -> close -> locked, no journal, lock row, audit row
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'eeeeeeee-eeee-eeee-eeee-eeeeeeee0002';
SET request.jwt.claim.tenant_id = :'g8t';
DO $$
DECLARE v_payload jsonb := '[]'::jsonb; r record; v_r jsonb; v_st text;
BEGIN
  FOR r IN SELECT instrument_id, expected FROM public.day_close_lines
           WHERE day_close_id = (SELECT current_setting('g8.close1'))::uuid
           ORDER BY instrument_id LOOP
    v_payload := v_payload || jsonb_build_array(jsonb_build_object(
      'instrument_id', r.instrument_id, 'counted', r.expected));
  END LOOP;
  PERFORM public.record_day_counts(
    (SELECT current_setting('g8.close1'))::uuid, v_payload, 'g8-count-1');
  v_r := public.close_day_close(
    (SELECT current_setting('g8.close1'))::uuid, 'g8-close-1');
  IF (v_r->>'status') <> 'locked' THEN RAISE EXCEPTION 'not locked'; END IF;
  IF (v_r->>'variance')::numeric <> 0 THEN RAISE EXCEPTION 'variance not zero'; END IF;
  SELECT status INTO v_st FROM public.day_closes
  WHERE id = (SELECT current_setting('g8.close1'))::uuid;
  IF v_st <> 'locked' THEN RAISE EXCEPTION 'row not locked'; END IF;
  PERFORM 1 FROM public.period_locks
  WHERE day_close_id = (SELECT current_setting('g8.close1'))::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'period lock missing'; END IF;
  PERFORM 1 FROM public.audit_logs
  WHERE action = 'day_close_locked'
    AND entity_id = (SELECT current_setting('g8.close1'))::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'lock audit missing'; END IF;
  -- double close denied
  BEGIN
    PERFORM public.close_day_close(
      (SELECT current_setting('g8.close1'))::uuid, 'g8-close-1b');
    RAISE EXCEPTION 'double close was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'double close was NOT rejected' THEN RAISE; END IF;
  END;
  -- record after lock denied
  BEGIN
    PERFORM public.record_day_counts(
      (SELECT current_setting('g8.close1'))::uuid, v_payload, 'g8-count-1b');
    RAISE EXCEPTION 'post-lock record was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'post-lock record was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 3. Over-tolerance: pending, no journal/lock; staff approve denied;
--    admin approves -> locked + balanced journal + audit
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'eeeeeeee-eeee-eeee-eeee-eeeeeeee0002';
SET request.jwt.claim.tenant_id = :'g8t';
DO $$
DECLARE
  v_close uuid; v_payload jsonb := '[]'::jsonb; r record;
  v_r jsonb; v_n integer;
BEGIN
  v_close := public.open_day_close(DATE '2026-03-11');
  PERFORM set_config('g8.close2', v_close::text, false);
  FOR r IN SELECT instrument_id, expected FROM public.day_close_lines
           WHERE day_close_id = v_close ORDER BY instrument_id LOOP
    v_payload := v_payload || jsonb_build_array(jsonb_build_object(
      'instrument_id', r.instrument_id,
      'counted', CASE WHEN r.instrument_id =
        (SELECT id FROM public.payment_instruments
         WHERE tenant_id = (SELECT current_setting('g8.tenant'))::uuid
           AND itype = 'cash' AND is_active LIMIT 1)
                      THEN r.expected + 5 ELSE r.expected END));
  END LOOP;
  PERFORM public.record_day_counts(v_close, v_payload, 'g8-count-2');
  v_r := public.close_day_close(v_close, 'g8-close-2');
  IF (v_r->>'status') <> 'variance_pending' THEN RAISE EXCEPTION 'not pending'; END IF;
  IF abs((v_r->>'variance')::numeric) <= 1 THEN RAISE EXCEPTION 'variance lost'; END IF;
  SELECT count(*) INTO v_n FROM public.journal_entries
  WHERE source_type = 'variance' AND source_id = v_close;
  IF v_n <> 0 THEN RAISE EXCEPTION 'journal posted before approval'; END IF;
  SELECT count(*) INTO v_n FROM public.period_locks WHERE day_close_id = v_close;
  IF v_n <> 0 THEN RAISE EXCEPTION 'locked before approval'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g8t';
DO $$
BEGIN
  BEGIN
    PERFORM public.approve_day_close(
      (SELECT current_setting('g8.close2'))::uuid, 'g7 staff try', 'g8-appr-x');
    RAISE EXCEPTION 'staff approve was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff approve was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g8t';
DO $$
DECLARE
  v_r jsonb; v_jid uuid; v_d numeric; v_c numeric; v_cash text;
BEGIN
  v_r := public.approve_day_close(
    (SELECT current_setting('g8.close2'))::uuid, 'g8 admin review', 'g8-appr-1');
  IF (v_r->>'status') <> 'locked' THEN RAISE EXCEPTION 'not locked'; END IF;
  SELECT variance_journal_id INTO v_jid FROM public.day_closes
  WHERE id = (SELECT current_setting('g8.close2'))::uuid;
  IF v_jid IS NULL THEN RAISE EXCEPTION 'variance journal missing'; END IF;
  SELECT coalesce(sum(debit),0), coalesce(sum(credit),0) INTO v_d, v_c
  FROM public.journal_lines WHERE journal_entry_id = v_jid;
  IF v_d <> v_c OR v_d <= 0 THEN RAISE EXCEPTION 'variance journal unbalanced'; END IF;
  IF v_d <> 5 THEN RAISE EXCEPTION 'variance journal %, want 5', v_d; END IF;
  SELECT a.code INTO v_cash FROM public.journal_lines l
  JOIN public.chart_of_accounts a ON a.id = l.account_id
  WHERE l.journal_entry_id = v_jid AND l.debit > 0 LIMIT 1;
  IF v_cash NOT IN ('1000','1010','1020','1030') THEN
    RAISE EXCEPTION 'variance debit not an instrument asset: %', v_cash;
  END IF;
  PERFORM 1 FROM public.audit_logs
  WHERE action = 'day_close_approved'
    AND entity_id = (SELECT current_setting('g8.close2'))::text
    AND details->>'journal_id' = v_jid::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'approval audit missing journal'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 4. Locked-period posting denied (sale + purchase on locked date)
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g8t';
DO $$
DECLARE n_before integer; n_after integer;
BEGIN
  SELECT count(*) INTO n_before FROM public.invoices;
  BEGIN
    PERFORM public.create_sale(NULL, DATE '2026-03-10',
      jsonb_build_array(jsonb_build_object('product_id',
        current_setting('g8.product'),
        'qty', 1, 'rate', 10)), 0, NULL, 'g8-locked-probe', 'g8-locked-key-1');
    RAISE EXCEPTION 'locked-date sale posted (must fail)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'locked-date sale posted (must fail)' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%locked period%' THEN
      RAISE EXCEPTION 'wrong rejection for locked date: %', SQLERRM;
    END IF;
  END;
  SELECT count(*) INTO n_after FROM public.invoices;
  IF n_after <> n_before THEN RAISE EXCEPTION 'locked posting left an invoice'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 5. RLS: back-office reads; others see nothing; direct DML denied
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g8t';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM public.day_closes;
  IF c <> 0 THEN RAISE EXCEPTION 'staff sees closes'; END IF;
  SELECT count(*) INTO c FROM public.period_locks;
  IF c <> 0 THEN RAISE EXCEPTION 'staff sees locks'; END IF;
  BEGIN
    INSERT INTO public.day_closes (tenant_id, business_date)
    VALUES (current_setting('request.jwt.claim.tenant_id')::uuid, CURRENT_DATE);
    RAISE EXCEPTION 'staff close insert was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.day_closes SET status = 'open' WHERE business_date = DATE '2026-03-10';
    RAISE EXCEPTION 'staff close update was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'eeeeeeee-eeee-eeee-eeee-eeeeeeee0002';
SET request.jwt.claim.tenant_id = :'g8t';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM public.day_closes
  WHERE tenant_id = (SELECT current_setting('g8.tenant'))::uuid;
  IF c < 2 THEN RAISE EXCEPTION 'manager sees % closes, want >= 2', c; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 6. Teardown gate closes (journals stay: immutable by design)
-- --------------------------------------------------------------------------
DO $$
BEGIN
  DELETE FROM public.day_close_lines WHERE day_close_id IN
    (SELECT id FROM public.day_closes
     WHERE tenant_id = (SELECT current_setting('g8.tenant'))::uuid
       AND business_date IN (DATE '2026-03-10', DATE '2026-03-11'));
  DELETE FROM public.period_locks
  WHERE tenant_id = (SELECT current_setting('g8.tenant'))::uuid
    AND locked_date IN (DATE '2026-03-10', DATE '2026-03-11');
  DELETE FROM public.day_closes
  WHERE tenant_id = (SELECT current_setting('g8.tenant'))::uuid
    AND business_date IN (DATE '2026-03-10', DATE '2026-03-11');
  DELETE FROM public.idempotency_keys WHERE key LIKE 'g8-%';
  -- sale-capable fixtures (non-'Gate' names stay clear of other gates)
  DELETE FROM public.stock_reservations WHERE lot_id IN
    (SELECT id FROM public.stock_lots WHERE source_ref LIKE 'g8-%');
  DELETE FROM public.adjustments WHERE lot_id IN
    (SELECT id FROM public.stock_lots WHERE source_ref LIKE 'g8-%');
  DELETE FROM public.purchase_lines WHERE purchase_id IN
    (SELECT p.id FROM public.purchases p
     JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE s.name = 'G8 Supplier');
  DELETE FROM public.stock_lots
  WHERE source_ref LIKE 'g8-%'
     OR purchase_id IN (SELECT p.id FROM public.purchases p
                        JOIN public.suppliers s ON s.id = p.supplier_id
                        WHERE s.name = 'G8 Supplier');
  DELETE FROM public.purchases WHERE supplier_id IN
    (SELECT id FROM public.suppliers WHERE name = 'G8 Supplier');
  DELETE FROM public.products WHERE name = 'G8 Widget';
  DELETE FROM public.suppliers WHERE name = 'G8 Supplier';
  DELETE FROM public.profiles
  WHERE display_name = 'Gate Manager'
    AND NOT EXISTS (SELECT 1 FROM public.day_closes c
                    WHERE c.opened_by_profile = profiles.id
                       OR c.closed_by_profile = profiles.id
                       OR c.approved_by_profile = profiles.id)
    AND NOT EXISTS (SELECT 1 FROM public.period_locks l
                    WHERE l.locked_by_profile = profiles.id)
    AND NOT EXISTS (SELECT 1 FROM public.audit_logs l
                    WHERE l.actor_profile_id = profiles.id);
  DELETE FROM auth.users
  WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeee0002'
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.users.id);
END
$$;

SELECT 'G8_GATE_ALL_GREEN' AS gate_result;
