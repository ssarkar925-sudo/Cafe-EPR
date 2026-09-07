-- 20260907_16_fix_advance_wrapper_inner_call.sql
-- Resolves PostgreSQL overload ambiguity caused by the legacy five-argument
-- advance functions having defaults. The wrapper calls the canonical worker
-- using the distinct p_method named argument so PostgreSQL selects the legacy
-- worker unambiguously.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_advance(
  p_customer_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_note text,
  p_idempotency_key text,
  p_method text DEFAULT 'cash'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  IF nullif(btrim(p_idempotency_key),'') IS NULL THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  v_gate := public.idempotency_acquire(
    'record_advance',
    p_idempotency_key,
    jsonb_build_object(
      'p_customer_id',p_customer_id,
      'p_amount',p_amount,
      'p_entry_date',p_entry_date,
      'p_note',p_note,
      'p_method',p_method
    )
  );

  IF v_gate->>'status'='replay' THEN
    RETURN v_gate->'response_payload';
  END IF;

  v_result := public.record_advance(
    p_customer_id=>p_customer_id,
    p_amount=>p_amount,
    p_entry_date=>p_entry_date,
    p_note=>p_note,
    p_method=>p_method
  );

  PERFORM public.idempotency_commit(
    'record_advance',p_idempotency_key,'completed',NULL,v_result
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.return_advance(
  p_customer_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_note text,
  p_idempotency_key text,
  p_method text DEFAULT 'cash'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  IF nullif(btrim(p_idempotency_key),'') IS NULL THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  v_gate := public.idempotency_acquire(
    'return_advance',
    p_idempotency_key,
    jsonb_build_object(
      'p_customer_id',p_customer_id,
      'p_amount',p_amount,
      'p_entry_date',p_entry_date,
      'p_note',p_note,
      'p_method',p_method
    )
  );

  IF v_gate->>'status'='replay' THEN
    RETURN v_gate->'response_payload';
  END IF;

  v_result := public.return_advance(
    p_customer_id=>p_customer_id,
    p_amount=>p_amount,
    p_entry_date=>p_entry_date,
    p_note=>p_note,
    p_method=>p_method
  );

  PERFORM public.idempotency_commit(
    'return_advance',p_idempotency_key,'completed',NULL,v_result
  );

  RETURN v_result;
END;
$function$;

COMMIT;
