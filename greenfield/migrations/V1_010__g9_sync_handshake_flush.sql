-- ============================================================================
-- V1 BASELINE — G9: offline sync protocol surface (server side).
-- Documented scope ONLY (plan G9): device-local outbox stays client-side
-- (no server outbox table); server watermark on devices; sync_conflicts;
-- idempotency_keys (G3, reused); enrollment tokens + epoch rotation;
-- RPCs: handshake, flush, acknowledge, conflict disposition.
-- Protocol semantics (from approved sync spec, no invention):
--   ordered per-device log; watermark = last applied sequence; stop on
--   first failure; failed items become conflict rows (never silent drop);
--   seq <= watermark replays safely without re-execution (DUPLICATE);
--   stale device epoch rejects the whole flush; provisional numbers keep
--   UNSYNCED-not-final semantics (UX layer; stored verbatim, canonical
--   assigned at validation).
-- G0 completion inside: consume_enrollment_token gains optional
-- p_prior_device_id for epoch rotation (old signature dropped + recreated;
-- single-arg calls resolve identically; G0 gate unaffected).
-- No journals/posting changes. No live integrations. Single transaction.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. G0 completion: epoch-rotating enrollment (DROP + CREATE; documented).
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.consume_enrollment_token(text);

CREATE OR REPLACE FUNCTION public.consume_enrollment_token(
  p_token text, p_prior_device_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tok       public.enrollment_tokens%ROWTYPE;
  v_device_id uuid;
  v_epoch     integer := 1;
  v_caller    uuid;
  v_old       record;
BEGIN
  SELECT * INTO v_tok FROM public.enrollment_tokens t
  WHERE t.token_hash = encode(digest(nullif(p_token, ''), 'sha256'), 'hex')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid enrollment token';
  END IF;
  IF v_tok.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Enrollment token already consumed';
  END IF;
  IF v_tok.expires_at <= now() THEN
    RAISE EXCEPTION 'Enrollment token expired';
  END IF;
  IF public.current_tenant() IS NOT NULL
     AND v_tok.tenant_id <> public.current_tenant() THEN
    RAISE EXCEPTION 'Tenant mismatch';
  END IF;
  SELECT p.id INTO v_caller FROM public.profiles p
  WHERE p.user_id = auth.uid();

  -- Re-enrollment: retire the prior device, continue its epoch + 1.
  IF p_prior_device_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.devices d
    WHERE d.id = p_prior_device_id AND d.tenant_id = v_tok.tenant_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Prior device not found in tenant';
    END IF;
    IF NOT (v_old.owner_profile_id = v_tok.user_profile_id
            OR public.is_back_office()) THEN
      RAISE EXCEPTION 'Not authorized to re-enroll this device';
    END IF;
    UPDATE public.devices
    SET status = 'revoked', revoked_at = now()
    WHERE id = p_prior_device_id;
    v_epoch := v_old.device_epoch + 1;
  END IF;

  UPDATE public.enrollment_tokens
  SET consumed_at = now() WHERE id = v_tok.id;

  INSERT INTO public.devices
    (tenant_id, owner_profile_id, device_epoch)
  VALUES (v_tok.tenant_id, v_tok.user_profile_id, v_epoch)
  RETURNING id INTO v_device_id;
  RETURN v_device_id;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_enrollment_token(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_enrollment_token(text,uuid) TO authenticated;

-- --------------------------------------------------------------------------
-- 2. sync_conflicts (append-then-disposition; never silently dropped)
-- --------------------------------------------------------------------------
CREATE TABLE public.sync_conflicts (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants (id)
                     ON DELETE RESTRICT,
  device_id        uuid        REFERENCES public.devices (id)
                     ON DELETE RESTRICT,
  client_sequence  bigint,
  doc_type         text        NOT NULL,
  client_uuid      uuid,
  idempotency_key  text,
  reason_code      text        NOT NULL
                   CHECK (reason_code IN ('VALIDATION','INSUFFICIENT_STOCK',
                     'LIMIT_EXCEEDED','TOTAL_MISMATCH','UNKNOWN_INSTRUMENT',
                     'EXPIRED_LOT','DUPLICATE','GAP','AUTH_EXPIRED',
                     'STALE_EPOCH','FORBIDDEN','NOT_FOUND','ERROR')),
  detail           text,
  server_ref       text,
  disposition      text        NOT NULL DEFAULT 'pending'
                   CHECK (disposition IN ('pending','resolved','discarded')),
  decided_by_profile uuid      REFERENCES public.profiles (id)
                     ON DELETE RESTRICT,
  decided_at       timestamptz,
  decision_note    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sync_conflicts_tenant_device_idx
  ON public.sync_conflicts (tenant_id, device_id, disposition, created_at);
CREATE INDEX sync_conflicts_tenant_key_idx
  ON public.sync_conflicts (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE TRIGGER trg_sync_conflicts_updated_at
  BEFORE UPDATE ON public.sync_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3. Handshake: device validity + epoch + watermark + server time
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_handshake(p_device_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_dev    record;
  v_mine   boolean;
BEGIN
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  SELECT * INTO v_dev FROM public.devices d
  WHERE d.id = p_device_id AND d.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device not found in tenant';
  END IF;
  IF v_dev.status <> 'active' THEN
    RAISE EXCEPTION 'Device is not active (status=%)', v_dev.status;
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.user_id = auth.uid() AND p.id = v_dev.owner_profile_id)
         OR public.is_back_office() INTO v_mine;
  IF NOT v_mine THEN
    RAISE EXCEPTION 'Not authorized for this device';
  END IF;
  RETURN jsonb_build_object(
    'device_id', v_dev.id,
    'device_epoch', v_dev.device_epoch,
    'server_watermark', v_dev.last_watermark,
    'server_time', now());
END;
$$;
REVOKE ALL ON FUNCTION public.sync_handshake(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_handshake(uuid) TO authenticated;

-- --------------------------------------------------------------------------
-- 4. Flush: ordered application with watermark advance.
--    p_items: [{seq, device_epoch, client_uuid, idempotency_key, doc_type,
--               payload}] doc_type in (sale, purchase, claim, service).
--    Rules: epoch mismatch on any item rejects the whole flush (no writes);
--    seq <= watermark -> DUPLICATE conflict, no execution, continue;
--    seq == watermark+1 -> execute via the document RPC; on failure record
--    the conflict and STOP (watermark stays at last success); seq gaps ->
--    GAP conflict and STOP. Failed items never vanish: conflict rows hold
--    reason + server snapshot refs for the exception queue.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_flush(
  p_device_id uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant  uuid;
  v_dev     record;
  v_mine    boolean;
  v_mark    bigint;
  v_item    jsonb;
  v_seq     bigint;
  v_ep      integer;
  v_dtype   text;
  v_cuuid   uuid;
  v_ikey    text;
  v_pay     jsonb;
  v_result  jsonb;
  v_applied integer := 0;
  v_out     jsonb := '[]'::jsonb;
BEGIN
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  SELECT * INTO v_dev FROM public.devices d
  WHERE d.id = p_device_id AND d.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device not found in tenant';
  END IF;
  IF v_dev.status <> 'active' THEN
    RAISE EXCEPTION 'Device is not active (status=%)', v_dev.status;
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.user_id = auth.uid() AND p.id = v_dev.owner_profile_id)
         OR public.is_back_office() INTO v_mine;
  IF NOT v_mine THEN
    RAISE EXCEPTION 'Not authorized for this device';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Flush requires at least one item';
  END IF;
  v_mark := v_dev.last_watermark;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_items)
    ORDER BY (value->>'seq')::bigint
  LOOP
    v_seq   := (v_item->>'seq')::bigint;
    v_ep    := (v_item->>'device_epoch')::integer;
    v_dtype := btrim(v_item->>'doc_type');
    v_cuuid := nullif(v_item->>'client_uuid','')::uuid;
    v_ikey  := nullif(btrim(v_item->>'idempotency_key'), '');
    v_pay   := coalesce(v_item->'payload', '{}'::jsonb);
    IF v_seq IS NULL OR v_ep IS NULL THEN
      RAISE EXCEPTION 'Flush item requires seq and device_epoch';
    END IF;

    -- Stale epoch rejects the whole flush before any write in THIS call.
    -- (Earlier items in this same call already applied: atomicity is per
    -- document, and applied items keep their effects + watermark. The
    -- caller must reconcile; nothing is silently dropped.)
    IF v_ep <> v_dev.device_epoch THEN
      INSERT INTO public.sync_conflicts
        (tenant_id, device_id, client_sequence, doc_type, client_uuid,
         idempotency_key, reason_code, detail)
      VALUES (v_tenant, p_device_id, v_seq, coalesce(v_dtype, 'unknown'),
              v_cuuid, v_ikey, 'STALE_EPOCH',
              'Item epoch does not match device epoch');
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'seq', v_seq, 'outcome', 'stale_epoch', 'applied', false));
      UPDATE public.devices SET last_watermark = v_mark
      WHERE id = p_device_id;
      RETURN jsonb_build_object('applied', v_applied, 'watermark', v_mark,
                                'results', v_out);
    END IF;

    IF v_seq <= v_mark THEN
      INSERT INTO public.sync_conflicts
        (tenant_id, device_id, client_sequence, doc_type, client_uuid,
         idempotency_key, reason_code, detail)
      VALUES (v_tenant, p_device_id, v_seq, coalesce(v_dtype, 'unknown'),
              v_cuuid, v_ikey, 'DUPLICATE',
              'Sequence already applied; skipped without re-execution');
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'seq', v_seq, 'outcome', 'duplicate', 'applied', false));
      CONTINUE;
    END IF;

    IF v_seq <> v_mark + 1 THEN
      INSERT INTO public.sync_conflicts
        (tenant_id, device_id, client_sequence, doc_type, client_uuid,
         idempotency_key, reason_code, detail)
      VALUES (v_tenant, p_device_id, v_seq, coalesce(v_dtype, 'unknown'),
              v_cuuid, v_ikey, 'GAP',
              'Expected sequence ' || (v_mark + 1)::text);
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'seq', v_seq, 'outcome', 'gap', 'applied', false));
      UPDATE public.devices SET last_watermark = v_mark
      WHERE id = p_device_id;
      RETURN jsonb_build_object('applied', v_applied, 'watermark', v_mark,
                                'results', v_out);
    END IF;

    BEGIN
      IF v_dtype = 'sale' THEN
        SELECT public.create_sale(
          nullif(v_pay->>'customer_id','')::uuid,
          nullif(v_pay->>'invoice_date','')::date,
          coalesce(v_pay->'lines','[]'::jsonb),
          coalesce((v_pay->>'discount')::numeric, 0),
          nullif(v_pay->>'approver_profile_id','')::uuid,
          nullif(btrim(v_pay->>'provisional_number'), ''),
          v_ikey) INTO v_result;
      ELSIF v_dtype = 'purchase' THEN
        SELECT public.create_purchase(
          nullif(v_pay->>'supplier_id','')::uuid,
          nullif(v_pay->>'purchase_date','')::date,
          coalesce(v_pay->'lines','[]'::jsonb),
          v_ikey) INTO v_result;
      ELSIF v_dtype = 'claim' THEN
        SELECT public.record_claim(
          nullif(v_pay->>'customer_id','')::uuid,
          nullif(v_pay->>'invoice_id','')::uuid,
          btrim(v_pay->>'method'),
          (v_pay->>'amount')::numeric,
          nullif(v_pay->>'instrument_id','')::uuid,
          v_ikey) INTO v_result;
      ELSIF v_dtype = 'service' THEN
        SELECT public.record_service_txn(
          btrim(v_pay->>'service_type'),
          nullif(v_pay->>'transaction_date','')::date,
          (v_pay->>'amount')::numeric,
          coalesce((v_pay->>'fee')::numeric, 0),
          coalesce((v_pay->>'commission')::numeric, 0),
          coalesce(v_pay->'details','{}'::jsonb),
          nullif(btrim(v_pay->>'collect_method'), ''),
          nullif(v_pay->>'collect_instrument_id','')::uuid,
          v_ikey) INTO v_result;
      ELSE
        RAISE EXCEPTION 'Unknown doc_type: %', coalesce(v_dtype, '(null)');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.sync_conflicts
        (tenant_id, device_id, client_sequence, doc_type, client_uuid,
         idempotency_key, reason_code, detail,
         server_ref)
      VALUES (v_tenant, p_device_id, v_seq, coalesce(v_dtype, 'unknown'),
              v_cuuid, v_ikey,
              CASE WHEN SQLERRM ILIKE '%insufficient%' OR SQLERRM ILIKE '%stock%'
                        OR SQLERRM ILIKE '%limit%' THEN 'INSUFFICIENT_STOCK'
                   WHEN SQLERRM ILIKE '%expir%' THEN 'EXPIRED_LOT'
                   WHEN SQLERRM ILIKE '%approv%' OR SQLERRM ILIKE '%back-office%'
                        OR SQLERRM ILIKE '%authorized%' THEN 'FORBIDDEN'
                   WHEN SQLERRM ILIKE '%mismatch%' OR SQLERRM ILIKE '%total%' THEN 'TOTAL_MISMATCH'
                   ELSE 'ERROR' END,
              left(SQLERRM, 500),
              'watermark=' || v_mark::text);
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'seq', v_seq, 'outcome', 'failed', 'applied', false,
        'error', left(SQLERRM, 200)));
      UPDATE public.devices SET last_watermark = v_mark
      WHERE id = p_device_id;
      RETURN jsonb_build_object('applied', v_applied, 'watermark', v_mark,
                                'results', v_out);
    END;

    v_mark := v_seq;
    v_applied := v_applied + 1;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'seq', v_seq, 'outcome', 'applied', 'applied', true,
      'result', v_result));
  END LOOP;

  UPDATE public.devices SET last_watermark = v_mark
  WHERE id = p_device_id;
  RETURN jsonb_build_object('applied', v_applied, 'watermark', v_mark,
                            'results', v_out);
