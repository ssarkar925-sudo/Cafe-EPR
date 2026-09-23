-- ============================================================================
-- V1 BASELINE — G2: inventory lots, FIFO, expiry, reservations, adjustments
-- Depends on: V1_001 G0 (tenants/profiles/devices, role helpers, RLS),
--             V1_002 G1 (products, suppliers).
-- Out of scope: purchase documents (G3; lots carry a nullable purchase_id
--               with NO FK yet — G3 adds the constraint + backfill check),
--             lot consumption at posting (G3), journal posting (G6).
-- GST: untouched/disabled. Single transaction, fail-closed.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------------

-- One lot per purchase line (H3). expiry_date mandatory: unknown expiry is
-- rejected at intake (approved D9.3 posture applied to live intake too).
CREATE TABLE public.stock_lots (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES public.tenants (id)
                   ON DELETE RESTRICT,
  product_id     uuid        NOT NULL REFERENCES public.products (id)
                   ON DELETE RESTRICT,
  purchase_id    uuid,
  supplier_id    uuid        REFERENCES public.suppliers (id)
                   ON DELETE RESTRICT,
  source_ref     text,
  qty_received   numeric(18,2) NOT NULL CHECK (qty_received > 0),
  qty_remaining  numeric(18,2) NOT NULL CHECK (qty_remaining >= 0),
  unit_cost      numeric(18,2) NOT NULL CHECK (unit_cost >= 0),
  received_at    timestamptz NOT NULL DEFAULT now(),
  expiry_date    date        NOT NULL,
  status         text        NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','exhausted','quarantined','expired')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lots_remaining_lte_received
    CHECK (qty_remaining <= qty_received)
);
CREATE INDEX lots_fifo_idx
  ON public.stock_lots (tenant_id, product_id, status, received_at, id);
CREATE INDEX lots_expiry_sweep_idx
  ON public.stock_lots (tenant_id, status, expiry_date)
  WHERE status = 'open';
CREATE TRIGGER trg_lots_updated_at
  BEFORE UPDATE ON public.stock_lots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Provisional holds. Availability = lot.qty_remaining − active reservations
-- (computed by readers; never stored). Consumed status is set by posting
-- flows (G3+); G2 creates/releases/expires holds.
CREATE TABLE public.stock_reservations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES public.tenants (id)
                   ON DELETE RESTRICT,
  lot_id         uuid        NOT NULL REFERENCES public.stock_lots (id)
                   ON DELETE RESTRICT,
  device_id      uuid        REFERENCES public.devices (id)
                   ON DELETE RESTRICT,
  document_ref   uuid,
  qty            numeric(18,2) NOT NULL CHECK (qty > 0),
  hold_expires_at timestamptz NOT NULL,
  status         text        NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','released','consumed','expired')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reservations_lot_status_idx
  ON public.stock_reservations (lot_id, status);
CREATE INDEX reservations_hold_sweep_idx
  ON public.stock_reservations (tenant_id, status, hold_expires_at)
  WHERE status = 'active';
CREATE TRIGGER trg_reservations_updated_at
  BEFORE UPDATE ON public.stock_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Reason-coded quantity/value moves. Every row is an event; nothing here
-- posts journals (G6 consumes these events). Manager+Admin only via RPC.
CREATE TABLE public.adjustments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants (id)
                 ON DELETE RESTRICT,
  product_id   uuid        NOT NULL REFERENCES public.products (id)
                 ON DELETE RESTRICT,
  lot_id       uuid        REFERENCES public.stock_lots (id)
                 ON DELETE RESTRICT,
  qty_delta    numeric(18,2) NOT NULL,
  -- NOTE: zero deltas are permitted ONLY for status-move events written by
  -- quarantine_lot/reopen_lot; adjust_stock() itself rejects zero deltas.
  adj_type     text        NOT NULL
               CHECK (adj_type IN ('damage','expiry','count','other')),
  reason       text        NOT NULL CHECK (char_length(btrim(reason)) > 0),
  actor_profile_id uuid    NOT NULL REFERENCES public.profiles (id)
                 ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX adjustments_product_created_idx
  ON public.adjustments (tenant_id, product_id, created_at);

