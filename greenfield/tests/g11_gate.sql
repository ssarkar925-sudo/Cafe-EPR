-- ============================================================================
-- G11 EXIT GATE — fails (RAISE EXCEPTION, nonzero exit) on any mismatch.
-- Requires: G0-G10 applied. Run with ON_ERROR_STOP=1. Local test DB only.
-- Proves: dormant flags stored + validated, old arities intact, totals
-- unaffected by flags, computation disabled (no triggers/functions/legs).
-- ============================================================================

SELECT id AS g11t FROM public.tenants
WHERE name = 'CyberCafe & Digital Services ERP' LIMIT 1 \gset
SELECT set_config('g11.tenant', :'g11t', false);

-- cleanup-first (mirrors teardown; journals are never deleted)
DO $$
BEGIN
  DELETE FROM public.invoice_line_lots WHERE invoice_line_id IN
    (SELECT il.id FROM public.invoice_lines il
     JOIN public.invoices i ON i.id = il.invoice_id
     WHERE i.provisional_number LIKE 'g11-%');
  DELETE FROM public.invoice_lines WHERE invoice_id IN
    (SELECT id FROM public.invoices WHERE provisional_number LIKE 'g11-%');
  UPDATE public.invoices SET edited_from = NULL, recreated_by = NULL
  WHERE provisional_number LIKE 'g11-%';
  DELETE FROM public.invoices WHERE provisional_number LIKE 'g11-%';
  DELETE FROM public.purchase_lines WHERE purchase_id IN
    (SELECT p.id FROM public.purchases p
     JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE s.name LIKE 'G11 %');
  DELETE FROM public.stock_reservations WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g11-%' OR s.name LIKE 'G11 %');
  DELETE FROM public.adjustments WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g11-%' OR s.name LIKE 'G11 %');
  DELETE FROM public.stock_lots
  WHERE source_ref LIKE 'g11-%'
     OR purchase_id IN (SELECT p.id FROM public.purchases p
                        JOIN public.suppliers s ON s.id = p.supplier_id
                        WHERE s.name LIKE 'G11 %');
  DELETE FROM public.purchases WHERE supplier_id IN
    (SELECT id FROM public.suppliers WHERE name LIKE 'G11 %');
  DELETE FROM public.idempotency_keys WHERE key LIKE 'g11-%';
  DELETE FROM public.products WHERE name LIKE 'G11 %';
  DELETE FROM public.suppliers WHERE name LIKE 'G11 %';
  DELETE FROM public.customers WHERE name LIKE 'G11 %';
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g11t';
DO $$
DECLARE v_sup uuid; v_cust uuid; v_prod uuid;
BEGIN
  v_sup := public.mg_supplier_upsert(NULL, 'G11 Supplier', NULL, true);
  PERFORM set_config('g11.supplier', v_sup::text, false);
  v_cust := public.mg_customer_upsert(NULL, 'G11 Customer', NULL, 100000, true);
  PERFORM set_config('g11.customer', v_cust::text, false);
  v_prod := public.mg_product_upsert(NULL, 'G11 Widget', 'G11W-1', 'G11W-BAR-1',
    'pc', 100, 60, 'GENERAL', true);
  PERFORM set_config('g11.product', v_prod::text, false);
  PERFORM public.create_purchase(v_sup, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', v_prod,
      'qty', 50, 'unit_cost', 10, 'expiry_date', '2028-01-01',
      'source_ref', 'g11-stock')),
    'g11-stock-key');
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 1. Flags stored verbatim on sale + purchase; bad values rejected
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g11t';
DO $$
DECLARE
  v_sale jsonb; v_st text; v_b2b text; v_pos text;
