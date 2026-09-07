-- 20260907_11_fix_idempotency_service_role.sql
-- Allows trusted service_role callers to use the same request-idempotency
-- infrastructure without relying on auth.uid(), which is NULL for service_role.

BEGIN;

CREATE OR REPLACE FUNCTION public.idempotency_acquire(
  p_operation text,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
DECLARE
  v_actor uuid := CASE
    WHEN auth.uid() IS NOT NULL THEN auth.uid()
    WHEN auth.role() = 'service_role' THEN '00000000-0000-0000-0000-000000000000'::uuid
    ELSE NULL
  END;
  v_hash text := public.hash_idempotency_payload(p_payload);
  v_row public.idempotency_requests%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF nullif(btrim(p_operation),'') IS NULL THEN
    RAISE EXCEPTION 'IDEMPOTENCY_OPERATION_REQUIRED';
  END IF;

  IF nullif(btrim(p_idempotency_key),'') IS NULL THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('idemp:'||v_actor::text||':'||p_operation||':'||btrim(p_idempotency_key),0)
  );

  SELECT * INTO v_row
  FROM public.idempotency_requests
  WHERE actor_id=v_actor
    AND operation=p_operation
    AND idempotency_key=btrim(p_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF v_row.request_hash <> v_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: same key was used with a different payload';
    END IF;

    IF v_row.status='completed' THEN
      RETURN jsonb_build_object(
        'status','replay',
        'response_payload',coalesce(v_row.response_payload,'{}'::jsonb),
        'resource_id',v_row.resource_id
      );
    END IF;

    IF v_row.status='failed' THEN
      UPDATE public.idempotency_requests
      SET status='in_progress', response_payload=NULL, error_message=NULL, updated_at=now()
      WHERE id=v_row.id;
    END IF;

    RETURN jsonb_build_object('status','acquired','request_id',v_row.id);
  END IF;

  INSERT INTO public.idempotency_requests(
    actor_id,operation,idempotency_key,request_hash,status
  )
  VALUES(
    v_actor,p_operation,btrim(p_idempotency_key),v_hash,'in_progress'
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('status','acquired','request_id',v_row.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.idempotency_commit(
  p_operation text,
  p_idempotency_key text,
  p_status text,
  p_resource_id uuid,
  p_response jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := CASE
    WHEN auth.uid() IS NOT NULL THEN auth.uid()
    WHEN auth.role() = 'service_role' THEN '00000000-0000-0000-0000-000000000000'::uuid
    ELSE NULL
  END;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_status NOT IN ('completed','failed') THEN
    RAISE EXCEPTION 'IDEMPOTENCY_INVALID_STATUS';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('idemp:'||v_actor::text||':'||p_operation||':'||btrim(p_idempotency_key),0)
  );

  UPDATE public.idempotency_requests
  SET status=p_status,
      resource_id=p_resource_id,
      response_payload=p_response,
      error_message=NULL,
      updated_at=now()
  WHERE actor_id=v_actor
    AND operation=p_operation
    AND idempotency_key=btrim(p_idempotency_key)
    AND status='in_progress';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IDEMPOTENCY_REQUEST_NOT_FOUND_OR_ALREADY_FINALIZED';
  END IF;
END;
$function$;

COMMIT;
