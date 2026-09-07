-- 20260907_14_fix_advance_idempotency_signature.sql
-- Corrects the advance idempotency wrapper argument contract.
-- Existing UI supplies customer, amount, date and note; the browser client
-- adds p_idempotency_key. Payment method remains an optional trailing argument
-- with the same cash default as the canonical function.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_advance(
  p_customer_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_note text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text,
  p_method text DEFAULT 'cash'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gate jsonb;
  v_result jsonb;
BEGIN
  IF nullif(btrim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  v_gate := public.idempotency_acquire(
    'record_advance',
    p_idempotency_key,
    jsonb_build_object(
      'p_customer_id', p_customer_id,
      'p_amount', p_amount,
      'p_entry_date', p_entry_date,
      'p_note', p_note,
      'p_method', p_method
    )
  );

  IF v_gate->>'status'='replay' THEN
    RETURN v_gate->'response_payload';
  END IF;

  v_result := public.record_advance(
    p_customer_id,
    p_amount,
    p_entry_date,
    p_note,
    p_method
  );

  PERFORM public.idempotency_commit(
    'record_advance',
    p_idempotency_key,
    'completed',
    NULL,
    v_result
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.return_advance(
  p_customer_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_note text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text,
  p_method text DEFAULT 'cash'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gate jsonb;
  v_result jsonb;
BEGIN
  IF nullif(btrim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  v_gate := public.idempotency_acquire(
    'return_advance',
    p_idempotency_key,
    jsonb_build_object(
      'p_customer_id', p_customer_id,
      'p_amount', p_amount,
      'p_entry_date', p_entry_date,
      'p_note', p_note,
      'p_method', p_method
    )
  );

  IF v_gate->>'status'='replay' THEN
    RETURN v_gate->'response_payload';
  END IF;

  v_result := public.return_advance(
    p_customer_id,
    p_amount,
    p_entry_date,
    p_note,
    p_method
  );

  PERFORM public.idempotency_commit(
    'return_advance',
    p_idempotency_key,
    'completed',
    NULL,
    v_result
  );

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_advance(uuid,numeric,date,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_advance(uuid,numeric,date,text,text,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.return_advance(uuid,numeric,date,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_advance(uuid,numeric,date,text,text,text) TO authenticated, service_role;

COMMIT;
