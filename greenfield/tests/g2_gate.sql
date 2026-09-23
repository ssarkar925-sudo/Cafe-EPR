-- ============================================================================
-- G2 EXIT GATE — fails (RAISE EXCEPTION, nonzero exit) on any mismatch.
-- Requires: G0+G1 applied (+ their fixtures). Run with ON_ERROR_STOP=1.
-- Local test DB only. Gate rows are tagged source_ref/reason 'gate-%' and
-- cleaned at start for idempotent reruns.
-- ============================================================================

SELECT id AS g2t FROM public.tenants
WHERE name = 'CyberCafe & Digital Services ERP' LIMIT 1 \gset
SELECT set_config('g2.tenant', :'g2t', false);
SELECT set_config('g2.tenant', :'g2t', false);

-- --------------------------------------------------------------------------
-- 0. Fixtures: supplier + product via G1 RPCs (admin); clean prior gate rows
-- --------------------------------------------------------------------------
DO $$
BEGIN
  -- Later-group dependents first (guarded: keeps this gate runnable on a
  -- G0-G2-only database where G3 tables do not exist yet).
  -- Delete order respects RESTRICT FKs: children before parents.
  IF to_regclass('public.invoices') IS NOT NULL THEN
    -- Children first while links are intact (link-aware: tagged rows AND
    -- their partners, since edit-created rows carry NULL provisional).
    DELETE FROM public.invoice_line_lots WHERE invoice_line_id IN
      (SELECT il.id FROM public.invoice_lines il
       JOIN public.invoices i ON i.id = il.invoice_id
       WHERE i.provisional_number LIKE 'gate-%'
          OR i.id IN (SELECT edited_from FROM public.invoices
                      WHERE provisional_number LIKE 'gate-%')
          OR i.id IN (SELECT recreated_by FROM public.invoices
                      WHERE provisional_number LIKE 'gate-%'));
    DELETE FROM public.invoice_lines WHERE invoice_id IN
      (SELECT id FROM public.invoices WHERE provisional_number LIKE 'gate-%'
       UNION
       SELECT edited_from FROM public.invoices WHERE provisional_number LIKE 'gate-%'
       UNION
       SELECT recreated_by FROM public.invoices WHERE provisional_number LIKE 'gate-%');
    -- Then break self-references (RESTRICT both ways) and delete parents,
    -- including now-childless ex-partners (test DB holds gate rows only).
    UPDATE public.invoices SET edited_from = NULL, recreated_by = NULL
    WHERE provisional_number LIKE 'gate-%'
       OR id IN (SELECT edited_from FROM public.invoices WHERE provisional_number LIKE 'gate-%')
       OR id IN (SELECT recreated_by FROM public.invoices WHERE provisional_number LIKE 'gate-%');
    DELETE FROM public.invoices WHERE provisional_number LIKE 'gate-%'
       OR (edited_from IS NULL AND recreated_by IS NULL
           AND id NOT IN (SELECT invoice_id FROM public.invoice_lines)
           AND created_at > now() - interval '1 day');
  END IF;
  IF to_regclass('public.purchases') IS NOT NULL THEN
    DELETE FROM public.purchase_lines WHERE purchase_id IN
      (SELECT p.id FROM public.purchases p
       JOIN public.suppliers s ON s.id = p.supplier_id
       WHERE s.name LIKE 'Gate %');
    DELETE FROM public.stock_reservations WHERE lot_id IN
      (SELECT l.id FROM public.stock_lots l
       LEFT JOIN public.purchases p ON p.id = l.purchase_id
       LEFT JOIN public.suppliers s ON s.id = p.supplier_id
       WHERE l.source_ref LIKE 'gate-%' OR s.name LIKE 'Gate %');
    DELETE FROM public.adjustments WHERE reason LIKE 'gate%';
    DELETE FROM public.stock_lots
    WHERE source_ref LIKE 'gate-%'
       OR purchase_id IN (SELECT p.id FROM public.purchases p
                          JOIN public.suppliers s ON s.id = p.supplier_id
                          WHERE s.name LIKE 'Gate %');
    DELETE FROM public.purchases WHERE supplier_id IN
      (SELECT id FROM public.suppliers WHERE name LIKE 'Gate %');
    DELETE FROM public.idempotency_keys WHERE key LIKE 'gate-%';
  ELSE
    DELETE FROM public.stock_reservations WHERE lot_id IN
      (SELECT id FROM public.stock_lots WHERE source_ref LIKE 'gate-%');
    DELETE FROM public.adjustments WHERE reason LIKE 'gate%';
    DELETE FROM public.stock_lots WHERE source_ref LIKE 'gate-%';
  END IF;
  DELETE FROM public.products WHERE name LIKE 'Gate %';
  DELETE FROM public.suppliers WHERE name LIKE 'Gate %';
  DELETE FROM public.customers WHERE name LIKE 'Gate %';
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g2t';
DO $$
DECLARE v_sup uuid; v_prod uuid;
BEGIN
  v_sup := public.mg_supplier_upsert(NULL, 'Gate Supplier 2', NULL, true);
  PERFORM set_config('g2.supplier', v_sup::text, false);
  v_prod := public.mg_product_upsert(NULL, 'Gate Widget', 'GW-1', 'GW-BAR-1',
    'pc', 100, 60, 'GENERAL', true);
  PERFORM set_config('g2.product', v_prod::text, false);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 1. Intake happy path + FIFO order (admin)
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g2t';
DO $$
DECLARE
  v_ids uuid[]; v_first uuid; v_second text;
