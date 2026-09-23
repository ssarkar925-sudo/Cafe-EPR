-- ============================================================================
-- V1 BASELINE — G6: immutable journals + uniform posting engine
-- Depends on: G0 (roles/tenant/numbering), G1 (CoA/instruments),
--             G2 (lots/adjustments), G3 (sales/purchases), G4 (claims/khata),
--             G5 (services).
-- Uniform path: every posted document resolves to balanced journal batches
-- through post_journal(); callers hold idempotency keys (no double-post).
-- AEPS legs follow the documented formula (cash_out = amount − fee,
-- pool_credit = amount + commission); finance re-verification flagged.
-- Revenue posts NET of discount (no discount head exists; presentation
-- granularity only — flagged for finance review, integrity unaffected).
-- DMT/UPI/Recharge/BBPS principal legs are NOT posted: their funding/
-- counterparty rules are absent from approved docs (recorded blockers below).
-- They record (G5) and post nothing rather than post invented legs.
--
-- RECORDED BLOCKERS (missing rules; finance/owner input required):
--   G6-B1 DMT principal funding: legs need the funding source (bank vs
--     portal float) per transaction; frozen DMT fields carry no funding
--     instrument. Fee-only legs are likewise withheld to avoid half-posts.
--   G6-B2 UPI counterparty: collection legs need the credited account
--     (takings vs dues vs QR clearing) per transaction context.
--   G6-B3 Recharge/BBPS provider settlement: legs need provider payable
--     terms and commission recognition timing per provider.
-- Until resolved, these types record without journal legs (verified in gate:
-- zero batches asserted, never wrong batches).
-- Instrument→account resolution lives in an explicit mapping table seeded
-- name-identically (cash→Cash Drawer, bank→Bank, upi_qr→UPI/QR Clearing,
-- wallet→Wallets); finance review flagged. No GST math. No live integrations.
-- G3/G2/G5 RPCs are replaced with posting-integrated versions; signatures,
-- response shapes, grants, and prior behavior are otherwise preserved.
-- Single transaction, fail-closed.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 0. G0 completion: 'journal' numbering value + seed rows.
-- --------------------------------------------------------------------------
ALTER TABLE public.numbering_sequences
  DROP CONSTRAINT numbering_sequences_seq_name_check;
ALTER TABLE public.numbering_sequences
  ADD CONSTRAINT numbering_sequences_seq_name_check
  CHECK (seq_name IN ('invoice','settlement','closing','service','journal'));

INSERT INTO public.numbering_sequences (tenant_id, seq_name)
SELECT t.id, 'journal'
FROM public.tenants t
WHERE t.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM public.numbering_sequences s
                  WHERE s.tenant_id = t.id AND s.seq_name = 'journal');

-- --------------------------------------------------------------------------
-- 1. Tables: immutable headers + exactly-one-sided lines
-- --------------------------------------------------------------------------
CREATE TABLE public.journal_entries (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants (id)
                     ON DELETE RESTRICT,
  entry_number     text        NOT NULL,
  entry_date       date        NOT NULL,
  source_type      text        NOT NULL
                   CHECK (source_type IN ('sale','purchase','payment',
                     'service','adjustment','settlement','opening',
                     'reversal','variance')),
  source_id        uuid        NOT NULL,
  description      text        NOT NULL,
  origin           text        NOT NULL DEFAULT 'live'
                   CHECK (origin IN ('live','back_entry','opening')),
  status           text        NOT NULL DEFAULT 'posted'
                   CHECK (status IN ('posted','reversed')),
  reverses         uuid        REFERENCES public.journal_entries (id)
                     ON DELETE RESTRICT,
  reversed_by      uuid        REFERENCES public.journal_entries (id)
                     ON DELETE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entry_number)
  -- NOTE: no UNIQUE on (source_type, source_id): reversals legitimately
  -- share source identity with their originals. Double-posting is prevented
  -- by caller-held idempotency keys (verified: replay yields one batch).
);

