-- ============================================================================
-- V1 BASELINE — G11: GST dormant seams (computation DISABLED).
-- Documented scope ONLY (plan G11 + approved D11 frozen list).
-- Adds: sac_codes master (approved list names HSN/SAC; unreferenced until
-- a service catalog exists — documented, not speculative behavior),
-- dormant document flags (supply_type, b2b_or_b2c, place_of_supply) on
-- invoices + purchases with value-set validation, threaded through
-- create_sale / create_purchase / edit_invoice as OPTIONAL params
-- (existing calls resolve identically; G3 gate unaffected).
-- Computation stays disabled: no calculation columns, no triggers, no
-- posting rule references tax amounts or the 2100/2200 heads. Totals are
-- computed exactly as before; flags never participate in math.
-- Single transaction, fail-closed.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. SAC master (dormant reference; no referencing entity in V1 by design)
-- --------------------------------------------------------------------------
CREATE TABLE public.sac_codes (
  code        text PRIMARY KEY,
  description text NOT NULL
);

-- --------------------------------------------------------------------------
-- 2. Dormant document flags (validated storage only)
-- --------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN supply_type text
    CHECK (supply_type IS NULL
           OR supply_type IN ('intra_state','inter_state')),
  ADD COLUMN b2b_or_b2c text
    CHECK (b2b_or_b2c IS NULL OR b2b_or_b2c IN ('B2B','B2C')),
  ADD COLUMN place_of_supply text;

ALTER TABLE public.purchases
  ADD COLUMN supply_type text
    CHECK (supply_type IS NULL
           OR supply_type IN ('intra_state','inter_state')),
  ADD COLUMN b2b_or_b2c text
    CHECK (b2b_or_b2c IS NULL OR b2b_or_b2c IN ('B2B','B2C')),
  ADD COLUMN place_of_supply text;

-- --------------------------------------------------------------------------
-- 3. Thread flags through document RPCs (optional, validated, stored only).
--    Full-function replacements; prior behavior otherwise identical, so
--    existing callers (positional or named, old arity) resolve unchanged.
-- --------------------------------------------------------------------------

-- create_sale + 3 optional flag params (appended with defaults).
-- Signature change (7 -> 10 args) REQUIRES dropping the old overload first:
-- otherwise old 7-arg calls become ambiguous between the two overloads.
-- Grants are re-issued below (DROP discards them).
DROP FUNCTION IF EXISTS
  public.create_sale(uuid,date,jsonb,numeric,uuid,text,text);
