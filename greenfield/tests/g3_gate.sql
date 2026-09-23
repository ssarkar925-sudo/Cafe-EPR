-- ============================================================================
-- G3 EXIT GATE — fails (RAISE EXCEPTION, nonzero exit) on any mismatch.
-- Requires: G0+G1+G2 applied. Run with ON_ERROR_STOP=1. Local test DB only.
-- Gate rows are tagged (provisional 'gate-%', source_ref 'gate-%', names
-- 'Gate %') and cleaned first for idempotent reruns.
-- ============================================================================

SELECT id AS g3t FROM public.tenants
WHERE name = 'CyberCafe & Digital Services ERP' LIMIT 1 \gset
SELECT set_config('g3.tenant', :'g3t', false);

-- --------------------------------------------------------------------------
-- 0. Cleanup + fixtures (admin RPCs for supplier/customer/product)
-- --------------------------------------------------------------------------
DO $$
BEGIN
  DELETE FROM public.stock_reservations WHERE lot_id IN
    (SELECT id FROM public.stock_lots WHERE source_ref LIKE 'gate-%');
  DELETE FROM public.adjustments WHERE reason LIKE 'gate%';
  -- Children first while links intact (link-aware: tagged + partners);
  -- then break self-refs and delete parents incl. childless ex-partners.
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
  UPDATE public.invoices SET edited_from = NULL, recreated_by = NULL
  WHERE provisional_number LIKE 'gate-%'
     OR id IN (SELECT edited_from FROM public.invoices WHERE provisional_number LIKE 'gate-%')
     OR id IN (SELECT recreated_by FROM public.invoices WHERE provisional_number LIKE 'gate-%');
  DELETE FROM public.invoices WHERE provisional_number LIKE 'gate-%'
     OR (edited_from IS NULL AND recreated_by IS NULL
         AND id NOT IN (SELECT invoice_id FROM public.invoice_lines)
         AND created_at > now() - interval '1 day');
  DELETE FROM public.purchase_lines WHERE purchase_id IN
    (SELECT p.id FROM public.purchases p
     JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE s.name LIKE 'Gate %');
  DELETE FROM public.stock_reservations WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'gate-%' OR s.name LIKE 'Gate %');
  DELETE FROM public.adjustments WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'gate-%' OR s.name LIKE 'Gate %');
  DELETE FROM public.stock_lots
  WHERE source_ref LIKE 'gate-%'
     OR purchase_id IN (SELECT p.id FROM public.purchases p
                        JOIN public.suppliers s ON s.id = p.supplier_id
                        WHERE s.name LIKE 'Gate %');
  DELETE FROM public.purchases WHERE supplier_id IN
    (SELECT id FROM public.suppliers WHERE name LIKE 'Gate %');
  DELETE FROM public.products WHERE name LIKE 'Gate %';
  DELETE FROM public.suppliers WHERE name LIKE 'Gate %';
  DELETE FROM public.customers WHERE name LIKE 'Gate %';
  DELETE FROM public.idempotency_keys WHERE key LIKE 'gate-%';
END
$$;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g3t';
DO $$
DECLARE v_sup uuid; v_cust uuid; v_prod uuid;
BEGIN
  v_sup := public.mg_supplier_upsert(NULL, 'Gate G3 Supplier', NULL, true);
  PERFORM set_config('g3.supplier', v_sup::text, false);
  v_cust := public.mg_customer_upsert(NULL, 'Gate G3 Customer', NULL, 1000000, true);
  -- NOTE: high limit: G4 enforces khata limits at sale time (approved spec);
  -- the G3 customer must clear all gate sale totals.
  PERFORM set_config('g3.customer', v_cust::text, false);
  v_prod := public.mg_product_upsert(NULL, 'Gate G3 Widget', 'G3W-1', 'G3W-BAR-1',
    'pc', 100, 60, 'GENERAL', true);
  PERFORM set_config('g3.product', v_prod::text, false);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 1. Purchase happy path: totals, lots linked with purchase_id
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g3t';
DO $$
DECLARE
  v_resp jsonb; v_pur uuid; v_total numeric; v_lots integer; v_nolink integer;
