-- ============================================================================
-- V1 BASELINE — G4: payment claims (F1 single-table), allocations, khata
-- Depends on: G0 (roles/tenant), G1 (customers/instruments), G3 (invoices).
-- F1: recognized claim rows ARE the payments; no separate payments table.
-- Khata completion (approved spec section 9, "over-limit sales rejected"):
--   G3's create_sale did not enforce customer limits, so this migration
--   replaces it with an identical body PLUS the limit gate (documented
--   below). No other G3 behavior changes; G3 gate stays green via its
--   customer-limit fixture. Financial posting of recognized claims is G6;
--   recognition here transitions state + timestamps only.
-- Cash-method set (approved): cash, upi, card, wallet, credit. No GST math.
-- Single transaction, fail-closed.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------------

-- Single-table model: a claim transitions recorded -> recognized in place.
-- invoice_id links payments toward dues; NULL invoice_id = advance/unlinked.
CREATE TABLE public.payment_claims (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants (id)
                        ON DELETE RESTRICT,
  customer_id         uuid        REFERENCES public.customers (id)
                        ON DELETE RESTRICT,
  invoice_id          uuid        REFERENCES public.invoices (id)
                        ON DELETE RESTRICT,
  method              text        NOT NULL
                      CHECK (method IN ('cash','upi','card','wallet','credit')),
  amount              numeric(18,2) NOT NULL CHECK (amount > 0),
  instrument_id       uuid        NOT NULL REFERENCES public.payment_instruments (id)
                        ON DELETE RESTRICT,
  claim_state         text        NOT NULL DEFAULT 'recorded'
                      CHECK (claim_state IN ('recorded','recognized')),
  recorded_by_profile uuid        NOT NULL REFERENCES public.profiles (id)
                        ON DELETE RESTRICT,
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  recognized_by_profile uuid      REFERENCES public.profiles (id)
                        ON DELETE RESTRICT,
  recognized_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claims_recognized_complete
    CHECK ((claim_state = 'recorded')
           OR (recognized_by_profile IS NOT NULL AND recognized_at IS NOT NULL))
);
CREATE INDEX claims_tenant_customer_idx
  ON public.payment_claims (tenant_id, customer_id);
CREATE INDEX claims_tenant_state_idx
  ON public.payment_claims (tenant_id, claim_state);
CREATE INDEX claims_invoice_idx
  ON public.payment_claims (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE TRIGGER trg_claims_updated_at
  BEFORE UPDATE ON public.payment_claims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Per-method splits of a claim. Sum must equal claim amount at recognition.
CREATE TABLE public.collection_allocations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants (id)
                  ON DELETE RESTRICT,
  claim_id      uuid        NOT NULL REFERENCES public.payment_claims (id)
                  ON DELETE RESTRICT,
  method        text        NOT NULL
                CHECK (method IN ('cash','upi','card','wallet','credit')),
  amount        numeric(18,2) NOT NULL CHECK (amount > 0),
  instrument_id uuid        NOT NULL REFERENCES public.payment_instruments (id)
                  ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (claim_id, method, instrument_id)
);
CREATE INDEX allocations_claim_idx
  ON public.collection_allocations (claim_id);

-- --------------------------------------------------------------------------
-- 2. Dues helper (internal): posted invoice totals minus recognized claims.
--    Pre-journal definition; G6 derives dues from journals and supersedes
--    this helper's role (kept for limit checks on hot paths).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dues_of(p_customer_id uuid)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_inv numeric; v_pay numeric;
BEGIN
  SELECT coalesce(sum(total), 0) INTO v_inv
  FROM public.invoices
  WHERE customer_id = p_customer_id AND status = 'posted'
    AND (public.current_tenant() IS NULL
         OR tenant_id = public.current_tenant());
  SELECT coalesce(sum(amount), 0) INTO v_pay
  FROM public.payment_claims
  WHERE customer_id = p_customer_id AND claim_state = 'recognized'
    AND (public.current_tenant() IS NULL
         OR tenant_id = public.current_tenant());
  RETURN round(v_inv - v_pay, 2);
END;
$$;
REVOKE ALL ON FUNCTION public.dues_of(uuid) FROM PUBLIC;