BEGIN
  v_sale := public.create_sale(
    (SELECT current_setting('g11.customer'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('g11.product'),
      'qty', 2, 'rate', 100)), 0, NULL, 'g11-flag-1', 'g11-flag-key-1',
    'intra_state', 'B2C', 'West Bengal');
  SELECT supply_type, b2b_or_b2c, place_of_supply INTO v_st, v_b2b, v_pos
  FROM public.invoices WHERE id = (v_sale->>'id')::uuid;
  IF v_st <> 'intra_state' OR v_b2b <> 'B2C' OR v_pos <> 'West Bengal' THEN
    RAISE EXCEPTION 'flags not stored: %/%/%', v_st, v_b2b, v_pos;
  END IF;
  PERFORM public.create_purchase(
    (SELECT current_setting('g11.supplier'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('g11.product'),
      'qty', 1, 'unit_cost', 10, 'expiry_date', '2028-01-01',
      'source_ref', 'g11-flag-pur')),
    'g11-flag-pur-key', 'inter_state', 'B2B', NULL);
  SELECT supply_type, b2b_or_b2c INTO v_st, v_b2b FROM public.purchases
  WHERE supplier_id = (SELECT current_setting('g11.supplier'))::uuid
  ORDER BY created_at DESC LIMIT 1;
  IF v_st <> 'inter_state' OR v_b2b <> 'B2B' THEN
    RAISE EXCEPTION 'purchase flags not stored';
  END IF;

  BEGIN
    PERFORM public.create_sale(
      (SELECT current_setting('g11.customer'))::uuid, CURRENT_DATE,
      jsonb_build_array(jsonb_build_object('product_id', current_setting('g11.product'),
        'qty', 1, 'rate', 10)), 0, NULL, 'g11-bad-1', 'g11-bad-key-1',
      'moon', 'B2C', NULL);
    RAISE EXCEPTION 'bad supply_type was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'bad supply_type was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_sale(
      (SELECT current_setting('g11.customer'))::uuid, CURRENT_DATE,
      jsonb_build_array(jsonb_build_object('product_id', current_setting('g11.product'),
        'qty', 1, 'rate', 10)), 0, NULL, 'g11-bad-2', 'g11-bad-key-2',
      'intra_state', 'B2B2C', NULL);
    RAISE EXCEPTION 'bad b2b was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'bad b2b was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 2. Old 7-arg arity still resolves; totals identical with/without flags
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g11t';
DO $$
DECLARE a jsonb; b jsonb;
BEGIN
  -- legacy 7-positional-arg call shape (defaults fill the new flags)
  a := public.create_sale(
    (SELECT current_setting('g11.customer'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('g11.product'),
      'qty', 2, 'rate', 100)), 0, NULL, 'g11-old-arity');
  b := public.create_sale(
    (SELECT current_setting('g11.customer'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('g11.product'),
      'qty', 2, 'rate', 100)), 0, NULL, 'g11-new-arity', 'g11-new-key-1',
    'intra_state', 'B2C', 'West Bengal');
  IF (a->>'total')::numeric <> (b->>'total')::numeric THEN
    RAISE EXCEPTION 'flags changed totals: % vs %', a->>'total', b->>'total';
  END IF;
  IF (a->>'total')::numeric <> 200 THEN
    RAISE EXCEPTION 'unexpected total %', a->>'total';
  END IF;
  -- journal revenue legs equal for both (no tax legs anywhere)
  PERFORM 1 FROM public.journal_entries e
  JOIN public.journal_lines l ON l.journal_entry_id = e.id
  JOIN public.chart_of_accounts ac ON ac.id = l.account_id
  WHERE e.source_id IN ((a->>'id')::uuid, (b->>'id')::uuid)
    AND ac.code IN ('2100','2200');
  IF FOUND THEN RAISE EXCEPTION 'tax legs posted'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 3. Dormancy probes: no tax triggers/functions/code refs; SAC readable
-- --------------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace s ON s.oid = c.relnamespace
  WHERE s.nspname = 'public'
    AND c.relname IN ('hsn_codes','tax_rates','sac_codes')
    AND NOT t.tgisinternal;
  IF n <> 0 THEN RAISE EXCEPTION '% triggers on tax masters', n; END IF;

  SELECT count(*) INTO n FROM pg_proc p
  JOIN pg_namespace s ON s.oid = p.pronamespace
  WHERE s.nspname = 'public'
    AND (p.proname ILIKE '%tax%' OR p.proname ILIKE '%gst%'
         OR p.proname ILIKE '%sac%' OR p.proname ILIKE '%hsn%');
  IF n <> 0 THEN RAISE EXCEPTION '% tax/gst functions exist', n; END IF;

  SELECT count(*) INTO n FROM pg_proc p
  JOIN pg_namespace s ON s.oid = p.pronamespace
  WHERE s.nspname = 'public'
    AND (p.prosrc LIKE '%2100%' OR p.prosrc LIKE '%2200%');
  IF n <> 0 THEN RAISE EXCEPTION '% functions reference tax accounts', n; END IF;

  SELECT count(*) INTO n FROM public.journal_lines l
  JOIN public.chart_of_accounts a ON a.id = l.account_id
  WHERE a.code IN ('2100','2200');
  IF n <> 0 THEN RAISE EXCEPTION '% tax journal lines exist', n; END IF;