BEGIN
  v_resp := public.create_purchase(
    (SELECT current_setting('g3.supplier'))::uuid, CURRENT_DATE,
    jsonb_build_array(
      jsonb_build_object('product_id', current_setting('g3.product'),
        'qty', 10, 'unit_cost', 40, 'expiry_date', '2027-06-01',
        'received_at', '2026-02-01T10:00:00Z', 'source_ref', 'gate-pur-old'),
      jsonb_build_object('product_id', current_setting('g3.product'),
        'qty', 10, 'unit_cost', 50, 'expiry_date', '2027-01-01',
        'received_at', '2026-02-05T10:00:00Z', 'source_ref', 'gate-pur-new')),
    'gate-pur-key-1');
  v_pur := (v_resp->>'id')::uuid;
  PERFORM set_config('g3.purchase', v_pur::text, false);
  SELECT total INTO v_total FROM public.purchases WHERE id = v_pur;
  IF v_total <> 900 THEN RAISE EXCEPTION 'purchase total %, want 900', v_total; END IF;
  SELECT count(*) INTO v_lots FROM public.stock_lots
  WHERE purchase_id = v_pur;
  IF v_lots <> 2 THEN RAISE EXCEPTION 'purchase lots %, want 2', v_lots; END IF;
  SELECT count(*) INTO v_nolink FROM public.stock_lots
  WHERE purchase_id = v_pur AND source_ref IS NULL;
  IF v_nolink <> 0 THEN RAISE EXCEPTION 'lots missing purchase link'; END IF;
  PERFORM set_config('g3.lot_old',
    (SELECT id::text FROM public.stock_lots
     WHERE purchase_id = v_pur ORDER BY received_at ASC, id ASC LIMIT 1), false);
  PERFORM set_config('g3.lot_new',
    (SELECT id::text FROM public.stock_lots
     WHERE purchase_id = v_pur ORDER BY received_at DESC, id DESC LIMIT 1), false);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- purchase validation: unknown supplier, empty lines, bad qty, no expiry, staff denied
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g3t';
DO $$
BEGIN
  BEGIN
    PERFORM public.create_purchase('99999999-9999-9999-9999-999999999999', CURRENT_DATE,
      jsonb_build_array(jsonb_build_object('product_id', current_setting('g3.product'),
        'qty', 1, 'unit_cost', 1, 'expiry_date', '2027-01-01')), 'k1');
    RAISE EXCEPTION 'bad supplier was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'bad supplier was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_purchase((SELECT current_setting('g3.supplier'))::uuid, CURRENT_DATE,
      '[]'::jsonb, 'k2');
    RAISE EXCEPTION 'empty lines were NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'empty lines were NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_purchase((SELECT current_setting('g3.supplier'))::uuid, CURRENT_DATE,
      jsonb_build_array(jsonb_build_object('product_id', current_setting('g3.product'),
        'qty', 1, 'unit_cost', 1)), 'k3');
    RAISE EXCEPTION 'missing expiry was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'missing expiry was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g3t';
DO $$
BEGIN
  BEGIN
    PERFORM public.create_purchase((SELECT current_setting('g3.supplier'))::uuid, CURRENT_DATE,
      jsonb_build_array(jsonb_build_object('product_id', current_setting('g3.product'),
        'qty', 1, 'unit_cost', 1, 'expiry_date', '2027-01-01')), 'k4');
    RAISE EXCEPTION 'staff purchase was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff purchase was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 2. Sale happy path: FIFO split across lots, math, numbering, provisional
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SET request.jwt.claim.tenant_id = :'g3t';
DO $$
DECLARE
  v_resp jsonb; v_inv uuid; v_num text; v_total numeric;
  v_splits integer; v_first_cost numeric; v_rem_old numeric; v_rem_new numeric;
