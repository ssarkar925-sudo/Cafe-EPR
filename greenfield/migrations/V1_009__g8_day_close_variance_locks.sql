-- ============================================================================
-- V1 BASELINE — G8: day-close records, ₹1 variance workflow, period locks.
-- Depends on: G0 (roles/tenant), G1 (instruments), G6 (posting engine,
--             instrument map), G7 (append_audit).
-- Variance posts against 1400 Business Clearing (clearing holds unexplained
-- differences for later resolution; no dedicated over/short head exists —
-- finance review flagged, same class as G6 net-revenue interpretation).
-- post_journal gains the locked-period check (G6 dependency completion:
-- entries dated into a locked period are rejected; corrections post with
-- current dates via reversal paths, which remain valid).
-- Offline watermark gating is DEFERRED to G9 (no watermark producer exists
-- pre-sync); closes operate on server state only — documented, not silently
-- resolved. No reopen RPC exists by design (linked corrections only).
-- Single transaction, fail-closed.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------------
CREATE TABLE public.day_closes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants (id)
                     ON DELETE RESTRICT,
  business_date    date        NOT NULL,
  status           text        NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','variance_pending','locked')),
  opened_by_profile uuid       REFERENCES public.profiles (id)
                     ON DELETE RESTRICT,
  closed_by_profile uuid       REFERENCES public.profiles (id)
                     ON DELETE RESTRICT,
  approved_by_profile uuid     REFERENCES public.profiles (id)
                     ON DELETE RESTRICT,
  opened_at        timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz,
  variance_journal_id uuid     REFERENCES public.journal_entries (id)
                     ON DELETE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_date)
);
CREATE TRIGGER trg_day_closes_updated_at
  BEFORE UPDATE ON public.day_closes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.day_close_lines (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES public.tenants (id)
                   ON DELETE RESTRICT,
  day_close_id   uuid        NOT NULL REFERENCES public.day_closes (id)
                   ON DELETE RESTRICT,
  instrument_id  uuid        NOT NULL REFERENCES public.payment_instruments (id)
                   ON DELETE RESTRICT,
  expected       numeric(18,2) NOT NULL,
  counted        numeric(18,2),
  variance       numeric(18,2),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day_close_id, instrument_id)
);
CREATE TRIGGER trg_day_close_lines_updated_at
  BEFORE UPDATE ON public.day_close_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.period_locks (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants (id)
                     ON DELETE RESTRICT,
  locked_date      date        NOT NULL,
  day_close_id     uuid        REFERENCES public.day_closes (id)
                     ON DELETE RESTRICT,
  locked_by_profile uuid       REFERENCES public.profiles (id)
                     ON DELETE RESTRICT,
  reason           text        NOT NULL,
  locked_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, locked_date)
);

-- Day-close lifecycle guard: only forward transitions; locked rows frozen.
CREATE OR REPLACE FUNCTION public.trg_day_close_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'locked' THEN
    RAISE EXCEPTION 'Locked day-closes are immutable; use linked corrections';
  END IF;
  IF NOT ((OLD.status = 'open' AND NEW.status IN ('open','variance_pending','locked'))
          OR (OLD.status = 'variance_pending' AND NEW.status = 'locked')) THEN
    RAISE EXCEPTION 'Illegal day-close transition % -> %', OLD.status, NEW.status;
  END IF;
  IF OLD.status <> 'open' AND
     (OLD.business_date, OLD.tenant_id) IS DISTINCT FROM
     (NEW.business_date, NEW.tenant_id) THEN
    RAISE EXCEPTION 'Day-close identity is immutable once progressed';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_day_close_lifecycle() FROM PUBLIC;

CREATE TRIGGER trg_day_closes_lifecycle
  BEFORE UPDATE ON public.day_closes
  FOR EACH ROW EXECUTE FUNCTION public.trg_day_close_lifecycle();

-- --------------------------------------------------------------------------
-- 2. Expected-balance helper (internal): instrument opening baseline plus
--    journal net on its mapped account. Unmapped instruments read baseline.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expected_instrument_balance(
  p_instrument_id uuid)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_base   numeric;
  v_acct   uuid;
  v_net    numeric;
