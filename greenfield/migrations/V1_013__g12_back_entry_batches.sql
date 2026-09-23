-- ============================================================================
-- V1 BASELINE — G12: historical back-entry batches (D9, Option A approved).
-- Approved basis: 12-month lookback [2025-01-01, 2026-01-01); single atomic
-- lock; unknown expiry rejected; monthly-aggregate lots for unknown lot
-- granularity (APPROVED aggregation key: product + calendar month +
-- unit_cost; received_at = first of month); suspense-as-proposed; admin-only;
-- cancel-and-recreate; balanced journals with origin='back_entry'.
-- Line types: purchase / sale / payment / adjustment / opening_balance.
-- Posting mirrors live economics at historical dates (net revenue, FIFO
-- COGS, uniform claim/payment legs, adjustment rules). NO new accounts,
-- NO new economics. Unknown-granularity lines aggregate; they are never
-- presented as exact original batches (aggregate lots carry source_ref
-- 'aggregate:YYYY-MM' and per-line source refs stay on back_entry_lines).
-- G4 completion inside: payment_claims gains nullable back_entry_batch_id
-- (uniform dues continuity; pre-existing claims unaffected).
-- Single transaction, fail-closed. Batches are atomic: any line failure
-- rolls back the whole batch (no partial history).
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------------
CREATE TABLE public.back_entry_batches (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants (id)
                 ON DELETE RESTRICT,
  batch_key    text        NOT NULL,
  reason       text        NOT NULL CHECK (char_length(btrim(reason)) > 0),
  actor_profile_id uuid    NOT NULL REFERENCES public.profiles (id)
                 ON DELETE RESTRICT,
  status       text        NOT NULL DEFAULT 'posted'
               CHECK (status IN ('posted','voided')),
  response     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, batch_key)
);
CREATE INDEX back_entry_batches_tenant_created_idx
  ON public.back_entry_batches (tenant_id, created_at);

CREATE TABLE public.back_entry_lines (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES public.tenants (id)
                   ON DELETE RESTRICT,
  batch_id       uuid        NOT NULL REFERENCES public.back_entry_batches (id)
                   ON DELETE RESTRICT,
  line_no        integer     NOT NULL CHECK (line_no > 0),
  line_type      text        NOT NULL
                 CHECK (line_type IN ('purchase','sale','payment',
                                      'adjustment','opening_balance')),
  source_ref     text        NOT NULL CHECK (char_length(btrim(source_ref)) > 0),
  business_date  date        NOT NULL
                 CHECK (business_date >= DATE '2025-01-01'
                        AND business_date < DATE '2026-01-01'),
  product_id     uuid        REFERENCES public.products (id)
                   ON DELETE RESTRICT,
  supplier_id    uuid        REFERENCES public.suppliers (id)
                   ON DELETE RESTRICT,
  customer_id    uuid        REFERENCES public.customers (id)
                   ON DELETE RESTRICT,
  instrument_id  uuid        REFERENCES public.payment_instruments (id)
                   ON DELETE RESTRICT,
  lot_id         uuid        REFERENCES public.stock_lots (id)
                   ON DELETE RESTRICT,
  qty            numeric(18,2),
  unit_cost      numeric(18,2),
  rate           numeric(18,2),
  amount         numeric(18,2),
  method         text,
  expiry_date    date,
  received_at    timestamptz,
  lot_mode       text        NOT NULL DEFAULT 'exact'
                 CHECK (lot_mode IN ('exact','aggregate')),
  allocation     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, line_no)
);
CREATE INDEX back_entry_lines_batch_idx
  ON public.back_entry_lines (batch_id);