END
$$;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g11t';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM public.sac_codes;
  PERFORM 1 FROM public.sac_codes LIMIT 1;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g11t';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM public.sac_codes;
  IF c <> 0 THEN RAISE EXCEPTION 'staff sees sac rows'; END IF;
  BEGIN
    INSERT INTO public.sac_codes (code, description) VALUES ('X','y');
    RAISE EXCEPTION 'staff sac insert was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 4. Edit path carries flags to the recreated invoice
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g11t';
DO $$
DECLARE v_src jsonb; v_new jsonb; v_st text;
BEGIN
  v_src := public.create_sale(
    (SELECT current_setting('g11.customer'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('g11.product'),
      'qty', 1, 'rate', 40)), 0, NULL, 'g11-edit-src', 'g11-edit-src-key');
  v_new := public.edit_invoice(
    (v_src->>'id')::uuid,
    (SELECT current_setting('g11.customer'))::uuid, CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('g11.product'),
      'qty', 1, 'rate', 40)), 0, NULL, 'g11-edit-key-1',
    'inter_state', 'B2B', NULL);
  SELECT supply_type INTO v_st FROM public.invoices
  WHERE id = (v_new->>'id')::uuid;
  IF v_st <> 'inter_state' THEN RAISE EXCEPTION 'edit dropped flags'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;
DO $$
BEGIN
  -- tag the edit-created row (NULL provisional) so cleanup tracks it
  UPDATE public.invoices SET provisional_number = 'g11-edit-new'
  WHERE edited_from IS NOT NULL AND provisional_number IS NULL
    AND tenant_id = (SELECT current_setting('g11.tenant'))::uuid;
END
$$;

-- --------------------------------------------------------------------------
-- 5. Teardown gate rows
-- --------------------------------------------------------------------------
DO $$
BEGIN
  DELETE FROM public.invoice_line_lots WHERE invoice_line_id IN
    (SELECT il.id FROM public.invoice_lines il
     JOIN public.invoices i ON i.id = il.invoice_id
     WHERE i.provisional_number LIKE 'g11-%');
  DELETE FROM public.invoice_lines WHERE invoice_id IN
    (SELECT id FROM public.invoices WHERE provisional_number LIKE 'g11-%');
  UPDATE public.invoices SET edited_from = NULL, recreated_by = NULL
  WHERE provisional_number LIKE 'g11-%';
  DELETE FROM public.invoices WHERE provisional_number LIKE 'g11-%';
  DELETE FROM public.purchase_lines WHERE purchase_id IN
    (SELECT p.id FROM public.purchases p
     JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE s.name LIKE 'G11 %');
  DELETE FROM public.stock_reservations WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g11-%' OR s.name LIKE 'G11 %');
  DELETE FROM public.adjustments WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g11-%' OR s.name LIKE 'G11 %');
  DELETE FROM public.stock_lots
  WHERE source_ref LIKE 'g11-%'
     OR purchase_id IN (SELECT p.id FROM public.purchases p
                        JOIN public.suppliers s ON s.id = p.supplier_id
                        WHERE s.name LIKE 'G11 %');
  DELETE FROM public.purchases WHERE supplier_id IN
    (SELECT id FROM public.suppliers WHERE name LIKE 'G11 %');
  DELETE FROM public.idempotency_keys WHERE key LIKE 'g11-%';
  DELETE FROM public.products WHERE name LIKE 'G11 %';
  DELETE FROM public.suppliers WHERE name LIKE 'G11 %';
  DELETE FROM public.customers WHERE name LIKE 'G11 %';
END
$$;

SELECT 'G11_GATE_ALL_GREEN' AS gate_result;