BEGIN
  v_ids := public.intake_lots(
    (SELECT current_setting('g2.supplier'))::uuid,
    jsonb_build_array(
      jsonb_build_object('product_id', current_setting('g2.product'),
        'qty', 10, 'unit_cost', 50, 'received_at', '2026-01-05T10:00:00Z',
        'expiry_date', '2027-01-01', 'source_ref', 'gate-newer'),
      jsonb_build_object('product_id', current_setting('g2.product'),
        'qty', 10, 'unit_cost', 40, 'received_at', '2026-01-02T10:00:00Z',
        'expiry_date', '2027-06-01', 'source_ref', 'gate-older')));
  IF coalesce(array_length(v_ids, 1), 0) <> 2 THEN
    RAISE EXCEPTION 'intake returned % lots, want 2', array_length(v_ids, 1);
  END IF;
  SELECT id INTO v_first FROM public.stock_lots
  WHERE source_ref LIKE 'gate-%' ORDER BY received_at ASC, id ASC LIMIT 1;
  SELECT source_ref INTO v_second FROM public.stock_lots WHERE id = v_first;
  IF v_second <> 'gate-older' THEN
    RAISE EXCEPTION 'FIFO order broken, oldest is %', v_second;
  END IF;
  PERFORM set_config('g2.lot_old', (SELECT id::text FROM public.stock_lots WHERE source_ref = 'gate-older' LIMIT 1), false);
  PERFORM set_config('g2.lot_new', (SELECT id::text FROM public.stock_lots WHERE source_ref = 'gate-newer' LIMIT 1), false);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 2. Intake validation failures
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g2t';
DO $$
BEGIN
  BEGIN
    PERFORM public.intake_lots((SELECT current_setting('g2.supplier'))::uuid,
      jsonb_build_array(jsonb_build_object('product_id', current_setting('g2.product'),
        'qty', 5, 'unit_cost', 10, 'source_ref', 'gate-noexp')));
    RAISE EXCEPTION 'missing expiry was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'missing expiry was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.intake_lots((SELECT current_setting('g2.supplier'))::uuid,
      jsonb_build_array(jsonb_build_object('product_id', current_setting('g2.product'),
        'qty', 0, 'unit_cost', 10, 'expiry_date', '2027-01-01')));
    RAISE EXCEPTION 'zero qty was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'zero qty was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.intake_lots((SELECT current_setting('g2.supplier'))::uuid,
      jsonb_build_array(jsonb_build_object('product_id', '99999999-9999-9999-9999-999999999999',
        'qty', 1, 'unit_cost', 10, 'expiry_date', '2027-01-01')));
    RAISE EXCEPTION 'unknown product was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'unknown product was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- staff intake denied (back-office only)
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g2t';
DO $$
BEGIN
  BEGIN
    PERFORM public.intake_lots(NULL, jsonb_build_array(jsonb_build_object(
      'product_id', current_setting('g2.product'), 'qty', 1,
      'unit_cost', 1, 'expiry_date', '2027-01-01')));
    RAISE EXCEPTION 'staff intake was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff intake was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 3. Reserve: hold created, remaining untouched, over-reserve denied
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g2t';
DO $$
DECLARE v_res uuid; v_rem numeric; v_status text;
BEGIN
  v_res := public.reserve_stock(
    (SELECT current_setting('g2.lot_new'))::uuid, 3, NULL, NULL, 24);
  PERFORM set_config('g2.res1', v_res::text, false);
  SELECT qty_remaining INTO v_rem FROM public.stock_lots
  WHERE id = (SELECT current_setting('g2.lot_new'))::uuid;
  IF v_rem <> 10 THEN RAISE EXCEPTION 'reserve mutated remaining: %', v_rem; END IF;
  BEGIN
    PERFORM public.reserve_stock(
      (SELECT current_setting('g2.lot_new'))::uuid, 999, NULL, NULL, 24);
    RAISE EXCEPTION 'over-reserve was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'over-reserve was NOT rejected' THEN RAISE; END IF;
  END;
  SELECT status INTO v_status FROM public.stock_reservations WHERE id = v_res;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'reservation not active'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- staff reserve denied
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g2t';
DO $$
BEGIN
  BEGIN
    PERFORM public.reserve_stock(
      (SELECT current_setting('g2.lot_new'))::uuid, 1, NULL, NULL, 24);
    RAISE EXCEPTION 'staff reserve was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff reserve was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 4. Release: status flips; double-release errors
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g2t';
DO $$
DECLARE v_status text;
BEGIN
  PERFORM public.release_reservation(
    (SELECT current_setting('g2.res1'))::uuid, 'gate test');
  SELECT status INTO v_status FROM public.stock_reservations
  WHERE id = (SELECT current_setting('g2.res1'))::uuid;
  IF v_status <> 'released' THEN RAISE EXCEPTION 'release failed'; END IF;
  BEGIN
    PERFORM public.release_reservation(
      (SELECT current_setting('g2.res1'))::uuid, 'again');
    RAISE EXCEPTION 'double release was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'double release was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 5. Quarantine: status + event; adjust blocked on quarantined; reopen
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g2t';
DO $$
DECLARE v_status text; v_adj integer;
BEGIN
  PERFORM public.quarantine_lot(
    (SELECT current_setting('g2.lot_old'))::uuid, 'gate damage check');
  SELECT status INTO v_status FROM public.stock_lots
  WHERE id = (SELECT current_setting('g2.lot_old'))::uuid;
  IF v_status <> 'quarantined' THEN RAISE EXCEPTION 'quarantine failed'; END IF;
  SELECT count(*) INTO v_adj FROM public.adjustments
  WHERE lot_id = (SELECT current_setting('g2.lot_old'))::uuid;
  IF v_adj < 1 THEN RAISE EXCEPTION 'quarantine event missing'; END IF;

  BEGIN
    PERFORM public.adjust_stock(
      (SELECT current_setting('g2.lot_old'))::uuid, -1, 'damage', 'gate x');
    RAISE EXCEPTION 'quarantined adjust was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'quarantined adjust was NOT blocked' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.reserve_stock(
      (SELECT current_setting('g2.lot_old'))::uuid, 1, NULL, NULL, 24);
    RAISE EXCEPTION 'quarantined reserve was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'quarantined reserve was NOT blocked' THEN RAISE; END IF;
  END;

  PERFORM public.reopen_lot(
    (SELECT current_setting('g2.lot_old'))::uuid, 'gate cleared');
  SELECT status INTO v_status FROM public.stock_lots
  WHERE id = (SELECT current_setting('g2.lot_old'))::uuid;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'reopen failed'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 6. Adjust: decrement within stock; below-zero denied; staff denied
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g2t';
DO $$
DECLARE v_rem numeric;
BEGIN
  PERFORM public.adjust_stock(
    (SELECT current_setting('g2.lot_new'))::uuid, -2, 'damage', 'gate breakage');
  SELECT qty_remaining INTO v_rem FROM public.stock_lots
  WHERE id = (SELECT current_setting('g2.lot_new'))::uuid;
  IF v_rem <> 8 THEN RAISE EXCEPTION 'adjust math wrong: %', v_rem; END IF;
  BEGIN
    PERFORM public.adjust_stock(
      (SELECT current_setting('g2.lot_new'))::uuid, -999, 'damage', 'gate x');
    RAISE EXCEPTION 'negative drive was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'negative drive was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g2t';