BEGIN
  SELECT pi.tenant_id, pi.current_balance INTO v_tenant, v_base
  FROM public.payment_instruments pi WHERE pi.id = p_instrument_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instrument not found';
  END IF;
  SELECT m.account_id INTO v_acct
  FROM public.instrument_account_map m WHERE m.instrument_id = p_instrument_id;
  IF v_acct IS NULL THEN
    RETURN round(v_base, 2);
  END IF;
  SELECT coalesce(sum(
           CASE WHEN l.account_id = v_acct THEN l.debit - l.credit ELSE 0 END), 0)
  INTO v_net
  FROM public.journal_lines l
  JOIN public.journal_entries e ON e.id = l.journal_entry_id
  WHERE e.tenant_id = v_tenant AND e.status = 'posted';
  RETURN round(v_base + v_net, 2);
END;
$$;
REVOKE ALL ON FUNCTION public.expected_instrument_balance(uuid) FROM PUBLIC;

-- --------------------------------------------------------------------------
-- 3. RPCs: open (snapshot) / record counts / close / approve
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_day_close(p_business_date date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_actor  uuid;
  v_close  uuid;
  v_inst   record;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  IF p_business_date IS NULL THEN
    RAISE EXCEPTION 'Business date required';
  END IF;
  SELECT p.id INTO v_actor FROM public.profiles p
  WHERE p.user_id = auth.uid();
  INSERT INTO public.day_closes (tenant_id, business_date, opened_by_profile)
  VALUES (v_tenant, p_business_date, v_actor)
  RETURNING id INTO v_close;
  FOR v_inst IN
    SELECT pi.id FROM public.payment_instruments pi
    WHERE pi.tenant_id = v_tenant AND pi.is_active
    ORDER BY pi.name, pi.id
  LOOP
    INSERT INTO public.day_close_lines
      (tenant_id, day_close_id, instrument_id, expected)
    VALUES (v_tenant, v_close, v_inst.id,
            public.expected_instrument_balance(v_inst.id));
  END LOOP;
  RETURN v_close;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Day-close already exists for this date';
END;
$$;
REVOKE ALL ON FUNCTION public.open_day_close(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_day_close(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_day_counts(
  p_close_id uuid, p_counts jsonb, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_replay boolean; v_resp jsonb;
  v_close  record;
  v_item   jsonb;
  v_inst   uuid;
  v_counted numeric;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  v_tenant := public.current_tenant();
  SELECT * INTO v_replay, v_resp
  FROM public.idempotency_begin('record_day_counts', p_idempotency_key);
  IF v_replay THEN RETURN v_resp; END IF;

  SELECT * INTO v_close FROM public.day_closes c
  WHERE c.id = p_close_id AND c.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Day-close not found in tenant';
  END IF;
  IF v_close.status = 'locked' THEN
    RAISE EXCEPTION 'Day-close is locked';
  END IF;
  IF p_counts IS NULL OR jsonb_typeof(p_counts) <> 'array'
     OR jsonb_array_length(p_counts) = 0 THEN
    RAISE EXCEPTION 'Count lines required';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_counts) LOOP
    v_inst := nullif(v_item->>'instrument_id','')::uuid;
    IF v_inst IS NULL OR NOT EXISTS
       (SELECT 1 FROM public.day_close_lines l
        WHERE l.day_close_id = p_close_id AND l.instrument_id = v_inst) THEN
      RAISE EXCEPTION 'Count references an instrument outside this close';
    END IF;
    v_counted := (v_item->>'counted')::numeric;
    IF v_counted IS NULL OR v_counted < 0 THEN
      RAISE EXCEPTION 'Counted amount must be non-negative';
    END IF;
    UPDATE public.day_close_lines
    SET counted = round(v_counted, 2),
        variance = round(v_counted - expected, 2)
    WHERE day_close_id = p_close_id AND instrument_id = v_inst;
  END LOOP;

  v_resp := jsonb_build_object('id', p_close_id, 'state', 'counted');
  PERFORM public.idempotency_commit('record_day_counts', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;
REVOKE ALL ON FUNCTION public.record_day_counts(uuid,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_day_counts(uuid,jsonb,text) TO authenticated;

-- Variance journal builder (internal): one leg pair per nonzero line
-- variance (over: Dr instrument asset / Cr 1400 clearing; short: mirror).
-- Unmapped instruments raise instead of posting to a guessed account.
CREATE OR REPLACE FUNCTION public.post_variance_journal(p_close_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_date   date;
  v_row    record;
  v_legs   jsonb := '[]'::jsonb;
  v_acct   uuid;
  v_jid    uuid;
BEGIN
  SELECT c.tenant_id, c.business_date INTO v_tenant, v_date
  FROM public.day_closes c WHERE c.id = p_close_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Day-close not found';
  END IF;
  FOR v_row IN
    SELECT l.variance, m.account_id
    FROM public.day_close_lines l
    JOIN public.instrument_account_map m ON m.instrument_id = l.instrument_id
    WHERE l.day_close_id = p_close_id AND l.variance <> 0
    ORDER BY l.created_at, l.instrument_id
  LOOP
    IF v_row.variance > 0 THEN
      v_legs := v_legs || jsonb_build_array(
        jsonb_build_object('account_code',
          (SELECT code FROM public.chart_of_accounts WHERE id = v_row.account_id),
          'debit', round(v_row.variance, 2),
          'description', 'Cash over'),
        jsonb_build_object('account_code', '1400',
          'credit', round(v_row.variance, 2),
          'description', 'Cash over clearing'));
    ELSE
      v_legs := v_legs || jsonb_build_array(
        jsonb_build_object('account_code', '1400',
          'debit', round(-v_row.variance, 2),
          'description', 'Cash short clearing'),
        jsonb_build_object('account_code',
          (SELECT code FROM public.chart_of_accounts WHERE id = v_row.account_id),
          'credit', round(-v_row.variance, 2),
          'description', 'Cash short'));
    END IF;
  END LOOP;
  IF jsonb_array_length(v_legs) = 0 THEN
    RETURN NULL;
  END IF;
  -- Every variance line needs a mapped account; unmapped instruments fail
  -- loudly here (the JOIN above silently drops them, so verify coverage).
  IF EXISTS (SELECT 1 FROM public.day_close_lines l
             WHERE l.day_close_id = p_close_id AND l.variance <> 0
               AND NOT EXISTS (SELECT 1 FROM public.instrument_account_map m
                               WHERE m.instrument_id = l.instrument_id)) THEN
    RAISE EXCEPTION 'Instrument account mapping missing for variance posting';
  END IF;
  SELECT public.post_journal(v_date, 'variance', p_close_id,
           'Day-close variance ' || v_date::text, v_legs)
  INTO v_jid;
  RETURN v_jid;
END;
$$;
REVOKE ALL ON FUNCTION public.post_variance_journal(uuid) FROM PUBLIC;

-- Close: within tolerance -> variance journal + lock; over-tolerance ->
-- variance_pending for admin approval. Replays safely on the same key.
CREATE OR REPLACE FUNCTION public.close_day_close(
  p_close_id uuid, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_replay boolean; v_resp jsonb;
  v_close  record;
  v_actor  uuid;
  v_total  numeric;
  v_jid    uuid;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  v_tenant := public.current_tenant();
  SELECT * INTO v_replay, v_resp
  FROM public.idempotency_begin('close_day_close', p_idempotency_key);
  IF v_replay THEN RETURN v_resp; END IF;

  SELECT * INTO v_close FROM public.day_closes c
  WHERE c.id = p_close_id AND c.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Day-close not found in tenant';
  END IF;
  IF v_close.status = 'locked' THEN
    RAISE EXCEPTION 'Day-close already locked';
  END IF;
  IF EXISTS (SELECT 1 FROM public.day_close_lines l
             WHERE l.day_close_id = p_close_id AND l.counted IS NULL) THEN
    RAISE EXCEPTION 'All instruments must be counted before close';
  END IF;
  SELECT p.id INTO v_actor FROM public.profiles p
  WHERE p.user_id = auth.uid();
  SELECT round(coalesce(sum(variance), 0), 2) INTO v_total
  FROM public.day_close_lines WHERE day_close_id = p_close_id;

  IF abs(v_total) <= 1 THEN
    v_jid := public.post_variance_journal(p_close_id);
    UPDATE public.day_closes
    SET status = 'locked', closed_by_profile = v_actor,
        closed_at = now(), variance_journal_id = v_jid
    WHERE id = p_close_id;
    INSERT INTO public.period_locks
      (tenant_id, locked_date, day_close_id, locked_by_profile, reason)
    VALUES (v_tenant, v_close.business_date, p_close_id, v_actor,
            'day-close locked');
    PERFORM public.append_audit(
      'day_close_locked', 'day_closes', p_close_id::text,
      'Day-close locked for ' || v_close.business_date::text,
      jsonb_build_object('business_date', v_close.business_date,
                         'variance_total', v_total,
                         'journal_id', v_jid),
      NULL);
    v_resp := jsonb_build_object('id', p_close_id, 'status', 'locked',
                                 'variance', v_total);
  ELSE
    UPDATE public.day_closes
    SET status = 'variance_pending', closed_by_profile = v_actor,
        closed_at = now()
    WHERE id = p_close_id;
    v_resp := jsonb_build_object('id', p_close_id,
                                 'status', 'variance_pending',
                                 'variance', v_total);
  END IF;
  PERFORM public.idempotency_commit('close_day_close', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;
REVOKE ALL ON FUNCTION public.close_day_close(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_day_close(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_day_close(
  p_close_id uuid, p_reason text, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_replay boolean; v_resp jsonb;
  v_close  record;
  v_actor  uuid;
  v_total  numeric;
  v_jid    uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;
  v_tenant := public.current_tenant();
  SELECT * INTO v_replay, v_resp
  FROM public.idempotency_begin('approve_day_close', p_idempotency_key);
  IF v_replay THEN RETURN v_resp; END IF;

  SELECT * INTO v_close FROM public.day_closes c
  WHERE c.id = p_close_id AND c.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Day-close not found in tenant';
  END IF;
  IF v_close.status <> 'variance_pending' THEN
    RAISE EXCEPTION 'Only variance-pending closes need approval (status=%)',
      v_close.status;
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Approval reason required';
  END IF;
  SELECT p.id INTO v_actor FROM public.profiles p
  WHERE p.user_id = auth.uid();
  SELECT round(coalesce(sum(variance), 0), 2) INTO v_total
  FROM public.day_close_lines WHERE day_close_id = p_close_id;

  v_jid := public.post_variance_journal(p_close_id);

  UPDATE public.day_closes
  SET status = 'locked', approved_by_profile = v_actor,
      variance_journal_id = v_jid
  WHERE id = p_close_id;
  INSERT INTO public.period_locks
    (tenant_id, locked_date, day_close_id, locked_by_profile, reason)
  VALUES (v_tenant, v_close.business_date, p_close_id, v_actor,
          btrim(p_reason));
  PERFORM public.append_audit(
    'day_close_approved', 'day_closes', p_close_id::text,
    'Day-close approved for ' || v_close.business_date::text,
    jsonb_build_object('business_date', v_close.business_date,
                       'variance_total', v_total,
                       'journal_id', v_jid,
                       'reason', btrim(p_reason)),
    NULL);
  v_resp := jsonb_build_object('id', p_close_id, 'status', 'locked',
                               'variance', v_total);
  PERFORM public.idempotency_commit('approve_day_close', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_day_close(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_day_close(uuid,text,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 4. post_journal replacement: identical engine PLUS locked-period check
--    (G6 dependency completion). Corrections post with current dates via
--    reversal paths, which never fall inside locked periods.
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
  IF EXISTS (SELECT 1 FROM public.period_locks pl
             WHERE pl.tenant_id = v_tenant
               AND pl.locked_date = coalesce(p_entry_date, CURRENT_DATE)) THEN
    RAISE EXCEPTION 'Posting date falls in a locked period';
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

-- --------------------------------------------------------------------------
-- 5. RLS: deny-default; back-office reads; all writes via RPCs
-- --------------------------------------------------------------------------
ALTER TABLE public.day_closes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_close_lines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_locks        ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.day_closes, public.day_close_lines,
  public.period_locks
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.day_closes TO authenticated;
GRANT SELECT ON public.day_close_lines TO authenticated;
GRANT SELECT ON public.period_locks TO authenticated;
CREATE POLICY day_close_backoffice_select ON public.day_closes
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());
CREATE POLICY day_close_lines_backoffice_select ON public.day_close_lines
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());
CREATE POLICY period_locks_backoffice_select ON public.period_locks
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());

COMMIT;