CREATE FUNCTION public.create_sale(
  p_customer_id uuid, p_invoice_date date, p_lines jsonb,
  p_discount numeric DEFAULT 0, p_approver_profile_id uuid DEFAULT NULL,
  p_provisional_number text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_supply_type text DEFAULT NULL,
  p_b2b_or_b2c text DEFAULT NULL,
  p_place_of_supply text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_replay boolean; v_resp jsonb;
  v_item   jsonb;
  v_prod   record;
  v_sub    numeric := 0;
  v_total  numeric;
  v_number text;
  v_inv_id uuid;
  v_line_id uuid;
  v_alloc record;
  v_line_amt numeric;
  v_limit  numeric;
  v_cogs   jsonb := '[]'::jsonb;
  v_cogs_total numeric := 0;
BEGIN
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.user_id = auth.uid() AND p.is_active
                   AND p.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'No active profile for caller';
  END IF;
  IF p_supply_type IS NOT NULL
     AND p_supply_type NOT IN ('intra_state','inter_state') THEN
    RAISE EXCEPTION 'Unknown supply_type';
  END IF;
  IF p_b2b_or_b2c IS NOT NULL AND p_b2b_or_b2c NOT IN ('B2B','B2C') THEN
    RAISE EXCEPTION 'Unknown b2b_or_b2c';
  END IF;
  SELECT * INTO v_replay, v_resp
  FROM public.idempotency_begin('create_sale', p_idempotency_key);
  IF v_replay THEN RETURN v_resp; END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.customers c
      WHERE c.id = p_customer_id AND c.tenant_id = v_tenant
        AND c.is_active) THEN
    RAISE EXCEPTION 'Unknown or inactive customer';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Sale requires at least one line';
  END IF;
  IF p_invoice_date IS NULL THEN
    RAISE EXCEPTION 'Invoice date required';
  END IF;
  p_discount := coalesce(p_discount, 0);
  IF p_discount < 0 THEN
    RAISE EXCEPTION 'Discount must be non-negative';
  END IF;
  IF p_discount > 0 THEN
    IF p_approver_profile_id IS NULL OR NOT EXISTS
       (SELECT 1 FROM public.profiles p
        WHERE p.id = p_approver_profile_id AND p.tenant_id = v_tenant
          AND p.is_active AND p.role = 'admin') THEN
      RAISE EXCEPTION 'Discounts require an active admin approver';
    END IF;
  END IF;

  v_number := 'INV-' || lpad(public.next_canonical_number('invoice')::text, 6, '0');
  INSERT INTO public.invoices
    (tenant_id, customer_id, provisional_number, canonical_number,
     invoice_date, subtotal, discount, total, status,
     supply_type, b2b_or_b2c, place_of_supply)
  VALUES (v_tenant, p_customer_id, nullif(btrim(p_provisional_number), ''),
          v_number, p_invoice_date, 0, 0, 0,
          'posted', p_supply_type, p_b2b_or_b2c,
          nullif(btrim(p_place_of_supply), ''))
  RETURNING id INTO v_inv_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_prod FROM public.products p
    WHERE p.id = nullif(v_item->>'product_id','')::uuid
      AND p.tenant_id = v_tenant AND p.is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unknown or inactive product in sale line';
    END IF;
    IF coalesce((v_item->>'qty')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Sale qty must be positive';
    END IF;
    IF coalesce((v_item->>'rate')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'Sale rate must be non-negative';
    END IF;
    v_line_amt := round((v_item->>'qty')::numeric
                        * (v_item->>'rate')::numeric, 2);
    INSERT INTO public.invoice_lines
      (tenant_id, invoice_id, product_id, qty, rate, amount, hsn_code)
    VALUES (v_tenant, v_inv_id, v_prod.id,
      (v_item->>'qty')::numeric, (v_item->>'rate')::numeric, v_line_amt,
      (SELECT hsn_code FROM public.products WHERE id = v_prod.id))
    RETURNING id INTO v_line_id;
    FOR v_alloc IN
      SELECT * FROM public.allocate_fifo(v_prod.id, (v_item->>'qty')::numeric)
    LOOP
      INSERT INTO public.invoice_line_lots
        (tenant_id, invoice_line_id, lot_id, qty, unit_cost)
      VALUES (v_tenant, v_line_id, v_alloc.lot_id, v_alloc.qty,
              v_alloc.unit_cost);
      UPDATE public.stock_lots
      SET qty_remaining = qty_remaining - v_alloc.qty,
          status = CASE WHEN qty_remaining - v_alloc.qty = 0
                        THEN 'exhausted' ELSE status END
      WHERE id = v_alloc.lot_id;
      v_cogs_total := v_cogs_total
        + round(v_alloc.qty * v_alloc.unit_cost, 2);
      v_cogs := v_cogs || jsonb_build_array(jsonb_build_object(
        'lot_id', v_alloc.lot_id, 'qty', v_alloc.qty,
        'unit_cost', v_alloc.unit_cost));
    END LOOP;
    v_sub := v_sub + v_line_amt;
  END LOOP;

  IF p_discount > v_sub THEN
    RAISE EXCEPTION 'Discount cannot exceed subtotal';
  END IF;
  v_total := v_sub - p_discount;

  IF p_customer_id IS NOT NULL THEN
    SELECT c.credit_limit INTO v_limit FROM public.customers c
    WHERE c.id = p_customer_id;
    IF public.dues_of(p_customer_id) + v_total > v_limit THEN
      RAISE EXCEPTION 'Credit limit exceeded (limit %, dues %, sale %)',
        v_limit, public.dues_of(p_customer_id), v_total;
    END IF;
  END IF;

  UPDATE public.invoices
  SET subtotal = v_sub, total = v_total, discount = p_discount,
      approver_profile_id = CASE WHEN p_discount > 0
                                 THEN p_approver_profile_id END,
      discount_approved_at = CASE WHEN p_discount > 0 THEN now() END
  WHERE id = v_inv_id;

  PERFORM public.post_journal(p_invoice_date, 'sale', v_inv_id,
    'Sale ' || v_number,
    (SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('account_code', '1300', 'debit', v_total,
               'description', 'Accounts receivable') AS x
      UNION ALL
      SELECT jsonb_build_object('account_code', '4000', 'credit', v_total,
               'description', 'Product sales (net of discount)')
      UNION ALL
      SELECT jsonb_build_object('account_code', '5000',
               'debit', round((a->>'qty')::numeric
                              * (a->>'unit_cost')::numeric, 2),
               'description', 'COGS FIFO')
      FROM jsonb_array_elements(v_cogs) a
      UNION ALL
      SELECT jsonb_build_object('account_code', '1200',
               'credit', round((a->>'qty')::numeric
                               * (a->>'unit_cost')::numeric, 2),
               'description', 'Inventory relief FIFO')
      FROM jsonb_array_elements(v_cogs) a
    ) s));

  v_resp := jsonb_build_object('id', v_inv_id, 'invoice_number', v_number,
                               'total', v_total);
  PERFORM public.idempotency_commit('create_sale', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;
REVOKE ALL ON FUNCTION
  public.create_sale(uuid,date,jsonb,numeric,uuid,text,text,text,text,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.create_sale(uuid,date,jsonb,numeric,uuid,text,text,text,text,text)
  TO authenticated;

-- Same signature-change discipline as create_sale: drop old 4-arg
-- overload first (ambiguity), re-issue grants after.
DROP FUNCTION IF EXISTS
  public.create_purchase(uuid,date,jsonb,text);
CREATE FUNCTION public.create_purchase(
  p_supplier_id uuid, p_purchase_date date, p_lines jsonb,
  p_idempotency_key text DEFAULT NULL,
  p_supply_type text DEFAULT NULL,
  p_b2b_or_b2c text DEFAULT NULL,
  p_place_of_supply text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_replay boolean; v_resp jsonb;
  v_item   jsonb;
  v_prod   record;
  v_lot_ids uuid[];
  v_sub    numeric := 0;
  v_pur_id uuid;
  v_line_id uuid;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  IF p_supply_type IS NOT NULL
     AND p_supply_type NOT IN ('intra_state','inter_state') THEN
    RAISE EXCEPTION 'Unknown supply_type';
  END IF;
  IF p_b2b_or_b2c IS NOT NULL AND p_b2b_or_b2c NOT IN ('B2B','B2C') THEN
    RAISE EXCEPTION 'Unknown b2b_or_b2c';
  END IF;
  SELECT * INTO v_replay, v_resp
  FROM public.idempotency_begin('create_purchase', p_idempotency_key);
  IF v_replay THEN RETURN v_resp; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.suppliers s
                 WHERE s.id = p_supplier_id AND s.tenant_id = v_tenant
                   AND s.is_active) THEN
    RAISE EXCEPTION 'Unknown or inactive supplier';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Purchase requires at least one line';
  END IF;
  IF p_purchase_date IS NULL THEN
    RAISE EXCEPTION 'Purchase date required';
  END IF;

  INSERT INTO public.purchases
    (tenant_id, supplier_id, purchase_date, subtotal, total,
     supply_type, b2b_or_b2c, place_of_supply)
  VALUES (v_tenant, p_supplier_id, p_purchase_date, 0, 0,
          p_supply_type, p_b2b_or_b2c, nullif(btrim(p_place_of_supply), ''))
  RETURNING id INTO v_pur_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_prod FROM public.products p
    WHERE p.id = nullif(v_item->>'product_id','')::uuid
      AND p.tenant_id = v_tenant AND p.is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unknown or inactive product in purchase line';
    END IF;
    IF coalesce((v_item->>'qty')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Purchase qty must be positive';
    END IF;
    IF coalesce((v_item->>'unit_cost')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'Purchase unit_cost must be non-negative';
    END IF;
    IF nullif(v_item->>'expiry_date','') IS NULL THEN
      RAISE EXCEPTION 'Purchase line requires expiry_date';
    END IF;
    v_lot_ids := public.intake_lots(p_supplier_id, jsonb_build_array(
      jsonb_build_object(
        'product_id', v_prod.id,
        'qty', (v_item->>'qty')::numeric,
        'unit_cost', (v_item->>'unit_cost')::numeric,
        'received_at', coalesce(nullif(v_item->>'received_at',''),
                                to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
        'expiry_date', v_item->>'expiry_date',
        'purchase_id', v_pur_id,
        'source_ref', 'purchase:' || v_pur_id::text)));
    INSERT INTO public.purchase_lines
      (tenant_id, purchase_id, product_id, qty, unit_cost, expiry_date,
       received_at, lot_id)
    VALUES (v_tenant, v_pur_id, v_prod.id,
      (v_item->>'qty')::numeric, (v_item->>'unit_cost')::numeric,
      (v_item->>'expiry_date')::date,
      coalesce(nullif(v_item->>'received_at','')::timestamptz, now()),
      v_lot_ids[1]);
    v_sub := v_sub + round((v_item->>'qty')::numeric
                           * (v_item->>'unit_cost')::numeric, 2);
  END LOOP;

  UPDATE public.purchases SET subtotal = v_sub, total = v_sub
  WHERE id = v_pur_id;

  PERFORM public.post_journal(p_purchase_date, 'purchase', v_pur_id,
    'Purchase ' || v_pur_id::text,
    jsonb_build_array(
      jsonb_build_object('account_code', '1200', 'debit', v_sub,
                         'description', 'Inventory received'),
      jsonb_build_object('account_code', '2000', 'credit', v_sub,
                         'description', 'Accounts payable')));

  v_resp := jsonb_build_object('id', v_pur_id, 'total', v_sub);
  PERFORM public.idempotency_commit('create_purchase', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;
REVOKE ALL ON FUNCTION
  public.create_purchase(uuid,date,jsonb,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.create_purchase(uuid,date,jsonb,text,text,text,text) TO authenticated;

-- Same signature-change discipline: drop old 7-arg overload first.
DROP FUNCTION IF EXISTS
  public.edit_invoice(uuid,uuid,date,jsonb,numeric,uuid,text);
CREATE FUNCTION public.edit_invoice(
  p_old_invoice_id uuid, p_customer_id uuid, p_invoice_date date,
  p_lines jsonb, p_discount numeric DEFAULT 0,
  p_approver_profile_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_supply_type text DEFAULT NULL,
  p_b2b_or_b2c text DEFAULT NULL,
  p_place_of_supply text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_replay boolean; v_resp jsonb;
  v_new    jsonb;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  SELECT * INTO v_replay, v_resp
  FROM public.idempotency_begin('edit_invoice', p_idempotency_key);
  IF v_replay THEN RETURN v_resp; END IF;

  PERFORM public.cancel_invoice(p_old_invoice_id, NULL);

  SELECT public.create_sale(p_customer_id, p_invoice_date, p_lines,
           p_discount, p_approver_profile_id, NULL, NULL,
           p_supply_type, p_b2b_or_b2c, p_place_of_supply)
  INTO v_new;

  UPDATE public.invoices
  SET edited_from = p_old_invoice_id
  WHERE id = (v_new->>'id')::uuid;
  UPDATE public.invoices
  SET recreated_by = (v_new->>'id')::uuid
  WHERE id = p_old_invoice_id;

  v_resp := v_new || jsonb_build_object('edited_from', p_old_invoice_id);
  PERFORM public.idempotency_commit('edit_invoice', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;
REVOKE ALL ON FUNCTION
  public.edit_invoice(uuid,uuid,date,jsonb,numeric,uuid,text,text,text,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.edit_invoice(uuid,uuid,date,jsonb,numeric,uuid,text,text,text,text)
  TO authenticated;

-- --------------------------------------------------------------------------
-- 4. RLS for the SAC master (mirrors hsn_codes: back-office read, RPC-only)
-- --------------------------------------------------------------------------
ALTER TABLE public.sac_codes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.sac_codes FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.sac_codes TO authenticated;
CREATE POLICY sac_backoffice_select ON public.sac_codes
  FOR SELECT TO authenticated
  USING (public.is_back_office());

COMMIT;