DO $$
BEGIN
  BEGIN
    PERFORM public.adjust_stock(
      (SELECT current_setting('g2.lot_new'))::uuid, -1, 'damage', 'gate x');
    RAISE EXCEPTION 'staff adjust was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff adjust was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 7. Expiry sweeper + expired reserve/hold sweepers + stuck holds
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g2t';
DO $$
DECLARE v_ids uuid[]; v_status text; v_n integer; v_oldhold uuid;
BEGIN
  v_ids := public.intake_lots(
    (SELECT current_setting('g2.supplier'))::uuid,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('g2.product'),
      'qty', 5, 'unit_cost', 20, 'expiry_date', CURRENT_DATE - 1,
      'source_ref', 'gate-expired')));
  v_n := public.expire_overdue_lots();
  IF v_n < 1 THEN RAISE EXCEPTION 'sweeper expired nothing'; END IF;
  SELECT status INTO v_status FROM public.stock_lots WHERE id = v_ids[1];
  IF v_status <> 'expired' THEN RAISE EXCEPTION 'lot not expired'; END IF;
  BEGIN
    PERFORM public.reserve_stock(v_ids[1], 1, NULL, NULL, 24);
    RAISE EXCEPTION 'expired reserve was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'expired reserve was NOT blocked' THEN RAISE; END IF;
  END;

  -- past-hold reservation via negative hours, then sweep
  v_oldhold := public.reserve_stock(
    (SELECT current_setting('g2.lot_new'))::uuid, 1, NULL, NULL, -1);
  v_n := public.release_expired_reservations();
  IF v_n < 1 THEN RAISE EXCEPTION 'hold sweeper released nothing'; END IF;
  SELECT status INTO v_status FROM public.stock_reservations WHERE id = v_oldhold;
  IF v_status <> 'expired' THEN RAISE EXCEPTION 'hold not expired'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- stuck holds: plant an active hold aged beyond 48h (as owner), expect listing
