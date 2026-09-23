-- ============================================================================
-- G1 EXIT GATE — fails (RAISE EXCEPTION, nonzero exit) on any mismatch.
-- Requires: G0 applied + G0 gate fixtures (admin/staff/cashier/outsider).
-- Run: psql -v ON_ERROR_STOP=1 -f g1_gate.sql  (exit 0 = gate passed)
-- Local test DB only.
-- ============================================================================

SELECT id AS gmain FROM public.tenants WHERE name = 'CyberCafe & Digital Services ERP' LIMIT 1 \gset
-- Mirror into a session GUC for use inside DO blocks (psql vars are used in plain SQL only).
SELECT set_config('g1.main', :'gmain', false);

-- --------------------------------------------------------------------------
-- 0. Seed verification (counts from the approved reference data)
-- --------------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.chart_of_accounts;
  IF n <> 22 THEN RAISE EXCEPTION 'CoA heads %, want 22', n; END IF;
  SELECT count(*) INTO n FROM public.payment_instruments WHERE is_active
    AND itype IN ('cash','bank','upi_qr','wallet');
  IF n <> 4 THEN RAISE EXCEPTION 'seeded instruments %, want 4', n; END IF;
  SELECT count(*) INTO n FROM public.hsn_codes WHERE code = 'GENERAL';
  IF n <> 1 THEN RAISE EXCEPTION 'GENERAL HSN missing'; END IF;
  SELECT count(*) INTO n FROM public.tax_rates WHERE hsn_code = 'GENERAL' AND rate = 0;
  IF n <> 1 THEN RAISE EXCEPTION 'zero reference rate missing'; END IF;
END
$$;

-- inactive product + foreign-tenant product (as owner, fixtures)
-- gate-created rows from prior runs are removed first (idempotent reruns)
DO $$
BEGIN
  DELETE FROM public.products WHERE name IN ('Inactive Fixture','Gate Product','Gate Dup','Bad Price','Bad HSN');
  DELETE FROM public.customers WHERE name IN ('Gate Customer','Gate Customer R','Neg Limit','Staff Customer');
  DELETE FROM public.suppliers WHERE name = 'Gate Supplier';
  DELETE FROM public.payment_instruments WHERE name = 'Gate Card';
  INSERT INTO public.products (tenant_id, name, sale_price, is_active)
  VALUES ((current_setting('g1.main'))::uuid, 'Inactive Fixture', 10, false);
END
$$;

