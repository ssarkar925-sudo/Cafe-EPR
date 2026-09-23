-- ============================================================================
-- V1 BASELINE — G3: purchases, invoices, FIFO posting, idempotency
-- Depends on: G0 (tenant/roles/numbering), G1 (customers/suppliers/products),
--             G2 (lots/reservations/intake).
-- Completes G2-deferred dependency: purchase_id FK on stock_lots (fail-closed
-- on orphans). Idempotency_keys table is introduced HERE (not G9) because
-- this group's own verification gate demands idempotent replay; G9 reuses it
-- for outbox flows. No payments/claims (G4), no journals (G6), no GST math.
-- Single transaction, fail-closed.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Idempotency keys (shared infrastructure; scope-namespaced per RPC)
-- --------------------------------------------------------------------------
CREATE TABLE public.idempotency_keys (
  tenant_id  uuid        NOT NULL REFERENCES public.tenants (id)
                 ON DELETE RESTRICT,
  scope      text        NOT NULL,
  key        text        NOT NULL,
  response   jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, scope, key)
);

-- --------------------------------------------------------------------------
-- 2. Purchases (append-mostly; supplier returns arrive with later workflow)
-- --------------------------------------------------------------------------
CREATE TABLE public.purchases (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants (id)
                  ON DELETE RESTRICT,
  supplier_id   uuid        NOT NULL REFERENCES public.suppliers (id)
                  ON DELETE RESTRICT,
  purchase_date date        NOT NULL,
  subtotal      numeric(18,2) NOT NULL CHECK (subtotal >= 0),
  total         numeric(18,2) NOT NULL CHECK (total >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchases_tenant_date_idx
  ON public.purchases (tenant_id, purchase_date);
CREATE TRIGGER trg_purchases_updated_at
  BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.purchase_lines (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants (id)
                 ON DELETE RESTRICT,
  purchase_id  uuid        NOT NULL REFERENCES public.purchases (id)
                 ON DELETE RESTRICT,
  product_id   uuid        NOT NULL REFERENCES public.products (id)
                 ON DELETE RESTRICT,
  qty          numeric(18,2) NOT NULL CHECK (qty > 0),
  unit_cost    numeric(18,2) NOT NULL CHECK (unit_cost >= 0),
  expiry_date  date        NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  lot_id       uuid        REFERENCES public.stock_lots (id)
                 ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchase_lines_purchase_idx
  ON public.purchase_lines (purchase_id);

-- G2-deferred dependency: link lots to their purchase. Fail-closed: the
-- constraint itself rejects dangling references (verified in G3 gate).
ALTER TABLE public.stock_lots
  ADD CONSTRAINT stock_lots_purchase_fk
  FOREIGN KEY (purchase_id) REFERENCES public.purchases (id)
  ON DELETE RESTRICT;

-- --------------------------------------------------------------------------
-- 3. Invoices (online path posts immediately; offline states via G9 sync)
-- --------------------------------------------------------------------------
CREATE TABLE public.invoices (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants (id)
                        ON DELETE RESTRICT,
  customer_id         uuid        REFERENCES public.customers (id)
                        ON DELETE RESTRICT,
  provisional_number  text,
  canonical_number    text        NOT NULL,
  invoice_date        date        NOT NULL,
  subtotal            numeric(18,2) NOT NULL CHECK (subtotal >= 0),
  discount            numeric(18,2) NOT NULL DEFAULT 0
                      CHECK (discount >= 0),
  total               numeric(18,2) NOT NULL CHECK (total >= 0),
  approver_profile_id uuid        REFERENCES public.profiles (id)
                        ON DELETE RESTRICT,
  discount_approved_at timestamptz,
  status              text        NOT NULL DEFAULT 'posted'
                      CHECK (status IN ('draft','offline_created','queued',
                        'server_validated','posted','failed','reversed',
                        'cancelled')),
  edited_from         uuid        REFERENCES public.invoices (id)
                        ON DELETE RESTRICT,
  recreated_by        uuid        REFERENCES public.invoices (id)
                        ON DELETE RESTRICT,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_discount_lte_subtotal CHECK (discount <= subtotal),
  CONSTRAINT invoices_discount_needs_approver
    CHECK (discount = 0 OR approver_profile_id IS NOT NULL),
  UNIQUE (tenant_id, canonical_number)
);
CREATE INDEX invoices_tenant_customer_date_idx
  ON public.invoices (tenant_id, customer_id, invoice_date);
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.invoice_lines (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants (id)
                 ON DELETE RESTRICT,
  invoice_id   uuid        NOT NULL REFERENCES public.invoices (id)
                 ON DELETE RESTRICT,
  product_id   uuid        NOT NULL REFERENCES public.products (id)
                 ON DELETE RESTRICT,
  qty          numeric(18,2) NOT NULL CHECK (qty > 0),
  rate         numeric(18,2) NOT NULL CHECK (rate >= 0),
  amount       numeric(18,2) NOT NULL CHECK (amount >= 0),
  hsn_code     text        REFERENCES public.hsn_codes (code)
                 ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoice_lines_invoice_idx
  ON public.invoice_lines (invoice_id);

CREATE TABLE public.invoice_line_lots (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES public.tenants (id)
                   ON DELETE RESTRICT,
  invoice_line_id uuid       NOT NULL REFERENCES public.invoice_lines (id)
                   ON DELETE RESTRICT,
  lot_id         uuid        NOT NULL REFERENCES public.stock_lots (id)
                   ON DELETE RESTRICT,
  qty            numeric(18,2) NOT NULL CHECK (qty > 0),
  unit_cost      numeric(18,2) NOT NULL CHECK (unit_cost >= 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_line_id, lot_id)
);

-- --------------------------------------------------------------------------
-- 4. Idempotency helper (internal; callers pass scope+key, get replay flag)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.idempotency_begin(
  p_scope text, p_key text, OUT p_replay boolean, OUT p_response jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid;
BEGIN
  p_replay := false;
  p_response := NULL;
  IF nullif(btrim(p_key), '') IS NULL THEN
    RETURN;
  END IF;
  v_tenant := public.current_tenant();
  INSERT INTO public.idempotency_keys (tenant_id, scope, key, response)
  VALUES (v_tenant, p_scope, btrim(p_key), NULL)
  ON CONFLICT (tenant_id, scope, key) DO NOTHING
  RETURNING false INTO p_replay;
  IF NOT FOUND THEN
    SELECT true, k.response INTO p_replay, p_response
    FROM public.idempotency_keys k
    WHERE k.tenant_id = v_tenant AND k.scope = p_scope
      AND k.key = btrim(p_key);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.idempotency_begin(text,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.idempotency_commit(
  p_scope text, p_key text, p_response jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF nullif(btrim(p_key), '') IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.idempotency_keys
  SET response = p_response
  WHERE tenant_id = public.current_tenant()
    AND scope = p_scope AND key = btrim(p_key)
    AND response IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.idempotency_commit(text,text,jsonb) FROM PUBLIC;

-- --------------------------------------------------------------------------
-- 5. Internal FIFO allocator (no direct grants; called by definer RPCs).
--    Oldest received_at open unexpired lots first; honors active holds.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_fifo(
  p_product_id uuid, p_qty numeric)
RETURNS TABLE (lot_id uuid, qty numeric, unit_cost numeric)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_need   numeric;
  v_lot    record;
  v_held   numeric;
  v_take   numeric;
BEGIN
  v_tenant := public.current_tenant();
  v_need := p_qty;
  FOR v_lot IN
    SELECT l.id, l.qty_remaining, l.unit_cost
    FROM public.stock_lots l
    WHERE l.tenant_id = v_tenant
      AND l.product_id = p_product_id
      AND l.status = 'open'
      AND l.expiry_date > CURRENT_DATE
      AND l.qty_remaining > 0
    ORDER BY l.received_at ASC, l.id ASC
    FOR UPDATE
  LOOP
    SELECT coalesce(sum(r.qty), 0) INTO v_held
    FROM public.stock_reservations r
    WHERE r.lot_id = v_lot.id AND r.status = 'active';
    v_take := least(v_need, v_lot.qty_remaining - v_held);
    IF v_take > 0 THEN
      lot_id := v_lot.id; qty := v_take; unit_cost := v_lot.unit_cost;
      RETURN NEXT;
      v_need := v_need - v_take;
      EXIT WHEN v_need <= 0;
    END IF;
  END LOOP;
  IF v_need > 0 THEN
    RAISE EXCEPTION 'Insufficient unreserved stock (short %)', v_need;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.allocate_fifo(uuid,numeric) FROM PUBLIC;

-- --------------------------------------------------------------------------
-- 6. create_purchase (back-office): header + lines + lots, all-or-nothing
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_purchase(
  p_supplier_id uuid, p_purchase_date date, p_lines jsonb,
  p_idempotency_key text DEFAULT NULL)
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
    (tenant_id, supplier_id, purchase_date, subtotal, total)
  VALUES (v_tenant, p_supplier_id, p_purchase_date, 0, 0)
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

  v_resp := jsonb_build_object('id', v_pur_id, 'total', v_sub);
  PERFORM public.idempotency_commit('create_purchase', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;
REVOKE ALL ON FUNCTION public.create_purchase(uuid,date,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_purchase(uuid,date,jsonb,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 7. create_sale (any active role): validate, allocate FIFO, post document.
--    Any discount requires an active admin approver (locked rule).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_sale(
  p_customer_id uuid, p_invoice_date date, p_lines jsonb,
  p_discount numeric DEFAULT 0, p_approver_profile_id uuid DEFAULT NULL,
  p_provisional_number text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL)
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
  -- Header starts with zero money (CHECK-safe); final amounts are set once
  -- lines are validated and totals computed below. Approver was validated
  -- above; the link is attached with the final update.
  INSERT INTO public.invoices
    (tenant_id, customer_id, provisional_number, canonical_number,
     invoice_date, subtotal, discount, total, status)
  VALUES (v_tenant, p_customer_id, nullif(btrim(p_provisional_number), ''),
          v_number, p_invoice_date, 0, 0, 0,
          'posted')
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
    END LOOP;
    v_sub := v_sub + v_line_amt;
  END LOOP;

  IF p_discount > v_sub THEN
    RAISE EXCEPTION 'Discount cannot exceed subtotal';
  END IF;
  v_total := v_sub - p_discount;
  UPDATE public.invoices
  SET subtotal = v_sub, total = v_total, discount = p_discount,
      approver_profile_id = CASE WHEN p_discount > 0
                                 THEN p_approver_profile_id END,
      discount_approved_at = CASE WHEN p_discount > 0 THEN now() END
  WHERE id = v_inv_id;

  v_resp := jsonb_build_object('id', v_inv_id, 'invoice_number', v_number,
                               'total', v_total);
  PERFORM public.idempotency_commit('create_sale', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;
REVOKE ALL ON FUNCTION public.create_sale(uuid,date,jsonb,numeric,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale(uuid,date,jsonb,numeric,uuid,text,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 8. cancel_invoice + edit_invoice (back-office; cancel restores stock)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_invoice(
  p_invoice_id uuid, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_replay boolean; v_resp jsonb;
  v_row    record;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  v_tenant := public.current_tenant();
  SELECT * INTO v_replay, v_resp
  FROM public.idempotency_begin('cancel_invoice', p_idempotency_key);
  IF v_replay THEN RETURN v_resp; END IF;

  UPDATE public.invoices
  SET status = 'cancelled'
  WHERE id = p_invoice_id AND tenant_id = v_tenant AND status = 'posted'
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Posted invoice not found in tenant';
  END IF;

  FOR v_row IN
    SELECT ill.lot_id, ill.qty
    FROM public.invoice_line_lots ill
    JOIN public.invoice_lines il ON il.id = ill.invoice_line_id
    WHERE il.invoice_id = p_invoice_id
  LOOP
    UPDATE public.stock_lots
    SET qty_remaining = qty_remaining + v_row.qty,
        status = CASE WHEN status = 'exhausted'
                           AND expiry_date > CURRENT_DATE
                      THEN 'open' ELSE status END
    WHERE id = v_row.lot_id;
  END LOOP;

  v_resp := jsonb_build_object('id', p_invoice_id, 'status', 'cancelled');
  PERFORM public.idempotency_commit('cancel_invoice', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_invoice(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(uuid,text) TO authenticated;

-- Atomic cancel-and-reissue: old -> cancelled (+recreated_by), new carries
-- edited_from. Discount rules apply to the new document.
CREATE OR REPLACE FUNCTION public.edit_invoice(
  p_old_invoice_id uuid, p_customer_id uuid, p_invoice_date date,
  p_lines jsonb, p_discount numeric DEFAULT 0,
  p_approver_profile_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL)
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
           p_discount, p_approver_profile_id, NULL, NULL)
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
REVOKE ALL ON FUNCTION public.edit_invoice(uuid,uuid,date,jsonb,numeric,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_invoice(uuid,uuid,date,jsonb,numeric,uuid,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 9. RLS: deny-default; operational reads scoped; all writes via RPCs
-- --------------------------------------------------------------------------
ALTER TABLE public.idempotency_keys     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_lines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_lots    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.idempotency_keys, public.purchases,
  public.purchase_lines, public.invoices, public.invoice_lines,
  public.invoice_line_lots
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.purchases TO authenticated;
GRANT SELECT ON public.purchase_lines TO authenticated;
GRANT SELECT ON public.invoices TO authenticated;
GRANT SELECT ON public.invoice_lines TO authenticated;
GRANT SELECT ON public.invoice_line_lots TO authenticated;

CREATE POLICY purchases_scope_select ON public.purchases
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());
CREATE POLICY purchase_lines_scope_select ON public.purchase_lines
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());
CREATE POLICY invoices_scope_select ON public.invoices
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());
CREATE POLICY invoice_lines_scope_select ON public.invoice_lines
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());
CREATE POLICY invoice_line_lots_scope_select ON public.invoice_line_lots
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());
-- idempotency_keys: RPC-only (no grants, no policies = deny all direct).

COMMIT;