CREATE TABLE public.journal_lines (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants (id)
                     ON DELETE RESTRICT,
  journal_entry_id uuid        NOT NULL REFERENCES public.journal_entries (id)
                     ON DELETE RESTRICT,
  account_id       uuid        NOT NULL REFERENCES public.chart_of_accounts (id)
                     ON DELETE RESTRICT,
  line_no          integer     NOT NULL CHECK (line_no > 0),
  debit            numeric(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit           numeric(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journal_line_one_side
    CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
  UNIQUE (journal_entry_id, line_no)
);
CREATE INDEX journal_lines_entry_idx ON public.journal_lines (journal_entry_id);
CREATE INDEX journal_lines_account_date_idx
  ON public.journal_lines (tenant_id, account_id);

-- Immutability: posted journals can never be updated or deleted by anyone,
-- including the table owner (triggers fire regardless of role/grants).
-- Sole exception: the posted -> reversed status flip performed together
-- with setting reversed_by, which only reverse_journal_entry does as one
-- atomic step. Any other column change, or a flip without the link, raises.
-- Corrections happen only through mirror reversals (reverse_journal_entry).
CREATE OR REPLACE FUNCTION public.trg_journal_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Posted journal entries are immutable; use reversals';
  END IF;
  IF TG_TABLE_NAME = 'journal_entries'
     AND OLD.status = 'posted' AND NEW.status = 'reversed'
     AND OLD.reversed_by IS NULL AND NEW.reversed_by IS NOT NULL
     AND (OLD.entry_number, OLD.entry_date, OLD.source_type, OLD.source_id,
          OLD.description, OLD.origin, OLD.created_at)
         IS NOT DISTINCT FROM
         (NEW.entry_number, NEW.entry_date, NEW.source_type, NEW.source_id,
          NEW.description, NEW.origin, NEW.created_at) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Posted journal entries are immutable; use reversals';
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_journal_immutable() FROM PUBLIC;

CREATE TRIGGER trg_journal_entries_immutable
  BEFORE UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_journal_immutable();
CREATE TRIGGER trg_journal_lines_immutable
  BEFORE UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_journal_immutable();

-- Balance enforcement: exact equality (all inputs rounded to 2dp first).
-- Deferred so multi-line batches insert atomically within one transaction.
CREATE OR REPLACE FUNCTION public.trg_journal_balanced()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_d numeric; v_c numeric; v_eid uuid;
BEGIN
  v_eid := CASE WHEN TG_OP = 'DELETE' THEN OLD.journal_entry_id
                ELSE NEW.journal_entry_id END;
  SELECT coalesce(sum(debit), 0), coalesce(sum(credit), 0)
  INTO v_d, v_c
  FROM public.journal_lines WHERE journal_entry_id = v_eid;
  IF v_d <> v_c THEN
    RAISE EXCEPTION 'Journal entry % is unbalanced: debit %, credit %',
      v_eid, v_d, v_c;
  END IF;
  IF v_d <= 0 THEN
    RAISE EXCEPTION 'Journal entry % has non-positive total', v_eid;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_journal_balanced() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER trg_journal_lines_balanced
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_journal_balanced();

-- --------------------------------------------------------------------------
-- 2. Posting engine (internal only: no EXECUTE grants to any caller role).
--    Callers are SECURITY DEFINER document RPCs holding idempotency keys.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_journal(
  p_entry_date date, p_source_type text, p_source_id uuid,
  p_description text, p_lines jsonb, p_origin text DEFAULT 'live')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_line   jsonb;
  v_code   text;
  v_acct   uuid;
  v_d      numeric;
  v_c      numeric;
  v_td     numeric := 0;
  v_tc     numeric := 0;
  v_no     integer := 0;
  v_num    text;
  v_eid    uuid;
BEGIN
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Journal requires at least one line';
  END IF;
  IF p_origin NOT IN ('live','back_entry','opening') THEN
    RAISE EXCEPTION 'Unknown journal origin';
  END IF;

  v_num := 'JE-' || lpad(public.next_canonical_number('journal')::text, 6, '0');
  INSERT INTO public.journal_entries
    (tenant_id, entry_number, entry_date, source_type, source_id,
     description, origin)
  VALUES (v_tenant, v_num, coalesce(p_entry_date, CURRENT_DATE),
          p_source_type, p_source_id, p_description,
          coalesce(p_origin, 'live'))
  RETURNING id INTO v_eid;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_code := btrim(v_line->>'account_code');
    SELECT a.id INTO v_acct FROM public.chart_of_accounts a
    WHERE a.tenant_id = v_tenant AND a.code = v_code AND a.is_active;
    IF v_acct IS NULL THEN
      RAISE EXCEPTION 'Unknown or inactive account %', v_code;
    END IF;
    v_d := round(coalesce((v_line->>'debit')::numeric, 0), 2);
    v_c := round(coalesce((v_line->>'credit')::numeric, 0), 2);
    IF NOT ((v_d > 0 AND v_c = 0) OR (v_c > 0 AND v_d = 0)) THEN
      RAISE EXCEPTION 'Journal line must have exactly one positive side';
    END IF;
    v_no := v_no + 1;
    INSERT INTO public.journal_lines
      (tenant_id, journal_entry_id, account_id, line_no, debit, credit,
       description)
    VALUES (v_tenant, v_eid, v_acct, v_no, v_d, v_c,
            nullif(btrim(v_line->>'description'), ''));
    v_td := v_td + v_d;
    v_tc := v_tc + v_c;
  END LOOP;

  IF v_td <= 0 THEN
    RAISE EXCEPTION 'Journal total must be positive';
  END IF;
  IF v_td <> v_tc THEN
    RAISE EXCEPTION 'Unbalanced journal: debit %, credit %', v_td, v_tc;
  END IF;
  RETURN v_eid;
END;
$$;
REVOKE ALL ON FUNCTION
  public.post_journal(date,text,uuid,text,jsonb,text) FROM PUBLIC;

-- Mirror reversal (back-office): swaps every line, links both ways, marks
-- the original reversed. Idempotency via optional caller-held key.
CREATE OR REPLACE FUNCTION public.reverse_journal_entry(
  p_entry_id uuid, p_idempotency_key text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_replay boolean; v_resp jsonb;
  v_old    record;
  v_line   record;
  v_lines  jsonb := '[]'::jsonb;
  v_num    text;
  v_new_id uuid;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  v_tenant := public.current_tenant();
  SELECT * INTO v_replay, v_resp
  FROM public.idempotency_begin('reverse_journal', p_idempotency_key);
  IF v_replay THEN RETURN (v_resp->>'id')::uuid; END IF;

  SELECT * INTO v_old FROM public.journal_entries e
  WHERE e.id = p_entry_id AND e.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry not found in tenant';
  END IF;
  IF v_old.status <> 'posted' THEN
    RAISE EXCEPTION 'Only posted entries can be reversed (status=%)',
      v_old.status;
  END IF;

  FOR v_line IN
    SELECT a.code, l.debit, l.credit, l.description
    FROM public.journal_lines l
    JOIN public.chart_of_accounts a ON a.id = l.account_id
    WHERE l.journal_entry_id = p_entry_id
    ORDER BY l.line_no
  LOOP
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', v_line.code,
      'debit', v_line.credit,
      'credit', v_line.debit,
      'description', v_line.description));
  END LOOP;

  v_num := 'JE-' || lpad(public.next_canonical_number('journal')::text, 6, '0');
  INSERT INTO public.journal_entries
    (tenant_id, entry_number, entry_date, source_type, source_id,
     description, origin, status, reverses)
  SELECT v_tenant, v_num, CURRENT_DATE, source_type, source_id,
         'Reversal of ' || entry_number, origin, 'posted', p_entry_id
  FROM public.journal_entries WHERE id = p_entry_id
  RETURNING id INTO v_new_id;

  FOR v_line IN
    SELECT a.code, l.debit, l.credit, l.description,
           row_number() OVER (ORDER BY l.line_no) AS rn
    FROM public.journal_lines l
    JOIN public.chart_of_accounts a ON a.id = l.account_id
    WHERE l.journal_entry_id = p_entry_id
    ORDER BY l.line_no
  LOOP
    INSERT INTO public.journal_lines
      (tenant_id, journal_entry_id, account_id, line_no, debit, credit,
       description)
    SELECT v_tenant, v_new_id, a.id, (v_line.rn)::integer,
           v_line.credit, v_line.debit, v_line.description
    FROM public.chart_of_accounts a
    WHERE a.tenant_id = v_tenant AND a.code = v_line.code;
  END LOOP;

  UPDATE public.journal_entries
  SET status = 'reversed', reversed_by = v_new_id
  WHERE id = p_entry_id;

  v_resp := jsonb_build_object('id', v_new_id);
  PERFORM public.idempotency_commit('reverse_journal', p_idempotency_key, v_resp);
  RETURN v_new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.reverse_journal_entry(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_journal_entry(uuid,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 3. Instrument -> account mapping (explicit configuration, seeded
--    name-identically; finance review flagged). Recognition requires a row.
-- --------------------------------------------------------------------------
CREATE TABLE public.instrument_account_map (
  instrument_id uuid        PRIMARY KEY REFERENCES public.payment_instruments (id)
                    ON DELETE RESTRICT,
  account_id    uuid        NOT NULL REFERENCES public.chart_of_accounts (id)
                    ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_instrument_account(
  p_instrument_id uuid, p_account_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid; v_acct uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;
  v_tenant := public.current_tenant();
  SELECT a.id INTO v_acct FROM public.chart_of_accounts a
  WHERE a.tenant_id = v_tenant AND a.code = btrim(p_account_code)
    AND a.is_active;
  IF v_acct IS NULL THEN
    RAISE EXCEPTION 'Unknown or inactive account %', p_account_code;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_instruments pi
                 WHERE pi.id = p_instrument_id AND pi.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Instrument not found in tenant';
  END IF;
  INSERT INTO public.instrument_account_map (instrument_id, account_id)
  VALUES (p_instrument_id, v_acct)
  ON CONFLICT (instrument_id) DO UPDATE SET account_id = EXCLUDED.account_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_instrument_account(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_instrument_account(uuid,text) TO authenticated;

INSERT INTO public.instrument_account_map (instrument_id, account_id)
SELECT pi.id, a.id
FROM public.payment_instruments pi
JOIN public.tenants t ON t.id = pi.tenant_id
JOIN public.chart_of_accounts a ON a.tenant_id = t.id
WHERE t.status = 'active'
  AND ((pi.itype = 'cash' AND a.code = '1000')
    OR (pi.itype = 'bank' AND a.code = '1010')
    OR (pi.itype = 'upi_qr' AND a.code = '1020')
    OR (pi.itype = 'wallet' AND a.code = '1030'))
ON CONFLICT (instrument_id) DO NOTHING;

-- --------------------------------------------------------------------------
-- 4. Document postings wired into G2/G3/G4/G5 RPCs (replacements: same
--    signatures, response shapes, grants; posting added atomically).
-- --------------------------------------------------------------------------

-- Adjustments: losses Dr 5200 / Cr 1200; gains Dr 1200 / Cr 5200 (same
-- adjustment head both ways — documented; finance review flagged).
-- Zero-quantity status moves post nothing.
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
  v_value  numeric;
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

  v_value := round(abs(p_qty_delta) * v_lot.unit_cost, 2);
  IF p_qty_delta < 0 THEN
    PERFORM public.post_journal(CURRENT_DATE, 'adjustment', v_adj_id,
      'Stock adjustment ' || v_adj_id::text,
      jsonb_build_array(
        jsonb_build_object('account_code', '5200', 'debit', v_value,
                           'description', 'Inventory adjustment'),
        jsonb_build_object('account_code', '1200', 'credit', v_value,
                           'description', 'Inventory adjustment')));
  ELSE
    PERFORM public.post_journal(CURRENT_DATE, 'adjustment', v_adj_id,
      'Stock adjustment ' || v_adj_id::text,
      jsonb_build_array(
        jsonb_build_object('account_code', '1200', 'debit', v_value,
                           'description', 'Inventory adjustment'),
        jsonb_build_object('account_code', '5200', 'credit', v_value,
                           'description', 'Inventory adjustment')));
  END IF;
  RETURN v_adj_id;
END;
$$;

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

-- Purchases post Dr 1200 / Cr 2000 at creation (body otherwise V1_004).
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

-- Sales post Dr 1300 / Cr 4000 (NET of discount — see file header) plus
-- FIFO COGS legs Dr 5000 / Cr 1200 per allocated lot.
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

-- cancel_invoice: stock restore + journal reversal (mirror of sale batch).
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
  v_eid    uuid;
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

  SELECT e.id INTO v_eid FROM public.journal_entries e
  WHERE e.tenant_id = v_tenant AND e.source_type = 'sale'
    AND e.source_id = p_invoice_id AND e.status = 'posted';
  IF FOUND THEN
    PERFORM public.reverse_journal_entry(v_eid, NULL);
  END IF;

  v_resp := jsonb_build_object('id', p_invoice_id, 'status', 'cancelled');
  PERFORM public.idempotency_commit('cancel_invoice', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;

-- edit_invoice: atomic cancel-and-reissue (inherits posting both ways).
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

-- recognize_claim: state transition + per-allocation asset legs to AR.
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
  v_alloc  record;
  v_legs   jsonb := '[]'::jsonb;
  v_acct   text;
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

  FOR v_alloc IN
    SELECT a.method, a.amount, a.instrument_id
    FROM public.collection_allocations a
    WHERE a.claim_id = p_claim_id
    ORDER BY a.created_at, a.id
  LOOP
    SELECT m.account_code INTO v_acct
    FROM (SELECT pi.itype FROM public.payment_instruments pi
          WHERE pi.id = v_alloc.instrument_id) i
    JOIN (VALUES ('cash','1000'),('bank','1010'),('upi_qr','1020'),
                 ('wallet','1030'),('card','1060'),
                 ('aeps_portal','1040'),('dmt_portal','1050')) AS m(itype, account_code)
      ON m.itype = i.itype;
    v_legs := v_legs || jsonb_build_array(jsonb_build_object(
      'account_code', coalesce(v_acct, '1000'),
      'debit', round(v_alloc.amount, 2),
      'description', 'Collection ' || v_alloc.method));
  END LOOP;
  IF jsonb_array_length(v_legs) = 0 THEN
    SELECT m.account_code INTO v_acct
    FROM (SELECT pi.itype FROM public.payment_instruments pi
          WHERE pi.id = v_claim.instrument_id) i
    JOIN (VALUES ('cash','1000'),('bank','1010'),('upi_qr','1020'),
                 ('wallet','1030'),('card','1060'),
                 ('aeps_portal','1040'),('dmt_portal','1050')) AS m(itype, account_code)
      ON m.itype = i.itype;
    v_legs := jsonb_build_array(jsonb_build_object(
      'account_code', coalesce(v_acct, '1000'),
      'debit', round(v_claim.amount, 2),
      'description', 'Collection ' || v_claim.method));
  END IF;
  v_legs := v_legs || jsonb_build_array(jsonb_build_object(
    'account_code', '1300', 'credit', round(v_claim.amount, 2),
    'description', 'Accounts receivable'));

  PERFORM public.post_journal(CURRENT_DATE, 'payment', p_claim_id,
    'Payment ' || p_claim_id::text, v_legs);

  v_resp := jsonb_build_object('id', p_claim_id, 'state', 'recognized');
  PERFORM public.idempotency_commit('recognize_claim', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;

-- record_service_txn: identical record path to V1_006 PLUS AEPS journal legs
-- (documented formula). Other service types record with no legs (their
-- funding rules are recorded blockers, never invented).
CREATE OR REPLACE FUNCTION public.record_service_txn(
  p_service_type text, p_transaction_date date, p_amount numeric,
  p_fee numeric DEFAULT 0, p_commission numeric DEFAULT 0,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_collect_method text DEFAULT NULL,
  p_collect_instrument_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_replay boolean; v_resp jsonb;
  v_number text;
  v_svc_id uuid;
  v_claim  uuid;
  d jsonb := coalesce(p_details, '{}'::jsonb);
  v_cash_out numeric;
  v_pool     numeric;
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
  IF p_service_type NOT IN ('aeps','dmt','upi','recharge','bbps') THEN
    RAISE EXCEPTION 'Unsupported service type';
  END IF;
  IF p_transaction_date IS NULL THEN
    RAISE EXCEPTION 'Transaction date required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  p_fee := coalesce(p_fee, 0);
  p_commission := coalesce(p_commission, 0);
  IF p_fee < 0 OR p_commission < 0 THEN
    RAISE EXCEPTION 'Fee/commission must be non-negative';
  END IF;

  SELECT * INTO v_replay, v_resp
  FROM public.idempotency_begin('record_service', p_idempotency_key);
  IF v_replay THEN RETURN v_resp; END IF;

  IF p_service_type = 'aeps' THEN
    IF nullif(btrim(d->>'aadhaar_last4'), '') IS NULL
       OR btrim(d->>'aadhaar_last4') !~ '^[0-9]{4}$' THEN
      RAISE EXCEPTION 'AEPS requires 4-digit aadhaar_last4';
    END IF;
    IF nullif(btrim(d->>'aeps_txn_type'), '') IS NULL
       OR btrim(d->>'aeps_txn_type') NOT IN
          ('cash_out','balance_enquiry','mini_statement') THEN
      RAISE EXCEPTION 'AEPS requires a valid aeps_txn_type';
    END IF;
    IF p_fee > p_amount THEN
      RAISE EXCEPTION 'AEPS fee cannot exceed amount';
    END IF;
  ELSIF p_service_type = 'dmt' THEN
    IF nullif(btrim(d->>'sender_name'), '') IS NULL
       OR nullif(btrim(d->>'beneficiary_name'), '') IS NULL
       OR nullif(btrim(d->>'beneficiary_account'), '') IS NULL THEN
      RAISE EXCEPTION 'DMT requires sender/beneficiary identity fields';
    END IF;
    IF nullif(btrim(d->>'transfer_method'), '') IS NOT NULL
       AND btrim(d->>'transfer_method') NOT IN ('bank_account','upi') THEN
      RAISE EXCEPTION 'DMT transfer_method must be bank_account or upi';
    END IF;
  ELSIF p_service_type = 'upi' THEN
    IF nullif(btrim(d->>'upi_id'), '') IS NULL THEN
      RAISE EXCEPTION 'UPI requires upi_id';
    END IF;
    IF nullif(btrim(d->>'merchant_qr_ref'), '') IS NULL THEN
      RAISE EXCEPTION 'UPI requires merchant_qr_ref';
    END IF;
  ELSIF p_service_type = 'recharge' THEN
    IF nullif(btrim(d->>'provider_ref'), '') IS NULL
       OR nullif(btrim(d->>'receiver_number'), '') IS NULL THEN
      RAISE EXCEPTION 'Recharge requires provider_ref and receiver_number';
    END IF;
  ELSIF p_service_type = 'bbps' THEN
    IF nullif(btrim(d->>'biller_ref'), '') IS NULL
       OR nullif(btrim(d->>'consumer_number'), '') IS NULL THEN
      RAISE EXCEPTION 'BBPS requires biller_ref and consumer_number';
    END IF;
    IF (d->>'bill_amount') IS NULL
       OR coalesce((d->>'bill_amount')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'BBPS requires non-negative bill_amount';
    END IF;
  END IF;

  IF (p_collect_method IS NULL) <> (p_collect_instrument_id IS NULL) THEN
    RAISE EXCEPTION 'Collection needs both method and instrument, or neither';
  END IF;
  IF p_collect_method IS NOT NULL
     AND p_collect_method NOT IN ('cash','upi','card','wallet','credit') THEN
    RAISE EXCEPTION 'Unsupported collection method';
  END IF;
  IF p_collect_instrument_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.payment_instruments pi
      WHERE pi.id = p_collect_instrument_id AND pi.tenant_id = v_tenant
        AND pi.is_active) THEN
    RAISE EXCEPTION 'Unknown or inactive collection instrument';
  END IF;

  v_number := 'SRV-' || lpad(public.next_canonical_number('service')::text, 6, '0');
  INSERT INTO public.service_transactions
    (tenant_id, service_type, client_uuid, idempotency_key,
     transaction_number, transaction_date, amount, fee, commission,
     aadhaar_last4, bank_ref, portal_ref, aeps_txn_type,
     sender_name, sender_mobile, beneficiary_name, beneficiary_mobile,
     beneficiary_bank, beneficiary_ifsc, beneficiary_account, transfer_method,
     upi_id, merchant_qr_ref, provider_ref, receiver_number, plan_ref,
     biller_ref, consumer_number, bill_amount, recorded_by_profile)
  VALUES (
    v_tenant, p_service_type, gen_random_uuid(), nullif(btrim(p_idempotency_key), ''),
    v_number, p_transaction_date, p_amount, p_fee, p_commission,
    nullif(btrim(d->>'aadhaar_last4'), ''), nullif(btrim(d->>'bank_ref'), ''),
    nullif(btrim(d->>'portal_ref'), ''), nullif(btrim(d->>'aeps_txn_type'), ''),
    nullif(btrim(d->>'sender_name'), ''), nullif(btrim(d->>'sender_mobile'), ''),
    nullif(btrim(d->>'beneficiary_name'), ''), nullif(btrim(d->>'beneficiary_mobile'), ''),
    nullif(btrim(d->>'beneficiary_bank'), ''), nullif(btrim(d->>'beneficiary_ifsc'), ''),
    nullif(btrim(d->>'beneficiary_account'), ''),
    nullif(btrim(d->>'transfer_method'), ''),
    nullif(btrim(d->>'upi_id'), ''), nullif(btrim(d->>'merchant_qr_ref'), ''),
    nullif(btrim(d->>'provider_ref'), ''), nullif(btrim(d->>'receiver_number'), ''),
    nullif(btrim(d->>'plan_ref'), ''),
    nullif(btrim(d->>'biller_ref'), ''), nullif(btrim(d->>'consumer_number'), ''),
    CASE WHEN d ? 'bill_amount' THEN (d->>'bill_amount')::numeric END,
    (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()))
  RETURNING id INTO v_svc_id;

  IF p_collect_method IS NOT NULL THEN
    INSERT INTO public.payment_claims
      (tenant_id, method, amount, instrument_id, recorded_by_profile,
       service_transaction_id)
    SELECT v_tenant, p_collect_method, p_amount, p_collect_instrument_id,
           p.id, v_svc_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
    RETURNING id INTO v_claim;
  END IF;

  -- AEPS journal legs (documented formula; finance re-verification flagged).
  -- cash_out = amount − fee; pool_credit = amount + commission.
  -- Zero legs are omitted (line CHECK forbids zero/zero).
  IF p_service_type = 'aeps' THEN
    v_cash_out := round(p_amount - p_fee, 2);
    v_pool := round(p_amount + p_commission, 2);
    PERFORM public.post_journal(p_transaction_date, 'service', v_svc_id,
      'AEPS ' || v_number,
      (SELECT jsonb_agg(x ORDER BY x->>'account_code') FROM (
        SELECT jsonb_build_object('account_code', '1040', 'debit', v_pool,
                 'description', 'AEPS float credit') AS x
        UNION ALL
        SELECT jsonb_build_object('account_code', '1000', 'credit', v_cash_out,
                 'description', 'AEPS cash payout')
        UNION ALL
        SELECT jsonb_build_object('account_code', '4020', 'credit',
                 round(p_fee, 2), 'description', 'AEPS fee')
        WHERE round(p_fee, 2) > 0
        UNION ALL
        SELECT jsonb_build_object('account_code', '4030', 'credit',
                 round(p_commission, 2), 'description', 'AEPS commission')
        WHERE round(p_commission, 2) > 0
      ) s));
  END IF;

  v_resp := jsonb_build_object('id', v_svc_id, 'transaction_number', v_number,
                               'claim_id', v_claim);
  PERFORM public.idempotency_commit('record_service', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;

-- reverse_service_txn: mirror record + reversal of posted service batches
-- (AEPS legs reverse; types without posted legs reverse records only).
CREATE OR REPLACE FUNCTION public.reverse_service_txn(
  p_service_id uuid, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_replay boolean; v_resp jsonb;
  v_old    record;
  v_number text;
  v_new_id uuid;
  v_eid    uuid;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  v_tenant := public.current_tenant();
  SELECT * INTO v_replay, v_resp
  FROM public.idempotency_begin('reverse_service', p_idempotency_key);
  IF v_replay THEN RETURN v_resp; END IF;

  SELECT * INTO v_old FROM public.service_transactions s
  WHERE s.id = p_service_id AND s.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service transaction not found in tenant';
  END IF;
  IF v_old.status <> 'recorded' THEN
    RAISE EXCEPTION 'Only recorded transactions can be reversed (status=%)',
      v_old.status;
  END IF;

  v_number := 'SRV-' || lpad(public.next_canonical_number('service')::text, 6, '0');
  INSERT INTO public.service_transactions
    (tenant_id, service_type, client_uuid, transaction_number,
     transaction_date, amount, fee, commission, status, reverses,
     aadhaar_last4, bank_ref, portal_ref, aeps_txn_type,
     sender_name, sender_mobile, beneficiary_name, beneficiary_mobile,
     beneficiary_bank, beneficiary_ifsc, beneficiary_account, transfer_method,
     upi_id, merchant_qr_ref, provider_ref, receiver_number, plan_ref,
     biller_ref, consumer_number, bill_amount, recorded_by_profile)
  VALUES (
    v_tenant, v_old.service_type, gen_random_uuid(), v_number,
    CURRENT_DATE, v_old.amount, v_old.fee, v_old.commission,
    'reversed', v_old.id,
    v_old.aadhaar_last4, v_old.bank_ref, v_old.portal_ref, v_old.aeps_txn_type,
    v_old.sender_name, v_old.sender_mobile, v_old.beneficiary_name,
    v_old.beneficiary_mobile, v_old.beneficiary_bank, v_old.beneficiary_ifsc,
    v_old.beneficiary_account, v_old.transfer_method,
    v_old.upi_id, v_old.merchant_qr_ref, v_old.provider_ref,
    v_old.receiver_number, v_old.plan_ref,
    v_old.biller_ref, v_old.consumer_number, v_old.bill_amount,
    (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()))
  RETURNING id INTO v_new_id;

  UPDATE public.service_transactions
  SET status = 'reversed', reversed_by = v_new_id
  WHERE id = p_service_id;

  FOR v_eid IN
    SELECT e.id FROM public.journal_entries e
    WHERE e.tenant_id = v_tenant AND e.source_type = 'service'
      AND e.source_id = p_service_id AND e.status = 'posted'
  LOOP
    PERFORM public.reverse_journal_entry(v_eid, NULL);
  END LOOP;

  v_resp := jsonb_build_object('id', v_new_id, 'reverses', p_service_id);
  PERFORM public.idempotency_commit('reverse_service', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;

-- --------------------------------------------------------------------------
-- 5. RLS: deny-default on new tables; RPC-only writes everywhere journals
-- --------------------------------------------------------------------------
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_account_map ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.journal_entries, public.journal_lines,
  public.instrument_account_map
  FROM PUBLIC, anon, authenticated;

-- Ledger reads: back-office only (financial statements are privileged).
GRANT SELECT ON public.journal_entries TO authenticated;
GRANT SELECT ON public.journal_lines TO authenticated;
GRANT SELECT ON public.instrument_account_map TO authenticated;
CREATE POLICY journals_backoffice_select ON public.journal_entries
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());
CREATE POLICY journal_lines_backoffice_select ON public.journal_lines
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());
CREATE POLICY instrument_map_backoffice_select ON public.instrument_account_map
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND instrument_id IN (SELECT pi.id FROM public.payment_instruments pi
                               WHERE pi.tenant_id = public.current_tenant()));

COMMIT;