-- --------------------------------------------------------------------------
-- 3. create_sale replacement: identical to V1_004 PLUS the approved khata
--    limit gate (over-limit sales rejected; limit 0 blocks dues increase).
--    Operational note: cash customers need a back-office-set limit covering
--    typical sales, since dues transiently rise before payment recognition.
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
  v_limit  numeric;
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
  -- Header starts with zero money (CHECK-safe); final amounts set below.
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

  -- G4 khata completion: over-limit sales rejected (no partial credit).
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

  v_resp := jsonb_build_object('id', v_inv_id, 'invoice_number', v_number,
                               'total', v_total);
  PERFORM public.idempotency_commit('create_sale', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;
REVOKE ALL ON FUNCTION public.create_sale(uuid,date,jsonb,numeric,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale(uuid,date,jsonb,numeric,uuid,text,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 4. record_claim (any active role collects) + allocate splits
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_claim(
  p_customer_id uuid, p_invoice_id uuid, p_method text, p_amount numeric,
  p_instrument_id uuid, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_replay boolean; v_resp jsonb;
  v_claim  uuid;
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
  FROM public.idempotency_begin('record_claim', p_idempotency_key);
  IF v_replay THEN RETURN v_resp; END IF;

  IF p_method NOT IN ('cash','upi','card','wallet','credit') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Claim amount must be positive';
  END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.customers c
      WHERE c.id = p_customer_id AND c.tenant_id = v_tenant
        AND c.is_active) THEN
    RAISE EXCEPTION 'Unknown or inactive customer';
  END IF;
  IF p_invoice_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.invoices i
      WHERE i.id = p_invoice_id AND i.tenant_id = v_tenant
        AND i.status = 'posted') THEN
    RAISE EXCEPTION 'Claim references a non-posted invoice';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_instruments pi
                 WHERE pi.id = p_instrument_id AND pi.tenant_id = v_tenant
                   AND pi.is_active) THEN
    RAISE EXCEPTION 'Unknown or inactive instrument';
  END IF;

  INSERT INTO public.payment_claims
    (tenant_id, customer_id, invoice_id, method, amount, instrument_id,
     recorded_by_profile)
  SELECT v_tenant, p_customer_id, p_invoice_id, p_method, p_amount,
         p_instrument_id, p.id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  RETURNING id INTO v_claim;

  v_resp := jsonb_build_object('id', v_claim, 'state', 'recorded');
  PERFORM public.idempotency_commit('record_claim', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;
REVOKE ALL ON FUNCTION public.record_claim(uuid,uuid,text,numeric,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_claim(uuid,uuid,text,numeric,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.allocate_claim(
  p_claim_id uuid, p_method text, p_amount numeric, p_instrument_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_claim  record;
  v_alloc  uuid;
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
  SELECT * INTO v_claim FROM public.payment_claims c
  WHERE c.id = p_claim_id AND c.tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim not found in tenant'; END IF;
  IF v_claim.claim_state <> 'recorded' THEN
    RAISE EXCEPTION 'Allocations allowed only on recorded claims';
  END IF;
  IF p_method NOT IN ('cash','upi','card','wallet','credit') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be positive';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_instruments pi
                 WHERE pi.id = p_instrument_id AND pi.tenant_id = v_tenant
                   AND pi.is_active) THEN
    RAISE EXCEPTION 'Unknown or inactive instrument';
  END IF;
  INSERT INTO public.collection_allocations
    (tenant_id, claim_id, method, amount, instrument_id)
  VALUES (v_tenant, p_claim_id, p_method, p_amount, p_instrument_id)
  RETURNING id INTO v_alloc;
  RETURN v_alloc;
END;
$$;
REVOKE ALL ON FUNCTION public.allocate_claim(uuid,text,numeric,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_claim(uuid,text,numeric,uuid) TO authenticated;

-- --------------------------------------------------------------------------
-- 5. recognize_claim (back-office only): validates splits, transitions state.
--    Money legs post in G6; recognition records the event + timestamps.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recognize_claim(
  p_claim_id uuid, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_replay boolean; v_resp jsonb;
  v_claim  record;
  v_split  numeric;
  v_actor  uuid;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  v_tenant := public.current_tenant();
  SELECT * INTO v_replay, v_resp
  FROM public.idempotency_begin('recognize_claim', p_idempotency_key);
  IF v_replay THEN RETURN v_resp; END IF;

  SELECT * INTO v_claim FROM public.payment_claims c
  WHERE c.id = p_claim_id AND c.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim not found in tenant'; END IF;
  IF v_claim.claim_state <> 'recorded' THEN
    RAISE EXCEPTION 'Only recorded claims can be recognized (state=%)',
      v_claim.claim_state;
  END IF;
  SELECT coalesce(sum(a.amount), 0) INTO v_split
  FROM public.collection_allocations a WHERE a.claim_id = p_claim_id;
  IF v_split > 0 AND round(v_split, 2) <> round(v_claim.amount, 2) THEN
    RAISE EXCEPTION 'Allocation total % does not equal claim %',
      v_split, v_claim.amount;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_instruments pi
                 WHERE pi.id = v_claim.instrument_id
                   AND pi.tenant_id = v_tenant AND pi.is_active) THEN
    RAISE EXCEPTION 'Claim instrument no longer active';
  END IF;
  SELECT p.id INTO v_actor FROM public.profiles p
  WHERE p.user_id = auth.uid();
  UPDATE public.payment_claims
  SET claim_state = 'recognized',
      recognized_by_profile = v_actor,
      recognized_at = now()
  WHERE id = p_claim_id;

  v_resp := jsonb_build_object('id', p_claim_id, 'state', 'recognized');
  PERFORM public.idempotency_commit('recognize_claim', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;
REVOKE ALL ON FUNCTION public.recognize_claim(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recognize_claim(uuid,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 6. RLS: deny-default; operational reads scoped; all writes via RPCs
-- --------------------------------------------------------------------------
ALTER TABLE public.payment_claims        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_allocations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.payment_claims, public.collection_allocations
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.payment_claims TO authenticated;
GRANT SELECT ON public.collection_allocations TO authenticated;
CREATE POLICY claims_scope_select ON public.payment_claims
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());
CREATE POLICY allocations_scope_select ON public.collection_allocations
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

COMMIT;
