-- Dedicated customer due-payment RPC with a unique signature.
-- This avoids PostgREST overload/schema-cache ambiguity around record_customer_multi_payment.

CREATE OR REPLACE FUNCTION public.record_customer_due_payment(
  p_customer_id uuid,
  p_entry_date date,
  p_amount numeric,
  p_method text DEFAULT 'cash',
  p_reference text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_reference text := NULLIF(btrim(p_reference), '');
  v_allocations jsonb;
BEGIN
  IF auth.uid() IS NULL AND auth.role() <> 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.role() <> 'service_role' AND current_user <> 'postgres' AND NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required';
  END IF;

  IF p_amount IS NULL OR round(p_amount, 2) <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  IF lower(coalesce(p_method, 'cash')) NOT IN ('cash','upi','bank','wallet','debit_card','credit_card','card') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  v_allocations := jsonb_build_array(
    jsonb_build_object(
      'method', lower(coalesce(p_method, 'cash')),
      'amount', round(p_amount, 2)
    )
  );

  IF v_key IS NOT NULL THEN
    RETURN public.record_customer_multi_payment(
      p_customer_id,
      coalesce(p_entry_date, current_date),
      v_allocations,
      v_reference,
      v_key
    );
  END IF;

  RETURN public.record_customer_multi_payment(
    p_customer_id,
    coalesce(p_entry_date, current_date),
    v_allocations,
    v_reference
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_customer_due_payment(uuid, date, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_customer_due_payment(uuid, date, numeric, text, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