-- --------------------------------------------------------------------------
-- 2. Intake: creates lots (back-office only). Expiry is mandatory.
--    p_lines: [{product_id, qty, unit_cost, received_at?, expiry_date,
--               supplier_id?, purchase_id?, source_ref?}]
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intake_lots(
  p_supplier_id uuid, p_lines jsonb)
RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_item   jsonb;
  v_lot_id uuid;
  v_ids    uuid[] := '{}';
  v_prod   record;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Intake requires at least one line';
  END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.suppliers s
      WHERE s.id = p_supplier_id AND s.tenant_id = v_tenant
        AND s.is_active) THEN
    RAISE EXCEPTION 'Unknown or inactive supplier';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_prod FROM public.products p
    WHERE p.id = nullif(v_item->>'product_id','')::uuid
      AND p.tenant_id = v_tenant AND p.is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unknown or inactive product in intake line';
    END IF;
    IF coalesce((v_item->>'qty')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Intake qty must be positive';
    END IF;
    IF coalesce((v_item->>'unit_cost')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'Intake unit_cost must be non-negative';
    END IF;
    IF nullif(v_item->>'expiry_date','') IS NULL THEN
      RAISE EXCEPTION 'Intake line requires expiry_date (unknown expiry rejected)';
    END IF;
    INSERT INTO public.stock_lots
      (tenant_id, product_id, purchase_id, supplier_id, source_ref,
       qty_received, qty_remaining, unit_cost, received_at, expiry_date)
    VALUES (
      v_tenant, v_prod.id,
      nullif(v_item->>'purchase_id','')::uuid,
      p_supplier_id,
      nullif(v_item->>'source_ref',''),
      (v_item->>'qty')::numeric, (v_item->>'qty')::numeric,
      (v_item->>'unit_cost')::numeric,
      coalesce(nullif(v_item->>'received_at','')::timestamptz, now()),
      (v_item->>'expiry_date')::date)
    RETURNING id INTO v_lot_id;
    v_ids := v_ids || v_lot_id;
  END LOOP;
  RETURN v_ids;
END;
$$;
REVOKE ALL ON FUNCTION public.intake_lots(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intake_lots(uuid,jsonb) TO authenticated;

-- --------------------------------------------------------------------------
-- 3. Reserve / release holds (back-office; posting flows in G3+ call these
--    server-side with their own authorization — staff never calls directly).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_stock(
  p_lot_id uuid, p_qty numeric, p_device_id uuid, p_document_ref uuid,
  p_hold_hours integer DEFAULT 24)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_lot    record;
  v_held   numeric;
  v_res_id uuid;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Reservation qty must be positive';
  END IF;
  SELECT * INTO v_lot FROM public.stock_lots l
  WHERE l.id = p_lot_id AND l.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot not found in tenant'; END IF;
  IF v_lot.status <> 'open' THEN
    RAISE EXCEPTION 'Lot is not open for reservation (status=%)', v_lot.status;
  END IF;
  IF v_lot.expiry_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Lot is expired';
  END IF;
  IF p_device_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.devices d
      WHERE d.id = p_device_id AND d.tenant_id = v_tenant
        AND d.status = 'active') THEN
    RAISE EXCEPTION 'Unknown or revoked device';
  END IF;
  SELECT coalesce(sum(r.qty),0) INTO v_held
  FROM public.stock_reservations r
  WHERE r.lot_id = p_lot_id AND r.status = 'active';
  IF v_lot.qty_remaining - v_held < p_qty THEN
    RAISE EXCEPTION 'Insufficient unreserved stock (have %, need %)',
      (v_lot.qty_remaining - v_held), p_qty;
  END IF;
  INSERT INTO public.stock_reservations
    (tenant_id, lot_id, device_id, document_ref, qty, hold_expires_at)
  VALUES (v_tenant, p_lot_id, p_device_id, p_document_ref, p_qty,
          now() + (coalesce(p_hold_hours, 24) || ' hours')::interval)
  RETURNING id INTO v_res_id;
  RETURN v_res_id;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_stock(uuid,numeric,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_stock(uuid,numeric,uuid,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_reservation(
  p_reservation_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  v_tenant := public.current_tenant();
  UPDATE public.stock_reservations
  SET status = 'released'
  WHERE id = p_reservation_id AND tenant_id = v_tenant
    AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active reservation not found in tenant';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.release_reservation(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_reservation(uuid,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 4. Adjustments + quarantine (Manager+Admin via is_back_office; every move
--    writes an adjustment event row; journal posting consumes events in G6).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_lot_id uuid, p_qty_delta numeric, p_adj_type text, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_lot    record;
  v_actor  uuid;
  v_adj_id uuid;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  IF p_qty_delta IS NULL OR p_qty_delta = 0 THEN
    RAISE EXCEPTION 'Adjustment delta must be non-zero';
  END IF;
  IF p_adj_type NOT IN ('damage','expiry','count','other') THEN
    RAISE EXCEPTION 'Unknown adjustment type';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Adjustment reason required';
  END IF;
  SELECT * INTO v_lot FROM public.stock_lots l
  WHERE l.id = p_lot_id AND l.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot not found in tenant'; END IF;
  IF v_lot.status = 'quarantined' THEN
    RAISE EXCEPTION 'Lot quarantined: use quarantine flow, not adjust_stock';
  END IF;
  IF v_lot.qty_remaining + p_qty_delta < 0 THEN
    RAISE EXCEPTION 'Adjustment would drive lot negative (have %, delta %)',
      v_lot.qty_remaining, p_qty_delta;
  END IF;
  SELECT p.id INTO v_actor FROM public.profiles p
  WHERE p.user_id = auth.uid();
  UPDATE public.stock_lots
  SET qty_remaining = qty_remaining + p_qty_delta,
      status = CASE WHEN qty_remaining + p_qty_delta = 0
                    THEN 'exhausted' ELSE status END
  WHERE id = p_lot_id;
  INSERT INTO public.adjustments
    (tenant_id, product_id, lot_id, qty_delta, adj_type, reason,
     actor_profile_id)
  VALUES (v_tenant, v_lot.product_id, p_lot_id, p_qty_delta,
          p_adj_type, btrim(p_reason), v_actor)
  RETURNING id INTO v_adj_id;
  RETURN v_adj_id;
END;
$$;
REVOKE ALL ON FUNCTION public.adjust_stock(uuid,numeric,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid,numeric,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.quarantine_lot(p_lot_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid; v_lot record; v_actor uuid; v_adj_id uuid;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  v_tenant := public.current_tenant();
  SELECT * INTO v_lot FROM public.stock_lots l
  WHERE l.id = p_lot_id AND l.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot not found in tenant'; END IF;
  IF v_lot.status <> 'open' THEN
    RAISE EXCEPTION 'Only open lots can be quarantined (status=%)', v_lot.status;
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Quarantine reason required';
  END IF;
  SELECT p.id INTO v_actor FROM public.profiles p
  WHERE p.user_id = auth.uid();
  UPDATE public.stock_lots SET status = 'quarantined' WHERE id = p_lot_id;
  INSERT INTO public.adjustments
    (tenant_id, product_id, lot_id, qty_delta, adj_type, reason,
     actor_profile_id)
  VALUES (v_tenant, v_lot.product_id, p_lot_id, 0,
          'damage', btrim(p_reason) || ' [quarantine]', v_actor)
  RETURNING id INTO v_adj_id;
  RETURN v_adj_id;
END;
$$;
REVOKE ALL ON FUNCTION public.quarantine_lot(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quarantine_lot(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_lot(p_lot_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid; v_lot record; v_actor uuid; v_adj_id uuid;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  v_tenant := public.current_tenant();
  SELECT * INTO v_lot FROM public.stock_lots l
  WHERE l.id = p_lot_id AND l.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot not found in tenant'; END IF;
  IF v_lot.status <> 'quarantined' THEN
    RAISE EXCEPTION 'Only quarantined lots can be reopened (status=%)', v_lot.status;
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Reopen reason required';
  END IF;
  SELECT p.id INTO v_actor FROM public.profiles p
  WHERE p.user_id = auth.uid();
  UPDATE public.stock_lots
  SET status = CASE WHEN qty_remaining > 0 THEN 'open' ELSE 'exhausted' END
  WHERE id = p_lot_id;
  INSERT INTO public.adjustments
    (tenant_id, product_id, lot_id, qty_delta, adj_type, reason,
     actor_profile_id)
  VALUES (v_tenant, v_lot.product_id, p_lot_id, 0,
          'count', btrim(p_reason) || ' [reopen]', v_actor)
  RETURNING id INTO v_adj_id;
  RETURN v_adj_id;
END;
$$;
REVOKE ALL ON FUNCTION public.reopen_lot(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_lot(uuid,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 5. Sweeper jobs (service_role / back-office; called by scheduler).
--    Expired open lots -> expired. Past-hold active reservations -> expired.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_overdue_lots()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_n integer;
BEGIN
  IF NOT (public.is_back_office() OR coalesce(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Not authorized for sweep jobs';
  END IF;
  WITH upd AS (
    UPDATE public.stock_lots
    SET status = 'expired'
    WHERE status = 'open' AND expiry_date <= CURRENT_DATE
    RETURNING 1
  ) SELECT count(*) INTO v_n FROM upd;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_overdue_lots() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_overdue_lots() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_n integer;
BEGIN
  IF NOT (public.is_back_office() OR coalesce(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Not authorized for sweep jobs';
  END IF;
  WITH upd AS (
    UPDATE public.stock_reservations
    SET status = 'expired'
    WHERE status = 'active' AND hold_expires_at <= now()
    RETURNING 1
  ) SELECT count(*) INTO v_n FROM upd;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.release_expired_reservations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO authenticated, service_role;

-- Stuck holds: active reservations older than 2x TTL (48h default) for
-- Manager review. Read-only; back-office only.
CREATE OR REPLACE FUNCTION public.stuck_holds()
RETURNS TABLE (reservation_id uuid, lot_id uuid, qty numeric,
               hold_expires_at timestamptz, age_hours numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  RETURN QUERY
  SELECT r.id, r.lot_id, r.qty, r.hold_expires_at,
         round(extract(epoch FROM (now() - r.created_at)) / 3600, 1)
  FROM public.stock_reservations r
  WHERE r.status = 'active'
    AND r.created_at < now() - interval '48 hours'
    AND (public.current_tenant() IS NULL
         OR r.tenant_id = public.current_tenant());
END;
$$;
REVOKE ALL ON FUNCTION public.stuck_holds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stuck_holds() TO authenticated;

-- --------------------------------------------------------------------------
-- 6. RLS: deny-default; operational reads scoped; all writes via RPCs.
-- --------------------------------------------------------------------------
ALTER TABLE public.stock_lots         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adjustments        ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stock_lots, public.stock_reservations,
  public.adjustments
  FROM PUBLIC, anon, authenticated;

-- Stock visibility: any active user reads in-tenant lots + own-scope holds.
GRANT SELECT ON public.stock_lots TO authenticated;
GRANT SELECT ON public.stock_reservations TO authenticated;
CREATE POLICY lots_scope_select ON public.stock_lots
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());
CREATE POLICY reservations_scope_select ON public.stock_reservations
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

-- Adjustments: back-office read only (financial-adjacent records).
GRANT SELECT ON public.adjustments TO authenticated;
CREATE POLICY adjustments_backoffice_select ON public.adjustments
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());

COMMIT;