DO $$
DECLARE v_r uuid;
BEGIN
  INSERT INTO public.stock_reservations
    (tenant_id, lot_id, qty, hold_expires_at, created_at)
  VALUES ((SELECT current_setting('g2.tenant'))::uuid,
    (SELECT current_setting('g2.lot_new'))::uuid,
    1, now() + interval '1 hour', now() - interval '50 hours')
  RETURNING id INTO v_r;
  PERFORM set_config('g2.stuck', v_r::text, false);
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g2t';
DO $$
DECLARE v_seen uuid;
BEGIN
  IF current_setting('g2.stuck', true) <> '' THEN
    SELECT reservation_id INTO v_seen FROM public.stuck_holds()
    WHERE reservation_id = current_setting('g2.stuck')::uuid;
    IF v_seen IS NULL THEN RAISE EXCEPTION 'stuck hold not listed'; END IF;
  END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- service_role sweeper path (job identity via JWT claim, as designed)
SET ROLE service_role;
SET request.jwt.claim.role = 'service_role';
DO $$
DECLARE v_n integer;
BEGIN
  v_n := public.expire_overdue_lots();
  v_n := public.release_expired_reservations();
END
$$;
RESET ROLE; RESET request.jwt.claim.role;

-- --------------------------------------------------------------------------
-- 8. RLS: scoped reads, cross-tenant invisibility, RPC-only writes
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g2t';
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM public.stock_lots LOOP
    IF r.tenant_id::text <> current_setting('request.jwt.claim.tenant_id') THEN
      RAISE EXCEPTION 'staff sees foreign lot';
    END IF;
  END LOOP;
  PERFORM 1 FROM public.adjustments LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'staff sees adjustments'; END IF;
  BEGIN
    INSERT INTO public.stock_lots (tenant_id, product_id, qty_received,
      qty_remaining, unit_cost, expiry_date)
    VALUES (current_setting('request.jwt.claim.tenant_id')::uuid,
      (SELECT current_setting('g2.product'))::uuid, 1, 1, 1, CURRENT_DATE + 30);
    RAISE EXCEPTION 'staff lot insert was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SELECT 'G2_GATE_ALL_GREEN' AS gate_result;