CREATE TABLE public.suspense_records (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants (id)
                     ON DELETE RESTRICT,
  batch_id         uuid        REFERENCES public.back_entry_batches (id)
                     ON DELETE RESTRICT,
  source_ref       text        NOT NULL,
  kind             text        NOT NULL,
  detail           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  reason           text        NOT NULL,
  status           text        NOT NULL DEFAULT 'parked'
                   CHECK (status IN ('parked','resolved','excluded')),
  resolved_by_profile uuid     REFERENCES public.profiles (id)
                     ON DELETE RESTRICT,
  resolved_at      timestamptz,
  resolution_note  text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX suspense_tenant_status_idx
  ON public.suspense_records (tenant_id, status);

-- Single atomic window lock: at most one row per tenant; no unlock path
-- (post-lock corrections use live-period journals only).
CREATE TABLE public.back_entry_lock (
  tenant_id        uuid        PRIMARY KEY REFERENCES public.tenants (id)
                     ON DELETE RESTRICT,
  locked_by_profile uuid       NOT NULL REFERENCES public.profiles (id)
                     ON DELETE RESTRICT,
  reason           text        NOT NULL,
  locked_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_claims
  ADD COLUMN back_entry_batch_id uuid
    REFERENCES public.back_entry_batches (id)
    ON DELETE RESTRICT;
-- NOTE: back_entry_batches is created above in this same transaction, so
-- the reference resolves (fail-closed if absent). Pre-existing claims keep
-- NULL (live origin, unaffected).

-- --------------------------------------------------------------------------
-- 2. Lock acquisition (admin only; concurrent attempts serialize on the
--    tenant PK — exactly one winner, losers get a clean unique violation).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acquire_back_entry_lock(p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid; v_actor uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Lock reason required';
  END IF;
  SELECT p.id INTO v_actor FROM public.profiles p
  WHERE p.user_id = auth.uid();
  BEGIN
    INSERT INTO public.back_entry_lock
      (tenant_id, locked_by_profile, reason)
    VALUES (v_tenant, v_actor, btrim(p_reason));
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Back-entry window already locked';
  END;
  RETURN v_tenant;
END;
$$;
REVOKE ALL ON FUNCTION public.acquire_back_entry_lock(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acquire_back_entry_lock(text) TO authenticated;

-- --------------------------------------------------------------------------
-- 3. Batch submit (admin only; fully atomic; idempotent by batch_key).
--    Window/claim checks first; every line validated, posted, and linked;
--    parkable lines go to suspense (same transaction — atomic commit).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_back_entry_batch(
  p_batch_key text, p_reason text, p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_actor  uuid;
  v_batch  uuid;
  v_resp   jsonb;
  v_item   jsonb;
  v_no     integer := 0;
  v_ltype  text;
  v_bdate  date;
  v_sref   text;
  v_prod   record;
  v_lot    uuid;
  v_agg    record;
  v_alloc  record;
  v_qty    numeric;
  v_cost   numeric;
  v_lines_total numeric := 0;
  v_parked integer := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.back_entry_lock l
             WHERE l.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Back-entry window is locked';
  END IF;
  IF nullif(btrim(p_batch_key), '') IS NULL THEN
    RAISE EXCEPTION 'Batch key required';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Batch reason required';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Batch requires at least one line';
  END IF;
  SELECT p.id INTO v_actor FROM public.profiles p
  WHERE p.user_id = auth.uid();

  BEGIN
    INSERT INTO public.back_entry_batches
      (tenant_id, batch_key, reason, actor_profile_id)
    VALUES (v_tenant, btrim(p_batch_key), btrim(p_reason), v_actor)
    RETURNING id INTO v_batch;
  EXCEPTION WHEN unique_violation THEN
    -- Duplicate batch_key with a stored response: idempotent replay.
    -- (Handler scoped to this INSERT only; any other unique violation
    -- elsewhere in the body propagates as an error.)
    SELECT response INTO v_resp FROM public.back_entry_batches
    WHERE tenant_id = v_tenant AND batch_key = btrim(p_batch_key);
    IF v_resp IS NULL THEN RAISE; END IF;
    RETURN v_resp;
  END;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_no := v_no + 1;
    v_ltype := btrim(v_item->>'line_type');
    v_sref := nullif(btrim(v_item->>'source_ref'), '');
    v_bdate := nullif(v_item->>'business_date','')::date;
    IF v_ltype NOT IN ('purchase','sale','payment','adjustment',
                       'opening_balance') THEN
      RAISE EXCEPTION 'Unknown line type at line %', v_no;
    END IF;
    IF v_sref IS NULL THEN
      RAISE EXCEPTION 'Line % requires source_ref (no free-form entries)', v_no;
    END IF;
    IF v_bdate IS NULL OR v_bdate < DATE '2025-01-01'
       OR v_bdate >= DATE '2026-01-01' THEN
      RAISE EXCEPTION 'Line % business_date outside 12-month window', v_no;
    END IF;

    IF v_ltype = 'purchase' THEN
      SELECT * INTO v_prod FROM public.products p
      WHERE p.id = nullif(v_item->>'product_id','')::uuid
        AND p.tenant_id = v_tenant AND p.is_active;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Line %: unknown or inactive product', v_no;
      END IF;
      v_qty := coalesce((v_item->>'qty')::numeric, 0);
      IF v_qty <= 0 THEN
        RAISE EXCEPTION 'Line %: purchase qty must be positive', v_no;
      END IF;
      IF coalesce((v_item->>'unit_cost')::numeric, -1) < 0 THEN
        RAISE EXCEPTION 'Line %: unit_cost must be non-negative', v_no;
      END IF;
      IF nullif(v_item->>'expiry_date','') IS NULL THEN
        RAISE EXCEPTION 'Line %: unknown expiry rejected', v_no;
      END IF;
      IF (v_item->>'lot_mode') IS NOT NULL
         AND btrim(v_item->>'lot_mode') NOT IN ('exact','aggregate') THEN
        RAISE EXCEPTION 'Line %: lot_mode must be exact or aggregate', v_no;
      END IF;
      IF nullif(v_item->>'supplier_id','') IS NULL THEN
        -- Missing counterparty: park, do not post (suspense-as-proposed).
        INSERT INTO public.suspense_records
          (tenant_id, batch_id, source_ref, kind, detail, reason)
        VALUES (v_tenant, v_batch, v_sref, 'purchase',
                jsonb_build_object('line_no', v_no, 'product_id', v_prod.id,
                  'qty', v_qty, 'unit_cost', (v_item->>'unit_cost')::numeric,
                  'business_date', v_bdate),
                'Missing supplier: parked for resolution');
        INSERT INTO public.back_entry_lines
          (tenant_id, batch_id, line_no, line_type, source_ref, business_date,
           product_id, qty, unit_cost, expiry_date, received_at, reason)
        VALUES (v_tenant, v_batch, v_no, 'purchase', v_sref, v_bdate,
                v_prod.id, v_qty, (v_item->>'unit_cost')::numeric,
                (v_item->>'expiry_date')::date,
                coalesce(nullif(v_item->>'received_at','')::timestamptz,
                         v_bdate::timestamptz),
                'Parked: missing supplier');
        v_parked := v_parked + 1;
        CONTINUE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.suppliers s
                     WHERE s.id = nullif(v_item->>'supplier_id','')::uuid
                       AND s.tenant_id = v_tenant AND s.is_active) THEN
        RAISE EXCEPTION 'Line %: unknown or inactive supplier', v_no;
      END IF;
      IF coalesce(btrim(v_item->>'lot_mode'), 'exact') = 'aggregate' THEN
        -- APPROVED monthly aggregate: (product, calendar month, unit cost).
        SELECT * INTO v_agg FROM public.stock_lots l
        WHERE l.tenant_id = v_tenant AND l.product_id = v_prod.id
          AND l.source_ref =
            'aggregate:' || to_char(v_bdate, 'YYYY-MM')
            || ':' || round((v_item->>'unit_cost')::numeric, 2)::text
        FOR UPDATE;
      IF NOT FOUND THEN
        INSERT INTO public.stock_lots
          (tenant_id, product_id, source_ref, qty_received, qty_remaining,
           unit_cost, received_at, expiry_date)
        VALUES (v_tenant, v_prod.id,
                'aggregate:' || to_char(v_bdate, 'YYYY-MM')
                || ':' || round((v_item->>'unit_cost')::numeric, 2)::text,
                v_qty, v_qty, (v_item->>'unit_cost')::numeric,
                date_trunc('month', v_bdate),
                (v_item->>'expiry_date')::date)
        RETURNING id INTO v_lot;
      ELSE
        UPDATE public.stock_lots
        SET qty_received = qty_received + v_qty,
            qty_remaining = qty_remaining + v_qty
        WHERE id = v_agg.id;
        v_lot := v_agg.id;
      END IF;
      ELSE
        INSERT INTO public.stock_lots
          (tenant_id, product_id, source_ref, qty_received, qty_remaining,
           unit_cost, received_at, expiry_date)
        VALUES (v_tenant, v_prod.id, v_sref, v_qty, v_qty,
                (v_item->>'unit_cost')::numeric,
                coalesce(nullif(v_item->>'received_at','')::timestamptz,
                         v_bdate::timestamptz),
                (v_item->>'expiry_date')::date)
        RETURNING id INTO v_lot;
      END IF;
      INSERT INTO public.back_entry_lines
        (tenant_id, batch_id, line_no, line_type, source_ref, business_date,
         product_id, supplier_id, qty, unit_cost, expiry_date, received_at,
         lot_id)
      VALUES (v_tenant, v_batch, v_no, 'purchase', v_sref, v_bdate,
              v_prod.id, nullif(v_item->>'supplier_id','')::uuid,
              v_qty, (v_item->>'unit_cost')::numeric,
              (v_item->>'expiry_date')::date,
              coalesce(nullif(v_item->>'received_at','')::timestamptz,
                       v_bdate::timestamptz),
              v_lot);
      PERFORM public.post_journal(v_bdate, 'purchase', v_batch,
        'Back-entry purchase ' || v_sref,
        jsonb_build_array(
          jsonb_build_object('account_code', '1200',
            'debit', round(v_qty * (v_item->>'unit_cost')::numeric, 2),
            'description', 'Historical inventory'),
          jsonb_build_object('account_code', '2000',
            'credit', round(v_qty * (v_item->>'unit_cost')::numeric, 2),
            'description', 'Historical payable')),
        'back_entry');
      v_lines_total := v_lines_total + 1;

    ELSIF v_ltype = 'sale' THEN
      SELECT * INTO v_prod FROM public.products p
      WHERE p.id = nullif(v_item->>'product_id','')::uuid
        AND p.tenant_id = v_tenant AND p.is_active;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Line %: unknown or inactive product', v_no;
      END IF;
      IF nullif(v_item->>'customer_id','') IS NOT NULL AND NOT EXISTS
         (SELECT 1 FROM public.customers c
          WHERE c.id = nullif(v_item->>'customer_id','')::uuid
            AND c.tenant_id = v_tenant AND c.is_active) THEN
        RAISE EXCEPTION 'Line %: unknown or inactive customer', v_no;
      END IF;
      v_qty := coalesce((v_item->>'qty')::numeric, 0);
      IF v_qty <= 0 THEN
        RAISE EXCEPTION 'Line %: sale qty must be positive', v_no;
      END IF;
      IF coalesce((v_item->>'rate')::numeric, -1) < 0 THEN
        RAISE EXCEPTION 'Line %: sale rate must be non-negative', v_no;
      END IF;
      INSERT INTO public.back_entry_lines
        (tenant_id, batch_id, line_no, line_type, source_ref, business_date,
         product_id,
         customer_id, qty, rate, amount, allocation)
      VALUES (v_tenant, v_batch, v_no, 'sale', v_sref, v_bdate,
              v_prod.id,
              nullif(v_item->>'customer_id','')::uuid,
              v_qty, (v_item->>'rate')::numeric,
              round(v_qty * (v_item->>'rate')::numeric, 2),
              (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'lot_id', a.lot_id, 'qty', a.qty, 'unit_cost', a.unit_cost)),
                 '[]'::jsonb)
               FROM (SELECT * FROM public.allocate_fifo(
                       v_prod.id, v_qty)) a));
      -- NOTE: allocate_fifo honors holds/expiry on CURRENT state (documented
      -- simplification: back-entry sales allocate across open lots; fixtures
      -- use dedicated products so allocation is deterministic in tests).
      FOR v_alloc IN
        SELECT * FROM jsonb_to_recordset(
          (SELECT allocation FROM public.back_entry_lines
           WHERE batch_id = v_batch AND line_no = v_no))
          AS x(lot_id uuid, qty numeric, unit_cost numeric)
      LOOP
        UPDATE public.stock_lots
        SET qty_remaining = qty_remaining - v_alloc.qty,
            status = CASE WHEN qty_remaining - v_alloc.qty = 0
                          THEN 'exhausted' ELSE status END
        WHERE id = v_alloc.lot_id;
      END LOOP;
      PERFORM public.post_journal(v_bdate, 'sale', v_batch,
        'Back-entry sale ' || v_sref,
        (SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('account_code',
                   CASE WHEN nullif(v_item->>'customer_id','') IS NULL
                        THEN '1000' ELSE '1300' END,
                   'debit', round(v_qty * (v_item->>'rate')::numeric, 2),
                   'description', 'Historical takings') AS x
          UNION ALL
          SELECT jsonb_build_object('account_code', '4000',
                   'credit', round(v_qty * (v_item->>'rate')::numeric, 2),
                   'description', 'Historical sales') AS x
          UNION ALL
          SELECT jsonb_build_object('account_code', '5000', 'debit',
                   round((a->>'qty')::numeric * (a->>'unit_cost')::numeric, 2),
                   'description', 'Historical COGS')
          FROM jsonb_array_elements(
            (SELECT allocation FROM public.back_entry_lines
             WHERE batch_id = v_batch AND line_no = v_no)) a
          UNION ALL
          SELECT jsonb_build_object('account_code', '1200', 'credit',
                   round((a->>'qty')::numeric * (a->>'unit_cost')::numeric, 2),
                   'description', 'Historical inventory relief')
          FROM jsonb_array_elements(
            (SELECT allocation FROM public.back_entry_lines
             WHERE batch_id = v_batch AND line_no = v_no)) a
        ) s), 'back_entry');
      v_lines_total := v_lines_total + 1;

    ELSIF v_ltype = 'payment' THEN
      IF nullif(v_item->>'customer_id','') IS NULL THEN
        RAISE EXCEPTION 'Line %: payment requires customer', v_no;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.customers c
                     WHERE c.id = nullif(v_item->>'customer_id','')::uuid
                       AND c.tenant_id = v_tenant AND c.is_active) THEN
        RAISE EXCEPTION 'Line %: unknown or inactive customer', v_no;
      END IF;
      IF coalesce((v_item->>'amount')::numeric, 0) <= 0 THEN
        RAISE EXCEPTION 'Line %: payment amount must be positive', v_no;
      END IF;
      IF nullif(v_item->>'instrument_id','') IS NULL OR NOT EXISTS
         (SELECT 1 FROM public.payment_instruments pi
          WHERE pi.id = nullif(v_item->>'instrument_id','')::uuid
            AND pi.tenant_id = v_tenant AND pi.is_active) THEN
        RAISE EXCEPTION 'Line %: unknown or inactive instrument', v_no;
      END IF;
      IF nullif(v_item->>'method','') IS NULL
         OR btrim(v_item->>'method') NOT IN
            ('cash','upi','card','wallet','credit') THEN
        RAISE EXCEPTION 'Line %: unsupported payment method', v_no;
      END IF;
      INSERT INTO public.back_entry_lines
        (tenant_id, batch_id, line_no, line_type, source_ref, business_date,
         customer_id, amount, method, instrument_id)
      VALUES (v_tenant, v_batch, v_no, 'payment', v_sref, v_bdate,
              nullif(v_item->>'customer_id','')::uuid,
              round((v_item->>'amount')::numeric, 2),
              btrim(v_item->>'method'),
              nullif(v_item->>'instrument_id','')::uuid);
      INSERT INTO public.payment_claims
        (tenant_id, customer_id, method, amount, instrument_id,
         recorded_by_profile, back_entry_batch_id,
         claim_state, recognized_by_profile, recognized_at)
      SELECT v_tenant,
             nullif(v_item->>'customer_id','')::uuid,
             btrim(v_item->>'method'),
             round((v_item->>'amount')::numeric, 2),
             nullif(v_item->>'instrument_id','')::uuid,
             v_actor, v_batch,
             'recognized', v_actor, v_bdate::timestamptz;
      -- Explicit mapping check (uniform path; mirrors recognize_claim).
      -- Unmapped instruments fail loudly here, never post to a guessed leg.
      IF NOT EXISTS (SELECT 1 FROM public.instrument_account_map m
                     JOIN public.payment_instruments pi
                       ON pi.id = m.instrument_id
                     WHERE pi.id = nullif(v_item->>'instrument_id','')::uuid) THEN
        RAISE EXCEPTION 'Line %: instrument account mapping missing', v_no;
      END IF;
      PERFORM public.post_journal(v_bdate, 'payment', v_batch,
        'Back-entry payment ' || v_sref,
        (SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('account_code', m.account_code,
                   'debit', round((v_item->>'amount')::numeric, 2),
                   'description', 'Historical collection') AS x
          FROM (SELECT pi.itype FROM public.payment_instruments pi
                WHERE pi.id = nullif(v_item->>'instrument_id','')::uuid) i
          JOIN (VALUES ('cash','1000'),('bank','1010'),('upi_qr','1020'),
                       ('wallet','1030'),('card','1060'),
                       ('aeps_portal','1040'),('dmt_portal','1050')
               ) AS m(itype, account_code) ON m.itype = i.itype
          UNION ALL
          SELECT jsonb_build_object('account_code', '1300',
                   'credit', round((v_item->>'amount')::numeric, 2),
                   'description', 'Historical dues') AS x
        ) s), 'back_entry');
      v_lines_total := v_lines_total + 1;

    ELSIF v_ltype = 'adjustment' THEN
      IF nullif(v_item->>'lot_id','') IS NULL OR NOT EXISTS
         (SELECT 1 FROM public.stock_lots l
          WHERE l.id = nullif(v_item->>'lot_id','')::uuid
            AND l.tenant_id = v_tenant) THEN
        RAISE EXCEPTION 'Line %: adjustment needs an existing lot', v_no;
      END IF;
      IF coalesce((v_item->>'qty_delta')::numeric, 0) = 0 THEN
        RAISE EXCEPTION 'Line %: adjustment delta must be non-zero', v_no;
      END IF;
      IF nullif(btrim(v_item->>'reason'), '') IS NULL THEN
        RAISE EXCEPTION 'Line %: adjustment reason required', v_no;
      END IF;
      SELECT qty_remaining, unit_cost INTO v_qty, v_cost
      FROM public.stock_lots WHERE id = nullif(v_item->>'lot_id','')::uuid;
      IF v_qty + coalesce((v_item->>'qty_delta')::numeric, 0) < 0 THEN
        RAISE EXCEPTION 'Line %: adjustment drives lot negative', v_no;
      END IF;
      UPDATE public.stock_lots
      SET qty_remaining = qty_remaining
                          + coalesce((v_item->>'qty_delta')::numeric, 0)
      WHERE id = nullif(v_item->>'lot_id','')::uuid;
      INSERT INTO public.back_entry_lines
        (tenant_id, batch_id, line_no, line_type, source_ref, business_date,
         product_id, lot_id, qty, reason)
      VALUES (v_tenant, v_batch, v_no, 'adjustment', v_sref, v_bdate,
              (SELECT product_id FROM public.stock_lots
               WHERE id = nullif(v_item->>'lot_id','')::uuid),
              nullif(v_item->>'lot_id','')::uuid,
              coalesce((v_item->>'qty_delta')::numeric, 0),
              btrim(v_item->>'reason'));
      IF coalesce((v_item->>'qty_delta')::numeric, 0) < 0 THEN
        PERFORM public.post_journal(v_bdate, 'adjustment', v_batch,
          'Back-entry adjustment ' || v_sref,
          jsonb_build_array(
            jsonb_build_object('account_code', '5200', 'debit',
              round(abs(coalesce((v_item->>'qty_delta')::numeric, 0))
                    * v_cost, 2),
              'description', 'Historical adjustment'),
            jsonb_build_object('account_code', '1200', 'credit',
              round(abs(coalesce((v_item->>'qty_delta')::numeric, 0))
                    * v_cost, 2),
              'description', 'Historical inventory')),
          'back_entry');
      ELSE
        PERFORM public.post_journal(v_bdate, 'adjustment', v_batch,
          'Back-entry adjustment ' || v_sref,
          jsonb_build_array(
            jsonb_build_object('account_code', '1200', 'debit',
              round(abs(coalesce((v_item->>'qty_delta')::numeric, 0))
                    * v_cost, 2),
              'description', 'Historical inventory'),
            jsonb_build_object('account_code', '5200', 'credit',
              round(abs(coalesce((v_item->>'qty_delta')::numeric, 0))
                    * v_cost, 2),
              'description', 'Historical adjustment')),
          'back_entry');
      END IF;
      v_lines_total := v_lines_total + 1;

    ELSIF v_ltype = 'opening_balance' THEN
      IF nullif(v_item->>'instrument_id','') IS NULL OR NOT EXISTS
         (SELECT 1 FROM public.payment_instruments pi
          WHERE pi.id = nullif(v_item->>'instrument_id','')::uuid
            AND pi.tenant_id = v_tenant AND pi.is_active) THEN
        RAISE EXCEPTION 'Line %: unknown or inactive instrument', v_no;
      END IF;
      IF coalesce((v_item->>'amount')::numeric, 0) <= 0 THEN
        RAISE EXCEPTION 'Line %: opening amount must be positive', v_no;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.instrument_account_map m
                     WHERE m.instrument_id
                           = nullif(v_item->>'instrument_id','')::uuid) THEN
        RAISE EXCEPTION 'Line %: instrument account mapping missing', v_no;
      END IF;
      INSERT INTO public.back_entry_lines
        (tenant_id, batch_id, line_no, line_type, source_ref, business_date,
         instrument_id, amount)
      VALUES (v_tenant, v_batch, v_no, 'opening_balance', v_sref, v_bdate,
              nullif(v_item->>'instrument_id','')::uuid,
              round((v_item->>'amount')::numeric, 2));
      PERFORM public.post_journal(v_bdate, 'opening', v_batch,
        'Back-entry opening ' || v_sref,
        (SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('account_code', m.account_code,
                   'debit', round((v_item->>'amount')::numeric, 2),
                   'description', 'Opening balance') AS x
          FROM (SELECT pi.itype FROM public.payment_instruments pi
                WHERE pi.id = nullif(v_item->>'instrument_id','')::uuid) i
          JOIN (VALUES ('cash','1000'),('bank','1010'),('upi_qr','1020'),
                       ('wallet','1030'),('card','1060'),
                       ('aeps_portal','1040'),('dmt_portal','1050')
               ) AS m(itype, account_code) ON m.itype = i.itype
          UNION ALL
          SELECT jsonb_build_object('account_code', '3000',
                   'credit', round((v_item->>'amount')::numeric, 2),
                   'description', 'Opening equity') AS x
        ) s), 'back_entry');
      v_lines_total := v_lines_total + 1;
    END IF;
  END LOOP;

  v_resp := jsonb_build_object('id', v_batch, 'lines_posted', v_lines_total,
                               'lines_parked', v_parked);
  UPDATE public.back_entry_batches SET response = v_resp WHERE id = v_batch;

  PERFORM public.append_audit(
    'back_entry_posted', 'back_entry_batches', v_batch::text,
    'Back-entry batch ' || btrim(p_batch_key),
    jsonb_build_object('batch_key', btrim(p_batch_key),
                       'lines_posted', v_lines_total,
                       'lines_parked', v_parked,
                       'reason', btrim(p_reason)),
    NULL);

  RETURN v_resp;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_back_entry_batch(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_back_entry_batch(text,text,jsonb) TO authenticated;

-- --------------------------------------------------------------------------
-- 4. Void batch (admin): reverses every posted batch journal, marks voided.
--    Cancel-and-recreate doctrine; no edits, no deletes.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_back_entry_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_batch  record;
  v_eid    uuid;
  v_n      integer := 0;
  v_line   record;
  v_alloc  record;
  v_lotrow record;
  v_rem    numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;
  v_tenant := public.current_tenant();
  SELECT * INTO v_batch FROM public.back_entry_batches b
  WHERE b.id = p_batch_id AND b.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found in tenant';
  END IF;
  IF v_batch.status <> 'posted' THEN
    RAISE EXCEPTION 'Only posted batches can be voided (status=%)',
      v_batch.status;
  END IF;
  -- Symmetric stock reversal first (fail-closed): sales restore allocated
  -- qtys; purchases subtract created qtys (blocked if already consumed);
  -- adjustments reverse their delta (blocked if it would drive negative).
  -- Journals reverse after; any failure rolls back everything.
  FOR v_line IN
    SELECT * FROM public.back_entry_lines
    WHERE batch_id = p_batch_id ORDER BY line_no
  LOOP
    IF v_line.line_type = 'sale' THEN
      FOR v_alloc IN
        SELECT * FROM jsonb_to_recordset(v_line.allocation)
          AS x(lot_id uuid, qty numeric, unit_cost numeric)
      LOOP
        UPDATE public.stock_lots
        SET qty_remaining = qty_remaining + v_alloc.qty,
            status = CASE WHEN status = 'exhausted'
                               AND expiry_date > CURRENT_DATE
                          THEN 'open' ELSE status END
        WHERE id = v_alloc.lot_id;
      END LOOP;
    ELSIF v_line.line_type = 'purchase' THEN
      IF v_line.lot_id IS NULL THEN
        CONTINUE; -- parked line: posted nothing, nothing to reverse
      END IF;
      SELECT * INTO v_lotrow FROM public.stock_lots WHERE id = v_line.lot_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Void failed: purchase lot already removed';
      END IF;
      IF v_lotrow.qty_remaining < v_line.qty THEN
        RAISE EXCEPTION 'Void failed: purchase lot already consumed (%)',
          v_lotrow.qty_remaining;
      END IF;
      UPDATE public.stock_lots
      SET qty_remaining = qty_remaining - v_line.qty,
          status = CASE WHEN qty_remaining - v_line.qty = 0
                        THEN 'exhausted' ELSE status END
      WHERE id = v_line.lot_id;
    ELSIF v_line.line_type = 'adjustment' THEN
      IF v_line.lot_id IS NULL THEN
        CONTINUE; -- parked line: posted nothing, nothing to reverse
      END IF;
      SELECT qty_remaining INTO v_rem FROM public.stock_lots
      WHERE id = v_line.lot_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Void failed: adjustment lot already removed';
      END IF;
      IF v_rem - v_line.qty < 0 THEN
        RAISE EXCEPTION 'Void failed: reversing adjustment drives negative';
      END IF;
      UPDATE public.stock_lots
      SET qty_remaining = qty_remaining - v_line.qty
      WHERE id = v_line.lot_id;
    END IF;
  END LOOP;
  FOR v_eid IN
    SELECT e.id FROM public.journal_entries e
    WHERE e.tenant_id = v_tenant AND e.source_id = v_batch.id
      AND e.status = 'posted'
  LOOP
    PERFORM public.reverse_journal_entry(v_eid, NULL);
    v_n := v_n + 1;
  END LOOP;
  UPDATE public.back_entry_batches SET status = 'voided'
  WHERE id = p_batch_id;
  PERFORM public.append_audit(
    'back_entry_voided', 'back_entry_batches', p_batch_id::text,
    'Back-entry batch voided ' || v_batch.batch_key,
    jsonb_build_object('batch_key', v_batch.batch_key,
                       'journals_reversed', v_n),
    NULL);
  RETURN jsonb_build_object('id', p_batch_id, 'status', 'voided',
                            'journals_reversed', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.void_back_entry_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_back_entry_batch(uuid) TO authenticated;

-- --------------------------------------------------------------------------
-- 4b. dues_of extension (G4 dependency completion, additive only).
-- Back-entry credit sales raise dues exactly like live invoices; without
-- this term, historical payments would drive dues wrongly negative.
-- Posted-only batches count; voided batches are excluded. G4 gate fixtures
-- contain no back-entry rows, so G4 assertions are unchanged (verified).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dues_of(p_customer_id uuid)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_inv numeric; v_pay numeric; v_be numeric;
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
  SELECT coalesce(sum(amount), 0) INTO v_be
  FROM public.back_entry_lines l
  JOIN public.back_entry_batches b ON b.id = l.batch_id
  WHERE l.customer_id = p_customer_id
    AND l.line_type = 'sale'
    AND b.status = 'posted'
    AND (public.current_tenant() IS NULL
         OR l.tenant_id = public.current_tenant());
  RETURN round(v_inv - v_pay + v_be, 2);
END;
$$;

-- --------------------------------------------------------------------------
-- 5. Suspense resolution (admin): mark parked rows resolved/excluded.
--    The correcting batch, if any, is submitted separately and references
--    the suspense row in its reason (traceability without FK cycles).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_suspense(
  p_suspense_id uuid, p_outcome text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;
  v_tenant := public.current_tenant();
  IF p_outcome NOT IN ('resolved','excluded') THEN
    RAISE EXCEPTION 'Outcome must be resolved or excluded';
  END IF;
  UPDATE public.suspense_records
  SET status = p_outcome,
      resolved_by_profile = (SELECT p.id FROM public.profiles p
                             WHERE p.user_id = auth.uid()),
      resolved_at = now(),
      resolution_note = nullif(btrim(p_note), '')
  WHERE id = p_suspense_id AND tenant_id = v_tenant
    AND status = 'parked';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parked suspense record not found in tenant';
  END IF;
  RETURN jsonb_build_object('id', p_suspense_id, 'status', p_outcome);
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_suspense(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_suspense(uuid,text,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 6. RLS: deny-default; back-office reads; all writes via RPCs
-- --------------------------------------------------------------------------
ALTER TABLE public.back_entry_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.back_entry_lines   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suspense_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.back_entry_lock    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.back_entry_batches, public.back_entry_lines,
  public.suspense_records, public.back_entry_lock
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.back_entry_batches TO authenticated;
GRANT SELECT ON public.back_entry_lines TO authenticated;
GRANT SELECT ON public.suspense_records TO authenticated;
GRANT SELECT ON public.back_entry_lock TO authenticated;
CREATE POLICY back_entry_batches_scope_select ON public.back_entry_batches
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());
CREATE POLICY back_entry_lines_scope_select ON public.back_entry_lines
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());
CREATE POLICY suspense_scope_select ON public.suspense_records
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());
CREATE POLICY back_entry_lock_scope_select ON public.back_entry_lock
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());

COMMIT;