END;
$$;
REVOKE ALL ON FUNCTION public.sync_flush(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_flush(uuid,jsonb) TO authenticated;

-- --------------------------------------------------------------------------
-- 5. Acknowledge: watermark + pending conflicts for client catch-up
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_acknowledge(p_device_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_dev    record;
  v_mine   boolean;
BEGIN
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  SELECT * INTO v_dev FROM public.devices d
  WHERE d.id = p_device_id AND d.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device not found in tenant';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.user_id = auth.uid() AND p.id = v_dev.owner_profile_id)
         OR public.is_back_office() INTO v_mine;
  IF NOT v_mine THEN
    RAISE EXCEPTION 'Not authorized for this device';
  END IF;
  RETURN jsonb_build_object(
    'device_epoch', v_dev.device_epoch,
    'watermark', v_dev.last_watermark,
    'server_time', now(),
    'pending_conflicts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'seq', c.client_sequence, 'doc_type', c.doc_type,
        'reason', c.reason_code, 'detail', c.detail)), '[]'::jsonb)
      FROM public.sync_conflicts c
      WHERE c.device_id = p_device_id AND c.disposition = 'pending'));
END;
$$;
REVOKE ALL ON FUNCTION public.sync_acknowledge(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_acknowledge(uuid) TO authenticated;

-- --------------------------------------------------------------------------
-- 6. Conflict disposition (back-office): resolve or discard with actor+note
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_conflict(
  p_conflict_id uuid, p_disposition text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_actor  uuid;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  v_tenant := public.current_tenant();
  SELECT p.id INTO v_actor FROM public.profiles p
  WHERE p.user_id = auth.uid();
  UPDATE public.sync_conflicts
  SET disposition = p_disposition,
      decided_by_profile = v_actor,
      decided_at = now(),
      decision_note = nullif(btrim(p_note), '')
  WHERE id = p_conflict_id AND tenant_id = v_tenant
    AND disposition = 'pending'
    AND p_disposition IN ('resolved','discarded')
  RETURNING id INTO p_conflict_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending conflict not found in tenant';
  END IF;
  RETURN jsonb_build_object('id', p_conflict_id, 'disposition', p_disposition);
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_conflict(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_conflict(uuid,text,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 7. RLS: deny-default; owner-device + back-office reads; writes via RPCs
-- --------------------------------------------------------------------------
ALTER TABLE public.sync_conflicts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.sync_conflicts
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.sync_conflicts TO authenticated;
CREATE POLICY conflicts_scope_select ON public.sync_conflicts
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant()
         AND (device_id IN (SELECT d.id FROM public.devices d
                            JOIN public.profiles p ON p.id = d.owner_profile_id
                            WHERE p.user_id = auth.uid())
              OR public.is_back_office()));

COMMIT;
