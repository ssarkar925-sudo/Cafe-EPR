-- ============================================================================
-- V1 BASELINE — G1: masters / reference data + dormant GST structures
-- Depends on: V1_001 G0 (tenants, profiles, is_back_office/is_admin, RLS).
-- GST computation REMAINS DISABLED: tax masters + document flags only, no
-- calculation columns, triggers, or posting rules referencing tax amounts.
-- Single transaction: any error rolls everything back (fail-closed).
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Dormant GST reference tables FIRST (products FK-references hsn_codes;
--    all references resolve within this same transaction, fail-closed).
-- --------------------------------------------------------------------------
CREATE TABLE public.hsn_codes (
  code        text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE public.tax_rates (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  hsn_code       text    NOT NULL REFERENCES public.hsn_codes (code)
                   ON DELETE RESTRICT,
  rate           numeric(18,2) NOT NULL CHECK (rate >= 0),
  effective_from date    NOT NULL,
  effective_to   date,
  is_active      boolean NOT NULL DEFAULT true,
  CONSTRAINT tax_rates_period_sane
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX tax_rates_hsn_active_idx
  ON public.tax_rates (hsn_code) WHERE is_active;

-- --------------------------------------------------------------------------
-- 2. Masters
-- --------------------------------------------------------------------------

-- Customers. No balance column: dues are derived from posted journals (G6).
-- Phone is PII kept only as operationally required (nullable, documented).
CREATE TABLE public.customers (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants (id)
                 ON DELETE RESTRICT,
  name         text        NOT NULL CHECK (char_length(btrim(name)) > 0),
  phone        text,
  credit_limit numeric(18,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_tenant_active_idx
  ON public.customers (tenant_id) WHERE is_active;
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Suppliers mirror customer khata rules (payables derived, never stored).
CREATE TABLE public.suppliers (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants (id)
                 ON DELETE RESTRICT,
  name         text        NOT NULL CHECK (char_length(btrim(name)) > 0),
  phone        text,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX suppliers_tenant_active_idx
  ON public.suppliers (tenant_id) WHERE is_active;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Products. cost_price is a reference default only; FIFO lots carry real
-- costs (G2). hsn_code is a dormant reference (validated, never computed).
CREATE TABLE public.products (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants (id)
                 ON DELETE RESTRICT,
  name         text        NOT NULL CHECK (char_length(btrim(name)) > 0),
  sku          text,
  barcode      text,
  unit         text        NOT NULL DEFAULT 'pc',
  sale_price   numeric(18,2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  cost_price   numeric(18,2),
  hsn_code     text        REFERENCES public.hsn_codes (code)
                 ON DELETE RESTRICT,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_cost_nonneg CHECK (cost_price IS NULL OR cost_price >= 0)
);
-- NOTE: hsn_codes is created in section 2 below; the FK above resolves
-- within this same transaction (fail-closed if the reference is absent).
CREATE UNIQUE INDEX products_tenant_barcode_uidx
  ON public.products (tenant_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX products_tenant_active_idx
  ON public.products (tenant_id) WHERE is_active;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Payment instruments. Balances are server-maintained (future posting RPCs);
-- no client role may write them (no UPDATE grants below, ever).
CREATE TABLE public.payment_instruments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants (id)
                    ON DELETE RESTRICT,
  name            text        NOT NULL CHECK (char_length(btrim(name)) > 0),
  itype           text        NOT NULL
                  CHECK (itype IN ('cash','bank','upi_qr','wallet','card',
                                   'aeps_portal','dmt_portal')),
  is_active       boolean     NOT NULL DEFAULT true,
  current_balance numeric(18,2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX instruments_tenant_active_idx
  ON public.payment_instruments (tenant_id) WHERE is_active;
CREATE TRIGGER trg_instruments_updated_at
  BEFORE UPDATE ON public.payment_instruments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 2. Chart of accounts (admin-owned; seeded reference data)
-- --------------------------------------------------------------------------
CREATE TABLE public.chart_of_accounts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants (id)
                 ON DELETE RESTRICT,
  code         text        NOT NULL,
  name         text        NOT NULL,
  account_type text        NOT NULL
               CHECK (account_type IN ('asset','liability','equity',
                                       'income','expense',
                                       'contra_asset','contra_income')),
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

-- --------------------------------------------------------------------------
-- 3. Dormant GST notes (tables created in section 1 above; computation stays
--    disabled: no calculation columns, triggers, or posting rules reference
--    tax amounts anywhere in V1).
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- 4. Master CRUD RPCs (back-office only; tenant-scoped; validated)
--    Audit-log writes activate with the audit_logs entity (later group);
--    until then mutations are covered by application-level review + gates.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mg_customer_upsert(
  p_id uuid, p_name text, p_phone text,
  p_credit_limit numeric, p_is_active boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  IF nullif(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Customer name required';
  END IF;
  IF p_credit_limit IS NULL OR p_credit_limit < 0 THEN
    RAISE EXCEPTION 'Invalid credit limit';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.customers (tenant_id, name, phone, credit_limit, is_active)
    VALUES (public.current_tenant(), btrim(p_name),
            nullif(btrim(p_phone), ''), p_credit_limit,
            coalesce(p_is_active, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.customers
    SET name = btrim(p_name),
        phone = nullif(btrim(p_phone), ''),
        credit_limit = p_credit_limit,
        is_active = coalesce(p_is_active, is_active)
    WHERE id = p_id AND tenant_id = public.current_tenant()
    RETURNING id INTO v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found in tenant'; END IF;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.mg_customer_upsert(uuid,text,text,numeric,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mg_customer_upsert(uuid,text,text,numeric,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.mg_supplier_upsert(
  p_id uuid, p_name text, p_phone text, p_is_active boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  IF nullif(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Supplier name required';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.suppliers (tenant_id, name, phone, is_active)
    VALUES (public.current_tenant(), btrim(p_name),
            nullif(btrim(p_phone), ''), coalesce(p_is_active, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.suppliers
    SET name = btrim(p_name),
        phone = nullif(btrim(p_phone), ''),
        is_active = coalesce(p_is_active, is_active)
    WHERE id = p_id AND tenant_id = public.current_tenant()
    RETURNING id INTO v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found in tenant'; END IF;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.mg_supplier_upsert(uuid,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mg_supplier_upsert(uuid,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.mg_product_upsert(
  p_id uuid, p_name text, p_sku text, p_barcode text, p_unit text,
  p_sale_price numeric, p_cost_price numeric, p_hsn_code text,
  p_is_active boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  IF nullif(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Product name required';
  END IF;
  IF p_sale_price IS NULL OR p_sale_price < 0 THEN
    RAISE EXCEPTION 'Invalid sale price';
  END IF;
  IF p_cost_price IS NOT NULL AND p_cost_price < 0 THEN
    RAISE EXCEPTION 'Invalid cost price';
  END IF;
  IF p_hsn_code IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.hsn_codes WHERE code = p_hsn_code) THEN
    RAISE EXCEPTION 'Unknown HSN code';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.products
      (tenant_id, name, sku, barcode, unit, sale_price, cost_price,
       hsn_code, is_active)
    VALUES (public.current_tenant(), btrim(p_name),
            nullif(btrim(p_sku), ''), nullif(btrim(p_barcode), ''),
            coalesce(nullif(btrim(p_unit), ''), 'pc'),
            p_sale_price, p_cost_price,
            nullif(btrim(p_hsn_code), ''), coalesce(p_is_active, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.products
    SET name = btrim(p_name),
        sku = nullif(btrim(p_sku), ''),
        barcode = nullif(btrim(p_barcode), ''),
        unit = coalesce(nullif(btrim(p_unit), ''), unit),
        sale_price = p_sale_price,
        cost_price = p_cost_price,
        hsn_code = nullif(btrim(p_hsn_code), ''),
        is_active = coalesce(p_is_active, is_active)
    WHERE id = p_id AND tenant_id = public.current_tenant()
    RETURNING id INTO v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found in tenant'; END IF;
  END IF;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Duplicate barcode in tenant';
END;
$$;
REVOKE ALL ON FUNCTION public.mg_product_upsert(uuid,text,text,text,text,numeric,numeric,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mg_product_upsert(uuid,text,text,text,text,numeric,numeric,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.mg_instrument_upsert(
  p_id uuid, p_name text, p_itype text, p_is_active boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  IF nullif(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Instrument name required';
  END IF;
  IF p_itype NOT IN ('cash','bank','upi_qr','wallet','card',
                     'aeps_portal','dmt_portal') THEN
    RAISE EXCEPTION 'Unknown instrument type';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.payment_instruments (tenant_id, name, itype, is_active)
    VALUES (public.current_tenant(), btrim(p_name), p_itype,
            coalesce(p_is_active, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.payment_instruments
    SET name = btrim(p_name),
        itype = p_itype,
        is_active = coalesce(p_is_active, is_active)
    WHERE id = p_id AND tenant_id = public.current_tenant()
    RETURNING id INTO v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Instrument not found in tenant'; END IF;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.mg_instrument_upsert(uuid,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mg_instrument_upsert(uuid,text,text,boolean) TO authenticated;

-- CoA maintenance is Admin-only and never touches code/type (structural
-- stability); heads are renamed/activated only.
CREATE OR REPLACE FUNCTION public.mg_coa_head_update(
  p_id uuid, p_name text, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;
  IF nullif(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Account name required';
  END IF;
  UPDATE public.chart_of_accounts
  SET name = btrim(p_name),
      is_active = coalesce(p_is_active, is_active)
  WHERE id = p_id AND tenant_id = public.current_tenant();
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found in tenant'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.mg_coa_head_update(uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mg_coa_head_update(uuid,text,boolean) TO authenticated;

-- --------------------------------------------------------------------------
-- 5. RLS: deny-default; catalog reads scoped; masters/coA/tax RPC-only
-- --------------------------------------------------------------------------
ALTER TABLE public.customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_instruments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chart_of_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hsn_codes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rates            ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.customers, public.suppliers, public.products,
  public.payment_instruments, public.chart_of_accounts,
  public.hsn_codes, public.tax_rates
  FROM PUBLIC, anon, authenticated;

-- Catalog reads: any active user sees active rows of own tenant.
-- (REVOKE above names G1 tables only; G0 grants from V1_001 are untouched.)
GRANT SELECT ON public.customers TO authenticated;
GRANT SELECT ON public.suppliers TO authenticated;
GRANT SELECT ON public.products TO authenticated;
GRANT SELECT ON public.payment_instruments TO authenticated;

CREATE POLICY customers_scope_select ON public.customers
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant() AND is_active);
CREATE POLICY customers_backoffice_all_select ON public.customers
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());

CREATE POLICY suppliers_scope_select ON public.suppliers
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant() AND is_active);
CREATE POLICY suppliers_backoffice_all_select ON public.suppliers
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());

CREATE POLICY products_scope_select ON public.products
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant() AND is_active);
CREATE POLICY products_backoffice_all_select ON public.products
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());

CREATE POLICY instruments_scope_select ON public.payment_instruments
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant() AND is_active);
CREATE POLICY instruments_backoffice_all_select ON public.payment_instruments
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());

-- CoA + tax masters: back-office read only; no direct writes anywhere.
GRANT SELECT ON public.chart_of_accounts TO authenticated;
GRANT SELECT ON public.hsn_codes TO authenticated;
GRANT SELECT ON public.tax_rates TO authenticated;
CREATE POLICY coa_backoffice_select ON public.chart_of_accounts
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());
CREATE POLICY hsn_backoffice_select ON public.hsn_codes
  FOR SELECT TO authenticated
  USING (public.is_back_office());
CREATE POLICY taxrates_backoffice_select ON public.tax_rates
  FOR SELECT TO authenticated
  USING (public.is_back_office());

-- --------------------------------------------------------------------------
-- 6. Seed: chart of accounts + instruments + dormant HSN/rates (reference)
-- --------------------------------------------------------------------------
INSERT INTO public.chart_of_accounts (tenant_id, code, name, account_type)
SELECT t.id, v.code, v.name, v.account_type
FROM public.tenants t
CROSS JOIN (VALUES
  ('1000','Cash Drawer','asset'),
  ('1010','Bank Accounts','asset'),
  ('1020','UPI / QR Clearing','asset'),
  ('1030','Wallets','asset'),
  ('1040','AEPS Float Clearing','asset'),
  ('1050','DMT Float Clearing','asset'),
  ('1060','Card Clearing','asset'),
  ('1200','Inventory','asset'),
  ('1300','Accounts Receivable','asset'),
  ('1400','Business Clearing','asset'),
  ('2000','Accounts Payable','liability'),
  ('2100','GST Output (dormant)','liability'),
  ('2200','GST Input (dormant)','asset'),
  ('3000','Owner Equity','equity'),
  ('4000','Product Sales','income'),
  ('4010','Service Revenue','income'),
  ('4020','Service Fees','income'),
  ('4030','Commission Income','income'),
  ('5000','Cost of Goods Sold','expense'),
  ('5100','Sales Returns','contra_income'),
  ('5200','Inventory Adjustment','expense'),
  ('6000','Operating Expenses','expense')
) AS v(code, name, account_type)
WHERE t.status = 'active'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.payment_instruments (tenant_id, name, itype, is_active)
SELECT t.id, v.name, v.itype, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('Cash Drawer','cash'),
  ('Bank Account','bank'),
  ('Shop UPI QR','upi_qr'),
  ('Wallet','wallet')
) AS v(name, itype)
WHERE t.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM public.payment_instruments pi
                  WHERE pi.tenant_id = t.id AND pi.itype = v.itype);

INSERT INTO public.hsn_codes (code, description) VALUES
  ('GENERAL', 'General goods (fallback reference)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.tax_rates (hsn_code, rate, effective_from, effective_to)
SELECT 'GENERAL', 0, DATE '2026-01-01', NULL
WHERE EXISTS (SELECT 1 FROM public.hsn_codes WHERE code = 'GENERAL')
  AND NOT EXISTS (SELECT 1 FROM public.tax_rates WHERE hsn_code = 'GENERAL');

COMMIT;
