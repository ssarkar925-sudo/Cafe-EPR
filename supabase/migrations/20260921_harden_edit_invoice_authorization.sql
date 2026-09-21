-- Harden invoice editing authorization.
--
-- The 19-argument implementation performs SECURITY DEFINER invoice mutations.
-- Keep it callable by trusted server-side roles only, and enforce the
-- back-office check at the authenticated idempotent entry points.
--
-- Apply through the controlled migration pipeline after staging validation.

BEGIN;

CREATE OR REPLACE FUNCTION public.edit_invoice(
  p_invoice_id uuid,
  p_customer_id uuid,
  p_invoice_date date,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_payments jsonb,
  p_items jsonb,
  p_reason text,
  p_idempotency_key text
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
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;

  v_gate := public.idempotency_acquire(
    'edit_invoice',
    p_idempotency_key,
    jsonb_build_object(
      'p_invoice_id', p_invoice_id,
      'p_customer_id', p_customer_id,
      'p_invoice_date', p_invoice_date,
      'p_subtotal', p_subtotal,
      'p_discount', p_discount,
      'p_total', p_total,
      'p_payments', p_payments,
      'p_items', p_items,
      'p_reason', p_reason
    )
  );

  IF v_gate->>'status' = 'replay' THEN
    RETURN v_gate->'response_payload';
  END IF;

  v_result := public.edit_invoice(
    p_invoice_id,
    p_customer_id,
    p_invoice_date,
    p_subtotal,
    p_discount,
    p_total,
    p_payments,
    p_items,
    p_reason
  );

  PERFORM public.idempotency_commit(
    'edit_invoice',
    p_idempotency_key,
    'completed',
    p_invoice_id,
    v_result
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.edit_invoice(
  p_invoice_id uuid,
  p_customer_id uuid,
  p_invoice_date date,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_payments jsonb,
  p_items jsonb,
  p_reason text,
  p_place_of_supply text,
  p_supply_type text,
  p_customer_gstin text,
  p_b2b_or_b2c text,
  p_total_taxable_value numeric,
  p_total_cgst numeric,
  p_total_sgst numeric,
  p_total_igst numeric,
  p_is_reverse_charge boolean,
  p_advance_used numeric,
  p_idempotency_key text
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
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;

  IF nullif(trim(coalesce(p_idempotency_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  v_gate := public.idempotency_acquire(
    'edit_invoice',
    p_idempotency_key,
    jsonb_build_object(
      'p_invoice_id', p_invoice_id,
      'p_customer_id', p_customer_id,
      'p_invoice_date', p_invoice_date,
      'p_subtotal', p_subtotal,
      'p_discount', p_discount,
      'p_total', p_total,
      'p_payments', p_payments,
      'p_items', p_items,
      'p_reason', p_reason,
      'p_place_of_supply', p_place_of_supply,
      'p_supply_type', p_supply_type,
      'p_customer_gstin', p_customer_gstin,
      'p_b2b_or_b2c', p_b2b_or_b2c,
      'p_total_taxable_value', p_total_taxable_value,
      'p_total_cgst', p_total_cgst,
      'p_total_sgst', p_total_sgst,
      'p_total_igst', p_total_igst,
      'p_is_reverse_charge', p_is_reverse_charge,
      'p_advance_used', p_advance_used
    )
  );

  IF v_gate->>'status' = 'replay' THEN
    RETURN v_gate->'response_payload';
  END IF;

  v_result := public.edit_invoice(
    p_invoice_id,
    p_customer_id,
    p_invoice_date,
    p_subtotal,
    p_discount,
    p_total,
    p_payments,
    p_items,
    p_reason,
    p_place_of_supply,
    p_supply_type,
    p_customer_gstin,
    p_b2b_or_b2c,
    p_total_taxable_value,
    p_total_cgst,
    p_total_sgst,
    p_total_igst,
    p_is_reverse_charge,
    p_advance_used
  );

  PERFORM public.idempotency_commit(
    'edit_invoice',
    p_idempotency_key,
    'completed',
    p_invoice_id,
    v_result
  );

  RETURN v_result;
END;
$function$;

-- The implementation has no idempotency parameter and performs the actual
-- SECURITY DEFINER mutation. It must not be directly callable by API roles.
REVOKE EXECUTE ON FUNCTION public.edit_invoice(
  uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text,
  text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric
) FROM anon, authenticated;

COMMIT;
