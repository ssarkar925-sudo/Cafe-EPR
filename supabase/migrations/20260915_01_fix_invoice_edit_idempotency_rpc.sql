-- Fix the invoice editor/PostgREST contract.
--
-- The canonical atomic editor has 19 business parameters. A newer browser build
-- submits those same parameters plus p_idempotency_key (20 parameters total).
-- Keep the canonical 19-parameter worker intact and expose an exact 20-parameter
-- idempotency wrapper so PostgREST can resolve the browser RPC unambiguously.

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

  -- Exactly 19 arguments here: this resolves to the canonical atomic worker,
  -- not another overloaded idempotency wrapper.
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

REVOKE ALL ON FUNCTION public.edit_invoice(
  uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text,
  text, text, text, text, numeric, numeric, numeric, numeric, boolean,
  numeric, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.edit_invoice(
  uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text,
  text, text, text, text, numeric, numeric, numeric, numeric, boolean,
  numeric, text
) TO authenticated, service_role;

-- Explicitly invalidate PostgREST's schema cache after the DDL so the new RPC
-- signature is immediately discoverable by browser clients.
NOTIFY pgrst, 'reload schema';

COMMIT;