BEGIN
  -- cashier may sell (no discount); 15 units span both lots (10 @ 40, 10 @ 50)
  v_resp := public.create_sale(
    (SELECT current_setting('g3.customer'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('g3.product'),
      'qty', 15, 'rate', 100)),
    0, NULL, 'gate-sale-1', 'gate-sale-key-1');
  v_inv := (v_resp->>'id')::uuid;
  PERFORM set_config('g3.invoice', v_inv::text, false);
  v_num := v_resp->>'invoice_number';
  IF v_num IS NULL OR v_num NOT LIKE 'INV-%' THEN
    RAISE EXCEPTION 'bad invoice number %', v_num;
  END IF;
  SELECT total INTO v_total FROM public.invoices WHERE id = v_inv;
  IF v_total <> 1500 THEN RAISE EXCEPTION 'sale total %, want 1500', v_total; END IF;
  SELECT count(*) INTO v_splits FROM public.invoice_line_lots ill
  JOIN public.invoice_lines il ON il.id = ill.invoice_line_id
  WHERE il.invoice_id = v_inv;
  IF v_splits <> 2 THEN RAISE EXCEPTION 'fifo splits %, want 2', v_splits; END IF;
  SELECT ill.unit_cost INTO v_first_cost FROM public.invoice_line_lots ill
  JOIN public.invoice_lines il ON il.id = ill.invoice_line_id
  JOIN public.stock_lots l ON l.id = ill.lot_id
  WHERE il.invoice_id = v_inv ORDER BY l.received_at ASC LIMIT 1;
  IF v_first_cost <> 40 THEN RAISE EXCEPTION 'FIFO oldest-first broken, cost %', v_first_cost; END IF;
  SELECT qty_remaining INTO v_rem_old FROM public.stock_lots
  WHERE id = (SELECT current_setting('g3.lot_old'))::uuid;
  SELECT qty_remaining INTO v_rem_new FROM public.stock_lots
  WHERE id = (SELECT current_setting('g3.lot_new'))::uuid;
  IF v_rem_old <> 0 THEN RAISE EXCEPTION 'old lot remaining %, want 0', v_rem_old; END IF;
  IF v_rem_new <> 5 THEN RAISE EXCEPTION 'new lot remaining %, want 5', v_rem_new; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- sale validation: over-sell, unknown product, zero qty, bad customer
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g3t';
DO $$
BEGIN
  BEGIN
    PERFORM public.create_sale((SELECT current_setting('g3.customer'))::uuid, CURRENT_DATE,
      jsonb_build_array(jsonb_build_object('product_id', current_setting('g3.product'),
        'qty', 9999, 'rate', 100)), 0, NULL, 'gate-x1', 'gate-xk1');
    RAISE EXCEPTION 'over-sell was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'over-sell was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_sale((SELECT current_setting('g3.customer'))::uuid, CURRENT_DATE,
      jsonb_build_array(jsonb_build_object('product_id', '99999999-9999-9999-9999-999999999999',
        'qty', 1, 'rate', 100)), 0, NULL, 'gate-x2', 'gate-xk2');
    RAISE EXCEPTION 'unknown product was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'unknown product was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_sale('99999999-9999-9999-9999-999999999999', CURRENT_DATE,
      jsonb_build_array(jsonb_build_object('product_id', current_setting('g3.product'),
        'qty', 1, 'rate', 100)), 0, NULL, 'gate-x3', 'gate-xk3');
    RAISE EXCEPTION 'bad customer was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'bad customer was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- discount requires admin approver (staff self-approval denied; admin ok)
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g3t';
DO $$
BEGIN
  BEGIN
    PERFORM public.create_sale((SELECT current_setting('g3.customer'))::uuid, CURRENT_DATE,
      jsonb_build_array(jsonb_build_object('product_id', current_setting('g3.product'),
        'qty', 1, 'rate', 100)), 10,
      (SELECT id FROM public.profiles WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
      'gate-x4', 'gate-xk4');
    RAISE EXCEPTION 'staff discount was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff discount was NOT blocked' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_sale((SELECT current_setting('g3.customer'))::uuid, CURRENT_DATE,
      jsonb_build_array(jsonb_build_object('product_id', current_setting('g3.product'),
        'qty', 1, 'rate', 100)), 10, NULL, 'gate-x5', 'gate-xk5');
    RAISE EXCEPTION 'approver-less discount was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'approver-less discount was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g3t';
DO $$
DECLARE v_resp jsonb; v_total numeric;
BEGIN
  v_resp := public.create_sale((SELECT current_setting('g3.customer'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('g3.product'),
      'qty', 1, 'rate', 100)), 10,
    (SELECT id FROM public.profiles WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    'gate-disc-1', 'gate-disc-key-1');
  SELECT total INTO v_total FROM public.invoices WHERE id = (v_resp->>'id')::uuid;
  IF v_total <> 90 THEN RAISE EXCEPTION 'discounted total %, want 90', v_total; END IF;
  PERFORM public.cancel_invoice((v_resp->>'id')::uuid, 'gate-disc-cancel-1');
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- reservations honored: hold 4 of remaining 5, sale of 2 must fail, 1 passes
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g3t';
DO $$
DECLARE v_hold uuid;
BEGIN
  v_hold := public.reserve_stock(
    (SELECT current_setting('g3.lot_new'))::uuid, 4, NULL, NULL, 24);
  PERFORM set_config('g3.hold', v_hold::text, false);
  BEGIN
    PERFORM public.create_sale((SELECT current_setting('g3.customer'))::uuid, CURRENT_DATE,
      jsonb_build_array(jsonb_build_object('product_id', current_setting('g3.product'),
        'qty', 2, 'rate', 100)), 0, NULL, 'gate-x6', 'gate-xk6');
    RAISE EXCEPTION 'held-stock oversell was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'held-stock oversell was NOT blocked' THEN RAISE; END IF;
  END;
  PERFORM public.release_reservation(v_hold, 'gate test');
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 3. Cancel restores stock; double-cancel + staff cancel denied
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g3t';
DO $$
DECLARE v_rem numeric; v_status text;
BEGIN
  PERFORM public.cancel_invoice(
    (SELECT current_setting('g3.invoice'))::uuid, 'gate-cancel-1');
  SELECT status INTO v_status FROM public.invoices
  WHERE id = (SELECT current_setting('g3.invoice'))::uuid;
  IF v_status <> 'cancelled' THEN RAISE EXCEPTION 'cancel failed'; END IF;
  SELECT qty_remaining INTO v_rem FROM public.stock_lots
  WHERE id = (SELECT current_setting('g3.lot_old'))::uuid;
  IF v_rem <> 10 THEN RAISE EXCEPTION 'old lot not restored: %', v_rem; END IF;
  SELECT qty_remaining INTO v_rem FROM public.stock_lots
  WHERE id = (SELECT current_setting('g3.lot_new'))::uuid;
  IF v_rem <> 10 THEN RAISE EXCEPTION 'new lot not restored: %', v_rem; END IF;
  BEGIN
    PERFORM public.cancel_invoice(
      (SELECT current_setting('g3.invoice'))::uuid, 'gate-cancel-2');
    RAISE EXCEPTION 'double cancel was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'double cancel was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g3t';
DO $$
BEGIN
  BEGIN
    PERFORM public.cancel_invoice(
      (SELECT current_setting('g3.invoice'))::uuid, 'gate-cancel-3');
    RAISE EXCEPTION 'staff cancel was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff cancel was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 4. Edit: cancel-and-reissue chain with links, coherent stock
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g3t';
DO $$
DECLARE
  v_sale jsonb; v_old uuid; v_new uuid;
  v_edited uuid; v_back uuid; v_rem numeric;
BEGIN
  v_sale := public.create_sale((SELECT current_setting('g3.customer'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('g3.product'),
      'qty', 4, 'rate', 100)), 0, NULL, 'gate-edit-src', 'gate-edit-src-key');
  v_old := (v_sale->>'id')::uuid;
  v_sale := public.edit_invoice(v_old,
    (SELECT current_setting('g3.customer'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('g3.product'),
      'qty', 6, 'rate', 100)), 0, NULL, 'gate-edit-key-1');
  v_new := (v_sale->>'id')::uuid;
  SELECT edited_from INTO v_edited FROM public.invoices WHERE id = v_new;
  SELECT recreated_by INTO v_back FROM public.invoices WHERE id = v_old;
  IF v_edited <> v_old THEN RAISE EXCEPTION 'edited_from broken'; END IF;
  IF v_back <> v_new THEN RAISE EXCEPTION 'recreated_by broken'; END IF;
  SELECT sum(qty_remaining) INTO v_rem FROM public.stock_lots
  WHERE purchase_id = (SELECT current_setting('g3.purchase'))::uuid;
  IF v_rem <> 14 THEN RAISE EXCEPTION 'edit stock incoherent: %', v_rem; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- tag the edit-created invoice (NULL provisional) so cleanup can track it
DO $$
BEGIN
  UPDATE public.invoices SET provisional_number = 'gate-edit-new'
  WHERE edited_from IS NOT NULL AND provisional_number IS NULL
    AND tenant_id = (SELECT current_setting('g3.tenant'))::uuid;
END
$$;

-- --------------------------------------------------------------------------
-- 5. Idempotent replay: same key twice, one invoice
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g3t';
DO $$
DECLARE a jsonb; b jsonb; n integer;
BEGIN
  a := public.create_sale((SELECT current_setting('g3.customer'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('g3.product'),
      'qty', 1, 'rate', 50)), 0, NULL, 'gate-replay', 'gate-replay-key-9');
  b := public.create_sale((SELECT current_setting('g3.customer'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('g3.product'),
      'qty', 999, 'rate', 999)), 0, NULL, 'gate-replay2', 'gate-replay-key-9');
  IF (a->>'id') <> (b->>'id') THEN RAISE EXCEPTION 'replay diverged'; END IF;
  SELECT count(*) INTO n FROM public.invoices
  WHERE provisional_number IN ('gate-replay', 'gate-replay2');
  IF n <> 1 THEN RAISE EXCEPTION 'replay duplicated: % rows', n; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 6. RLS: cross-tenant invisibility; direct DML denied
-- --------------------------------------------------------------------------
DO $$
DECLARE v_b uuid; v_bcust uuid;
BEGIN
  SELECT id INTO v_b FROM public.tenants WHERE name = 'Gate Probe Tenant';
  INSERT INTO auth.users (id) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (user_id, tenant_id, display_name, role)
  VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', v_b, 'Gate B Admin', 'admin')
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.invoices
    (tenant_id, canonical_number, invoice_date, subtotal, total, status)
  VALUES (v_b, 'INV-B-1', CURRENT_DATE, 10, 10, 'posted')
  ON CONFLICT DO NOTHING;
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g3t';
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM public.invoices LOOP
    IF r.tenant_id::text <> current_setting('request.jwt.claim.tenant_id') THEN
      RAISE EXCEPTION 'staff sees foreign invoice';
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM public.purchases LOOP
    IF r.tenant_id::text <> current_setting('request.jwt.claim.tenant_id') THEN
      RAISE EXCEPTION 'staff sees foreign purchase';
    END IF;
  END LOOP;
  BEGIN
    INSERT INTO public.invoices (tenant_id, canonical_number, invoice_date, subtotal, total)
    VALUES (current_setting('request.jwt.claim.tenant_id')::uuid, 'INV-X', CURRENT_DATE, 1, 1);
    RAISE EXCEPTION 'staff invoice insert was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.invoices SET total = total WHERE provisional_number LIKE 'gate-%';
    RAISE EXCEPTION 'staff invoice update was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.invoice_lines WHERE invoice_id = (SELECT current_setting('g3.invoice'))::uuid;
    RAISE EXCEPTION 'staff line delete was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 7. purchase/lot FK integrity: no orphan non-null references
-- --------------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.stock_lots l
  WHERE l.purchase_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = l.purchase_id);
  IF n <> 0 THEN RAISE EXCEPTION '% orphan lot purchase refs', n; END IF;
END
$$;

SELECT 'G3_GATE_ALL_GREEN' AS gate_result;