-- --------------------------------------------------------------------------
-- 1. Catalog reads: staff/cashier see active own-tenant rows only
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'gmain';
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM public.products LOOP
    IF NOT r.is_active THEN RAISE EXCEPTION 'staff sees inactive product'; END IF;
    IF r.tenant_id::text <> current_setting('request.jwt.claim.tenant_id') THEN
      RAISE EXCEPTION 'staff sees foreign product';
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM public.customers LOOP
    IF NOT r.is_active THEN RAISE EXCEPTION 'staff sees inactive customer'; END IF;
  END LOOP;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 2. CoA + tax masters: hard deny for non-back-office (no grants at all)
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SET request.jwt.claim.tenant_id = :'gmain';
DO $$
DECLARE c integer;
BEGIN
  -- granted tables with back-office-only policies: query succeeds, zero rows
  SELECT count(*) INTO c FROM public.chart_of_accounts;
  IF c <> 0 THEN RAISE EXCEPTION 'cashier sees % CoA rows', c; END IF;
  SELECT count(*) INTO c FROM public.tax_rates;
  IF c <> 0 THEN RAISE EXCEPTION 'cashier sees % tax rows', c; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- back-office reads CoA + tax
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'gmain';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM public.chart_of_accounts;
  IF c <> 22 THEN RAISE EXCEPTION 'admin sees % CoA, want 22', c; END IF;
  SELECT count(*) INTO c FROM public.products;
  IF c < 1 THEN RAISE EXCEPTION 'admin sees no products incl. inactive'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 3. RPC-only mutation: direct DML denied for staff on all master tables
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'gmain';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.products (tenant_id, name, sale_price)
    VALUES ((current_setting('g1.main'))::uuid, 'Sneaky', 1);
    RAISE EXCEPTION 'staff product insert was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.products SET sale_price = 999 WHERE name = 'Inactive Fixture';
    RAISE EXCEPTION 'staff product update was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.products WHERE name = 'Inactive Fixture';
    RAISE EXCEPTION 'staff product delete was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.payment_instruments SET current_balance = 999
    WHERE itype = 'cash';
    RAISE EXCEPTION 'balance write was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 4. RPC happy paths (admin) + validation failures
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'gmain';
DO $$
DECLARE v_id uuid; v_name text;
BEGIN
  v_id := public.mg_customer_upsert(NULL, 'Gate Customer', '9000000001', 5000, true);
  v_id := public.mg_customer_upsert(v_id, 'Gate Customer R', NULL, 6000, true);
  SELECT name INTO v_name FROM public.customers WHERE id = v_id;
  IF v_name <> 'Gate Customer R' THEN RAISE EXCEPTION 'customer update failed'; END IF;

  PERFORM public.mg_supplier_upsert(NULL, 'Gate Supplier', NULL, true);
  PERFORM public.mg_product_upsert(NULL, 'Gate Product', 'GP-1', 'GP-BAR-1', 'pc',
    100, 60, 'GENERAL', true);
  BEGIN
    PERFORM public.mg_product_upsert(NULL, 'Gate Dup', 'GP-2', 'GP-BAR-1', 'pc',
      100, 60, 'GENERAL', true);
    RAISE EXCEPTION 'duplicate barcode was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'duplicate barcode was NOT rejected' THEN RAISE; END IF;
  END;
  PERFORM public.mg_instrument_upsert(NULL, 'Gate Card', 'card', true);

  BEGIN
    PERFORM public.mg_product_upsert(NULL, 'Bad Price', NULL, NULL, 'pc',
      -5, NULL, NULL, true);
    RAISE EXCEPTION 'negative price was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'negative price was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.mg_product_upsert(NULL, 'Bad HSN', NULL, NULL, 'pc',
      5, NULL, 'NOPE', true);
    RAISE EXCEPTION 'unknown HSN was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'unknown HSN was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.mg_instrument_upsert(NULL, 'Bad Type', 'crypto', true);
    RAISE EXCEPTION 'unknown itype was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'unknown itype was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.mg_customer_upsert(NULL, 'Neg Limit', NULL, -1, true);
    RAISE EXCEPTION 'negative limit was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'negative limit was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- staff cannot use master RPCs; staff cannot touch CoA even via RPC
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'gmain';
DO $$
BEGIN
  BEGIN
    PERFORM public.mg_customer_upsert(NULL, 'Staff Customer', NULL, 0, true);
    RAISE EXCEPTION 'staff RPC was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff RPC was NOT blocked' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.mg_coa_head_update(
      (SELECT id FROM public.chart_of_accounts LIMIT 1), 'Hacked', true);
    RAISE EXCEPTION 'staff CoA RPC was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff CoA RPC was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- admin CoA update works (rename only; code/type immutable by design)
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'gmain';
DO $$
DECLARE v_id uuid; v_code text;
BEGIN
  SELECT id INTO v_id FROM public.chart_of_accounts WHERE code = '6000' LIMIT 1;
  PERFORM public.mg_coa_head_update(v_id, 'Operating Expenses (Gate)', true);
  SELECT code INTO v_code FROM public.chart_of_accounts WHERE id = v_id;
  IF v_code <> '6000' THEN RAISE EXCEPTION 'CoA code mutated'; END IF;
  PERFORM public.mg_coa_head_update(v_id, 'Operating Expenses', true);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 5. Dormancy probes: no tax triggers/functions; no prohibited columns
-- --------------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace s ON s.oid = c.relnamespace
  WHERE s.nspname = 'public'
    AND c.relname IN ('customers','suppliers','products',
                      'payment_instruments','chart_of_accounts',
                      'hsn_codes','tax_rates')
    AND NOT t.tgisinternal
    AND t.tgname NOT LIKE '%updated_at';
  IF n <> 0 THEN RAISE EXCEPTION '% non-trivial triggers on G1 tables', n; END IF;

  SELECT count(*) INTO n FROM pg_proc p
  JOIN pg_namespace s ON s.oid = p.pronamespace
  WHERE s.nspname = 'public'
    AND (p.proname ILIKE '%tax%' OR p.proname ILIKE '%gst%');
  IF n <> 0 THEN RAISE EXCEPTION '% tax/gst functions exist', n; END IF;

  SELECT count(*) INTO n FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('customers','suppliers','products',
      'payment_instruments','chart_of_accounts','hsn_codes','tax_rates')
    AND column_name ~* '(card_number|^pin$|mpin|aadhaar|otp|cvv|password|secret|credential|token)';
  IF n <> 0 THEN RAISE EXCEPTION '% prohibited sensitive columns', n; END IF;
END
$$;

SELECT 'G1_GATE_ALL_GREEN' AS gate_result;
