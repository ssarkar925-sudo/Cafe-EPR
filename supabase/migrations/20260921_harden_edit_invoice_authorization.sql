-- Harden invoice editing authorization across all overloads.
--
-- Security Design:
-- 1. The 10-argument and 20-argument entry points require either:
--    - Trusted service_role context (API role = 'service_role'), OR
--    - An authenticated back-office user (admin or manager via public.is_back_office()), OR
--    - Direct internal superuser session (session_user = 'postgres' without API JWT claims).
-- 2. Both entry points enforce idempotency validation via public.idempotency_acquire / commit.
-- 3. The 19-argument mutating implementation contains the complete business logic (stock, cash reversal,
--    customer ledger, sale creation, audit logging), authorizes internal stock mutation for the trigger,
--    and also checks back-office authorization as defense-in-depth.
-- 4. Direct EXECUTE privilege on the 19-argument mutating implementation and legacy 9-argument internal function
--    is revoked from anon and authenticated roles, restricting direct execution to service_role.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Core 19-argument Mutating Implementation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.edit_invoice(
  p_invoice_id uuid,
  p_customer_id uuid,
  p_invoice_date date,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_payments jsonb,
  p_items jsonb,
  p_reason text DEFAULT ''::text,
  p_place_of_supply text DEFAULT NULL::text,
  p_supply_type text DEFAULT 'intra_state'::text,
  p_customer_gstin text DEFAULT NULL::text,
  p_b2b_or_b2c text DEFAULT 'B2C_SMALL'::text,
  p_total_taxable_value numeric DEFAULT NULL::numeric,
  p_total_cgst numeric DEFAULT 0,
  p_total_sgst numeric DEFAULT 0,
  p_total_igst numeric DEFAULT 0,
  p_is_reverse_charge boolean DEFAULT false,
  p_advance_used numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old public.invoices%rowtype;
  v_item record;
  v_payment jsonb;
  v_cash record;
  v_ledger_net numeric := 0;
  v_old_payment_total numeric := 0;
  v_new_id uuid;
  v_new jsonb;
  v_new_number text;
  v_calc_subtotal numeric := 0;
  v_new_total numeric := 0;
  v_stock numeric;
  v_qty numeric;
  v_old_qty numeric;
  v_old_returned_qty numeric;
BEGIN
  -- Defense-in-depth authorization check:
  -- Enforces that API callers (anon or authenticated) must be back-office users (admin/manager).
  -- Allows trusted service_role or internal postgres maintenance sessions.
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    IF NOT public.is_back_office() THEN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      ELSE
        RAISE EXCEPTION 'Back-office authorization required';
      END IF;
    END IF;
  ELSIF coalesce(auth.role(), '') = 'service_role' THEN
    NULL; -- Trusted service-role caller
  ELSE
    IF NOT (session_user = 'postgres' OR public.is_back_office()) THEN
      RAISE EXCEPTION 'Back-office authorization required';
    END IF;
  END IF;

  -- Authorize internal stock adjustment to satisfy trg_protect_product_stock_mutation
  PERFORM set_config('erp.internal_stock_mutation_authorized', 'on', true);

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Invoice must contain at least one item';
  END IF;
  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' THEN
    RAISE EXCEPTION 'Payments must be an array';
  END IF;
  IF p_discount IS NULL OR p_discount < 0 THEN
    RAISE EXCEPTION 'Invalid discount';
  END IF;
  IF p_advance_used IS NULL OR p_advance_used < 0 THEN
    RAISE EXCEPTION 'Invalid advance amount';
  END IF;

  SELECT * INTO v_old
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
  IF v_old.status IN ('cancelled', 'returned') THEN
    RAISE EXCEPTION 'Invoice already cancelled or returned';
  END IF;
  IF coalesce(v_old.refunded, 0) > 0 THEN
    RAISE EXCEPTION 'Refunded invoices cannot be edited; use the return/refund workflow';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoice_items ii
    WHERE ii.invoice_id = p_invoice_id
      AND coalesce(ii.returned_qty, 0) > 0
  ) OR coalesce(v_old.returned, 0) > 0 THEN
    RAISE EXCEPTION 'Invoices containing returned items cannot be edited; use the return workflow';
  END IF;

  SELECT coalesce(sum(round(coalesce((item->>'amount')::numeric, 0), 2)), 0)
    INTO v_calc_subtotal
  FROM jsonb_array_elements(p_items) item;

  IF p_discount > v_calc_subtotal THEN
    RAISE EXCEPTION 'Discount cannot exceed subtotal';
  END IF;

  v_new_total := round(
    (
      SELECT coalesce(sum(
        round(
          coalesce((item->>'taxable_value')::numeric, 0) +
          coalesce((item->>'cgst_amount')::numeric, 0) +
          coalesce((item->>'sgst_amount')::numeric, 0) +
          coalesce((item->>'igst_amount')::numeric, 0),
          2
        )
      ), 0)
      FROM jsonb_array_elements(p_items) item
    ),
    2
  );
  p_total := v_new_total;
  p_total_taxable_value := round((SELECT coalesce(sum(coalesce((item->>'taxable_value')::numeric, 0)), 0) FROM jsonb_array_elements(p_items) item), 2);
  p_total_cgst := round((SELECT coalesce(sum(coalesce((item->>'cgst_amount')::numeric, 0)), 0) FROM jsonb_array_elements(p_items) item), 2);
  p_total_sgst := round((SELECT coalesce(sum(coalesce((item->>'sgst_amount')::numeric, 0)), 0) FROM jsonb_array_elements(p_items) item), 2);
  p_total_igst := round((SELECT coalesce(sum(coalesce((item->>'igst_amount')::numeric, 0)), 0) FROM jsonb_array_elements(p_items) item), 2);

  SELECT coalesce(sum(round(coalesce((payment->>'amount')::numeric, 0), 2)), 0)
    INTO v_old_payment_total
  FROM jsonb_array_elements(p_payments) payment;

  IF abs((coalesce(v_old.paid, 0) - v_old_payment_total) - p_advance_used) > 0.005 THEN
    RAISE EXCEPTION 'Payment/advance preservation mismatch; invoice edit aborted';
  END IF;

  IF v_old_payment_total + p_advance_used > v_new_total + 0.005 THEN
    RAISE EXCEPTION 'Corrected invoice total cannot be lower than the amount already collected';
  END IF;

  FOR v_item IN
    SELECT ii.product_id, ii.qty
    FROM public.invoice_items ii
    WHERE ii.invoice_id = p_invoice_id
      AND ii.product_id IS NOT NULL
  LOOP
    UPDATE public.products
       SET stock_qty = coalesce(stock_qty, 0) + coalesce(v_item.qty, 0),
           updated_at = now()
     WHERE id = v_item.product_id;
  END LOOP;

  FOR v_item IN
    SELECT
      nullif(item->>'product_id', '')::uuid AS product_id,
      sum(coalesce((item->>'qty')::numeric, 0)) AS qty
    FROM jsonb_array_elements(p_items) item
    WHERE nullif(item->>'product_id', '') IS NOT NULL
    GROUP BY nullif(item->>'product_id', '')::uuid
  LOOP
    IF v_item.qty <= 0 THEN
      RAISE EXCEPTION 'Product quantity must be greater than zero';
    END IF;
    SELECT stock_qty INTO v_stock FROM public.products WHERE id = v_item.product_id FOR UPDATE;
    IF v_stock IS NULL THEN
      RAISE EXCEPTION 'Product not found';
    END IF;
    IF v_stock < v_item.qty THEN
      RAISE EXCEPTION 'Insufficient stock for corrected invoice (have %, need %)', v_stock, v_item.qty;
    END IF;
  END LOOP;

  FOR v_cash IN
    SELECT *
    FROM public.cash_entries
    WHERE ref_type = 'invoice'
      AND ref_id = p_invoice_id
  LOOP
    INSERT INTO public.cash_entries (
      entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id
    ) VALUES (
      v_cash.entry_date,
      v_cash.method,
      CASE WHEN v_cash.direction = 'in' THEN 'out' ELSE 'in' END,
      v_cash.amount,
      'Edit reversal of ' || v_old.invoice_number,
      'invoice',
      p_invoice_id,
      v_cash.instrument_id
    );
  END LOOP;

  IF v_old.customer_id IS NOT NULL THEN
    SELECT coalesce(sum(coalesce(debit, 0) - coalesce(credit, 0)), 0)
      INTO v_ledger_net
    FROM public.customer_ledger
    WHERE ref_id = p_invoice_id;

    IF v_ledger_net <> 0 THEN
      UPDATE public.customers
         SET balance = balance - v_ledger_net,
             updated_at = now()
       WHERE id = v_old.customer_id;

      INSERT INTO public.customer_ledger (
        customer_id, entry_date, type, description, debit, credit, balance_after, ref_id
      ) VALUES (
        v_old.customer_id,
        v_old.invoice_date,
        'adjustment',
        'Edit reversal of ' || v_old.invoice_number,
        CASE WHEN v_ledger_net < 0 THEN -v_ledger_net ELSE NULL END,
        CASE WHEN v_ledger_net > 0 THEN v_ledger_net ELSE NULL END,
        (SELECT balance FROM public.customers WHERE id = v_old.customer_id),
        p_invoice_id
      );
    END IF;
  END IF;

  UPDATE public.invoices
     SET status = 'cancelled'
   WHERE id = p_invoice_id;

  SELECT public.create_sale(
    p_customer_id => p_customer_id,
    p_invoice_date => p_invoice_date,
    p_subtotal => v_calc_subtotal,
    p_discount => p_discount,
    p_total => v_new_total,
    p_payments => p_payments,
    p_items => p_items,
    p_previous_due => 0,
    p_previous_due_method => 'cash',
    p_previous_due_instrument_id => NULL,
    p_advance_used => p_advance_used,
    p_place_of_supply => p_place_of_supply,
    p_supply_type => coalesce(p_supply_type, 'intra_state'),
    p_customer_gstin => p_customer_gstin,
    p_b2b_or_b2c => coalesce(p_b2b_or_b2c, 'B2C_SMALL'),
    p_total_taxable_value => p_total_taxable_value,
    p_total_cgst => coalesce(p_total_cgst, 0),
    p_total_sgst => coalesce(p_total_sgst, 0),
    p_total_igst => coalesce(p_total_igst, 0),
    p_is_reverse_charge => coalesce(p_is_reverse_charge, false)
  ) INTO v_new;

  v_new_id := coalesce((v_new->>'invoice_id')::uuid, (v_new->>'id')::uuid);
  v_new_number := v_new->>'invoice_number';

  UPDATE public.invoices
     SET edited_from = p_invoice_id
   WHERE id = v_new_id;

  INSERT INTO public.audit_logs (
    user_id, user_name, action, entity, entity_id, description, details
  ) VALUES (
    auth.uid(), NULL, 'invoice_edited', 'invoices', v_new_id::text,
    'Edited ' || v_old.invoice_number || ' -> ' || v_new_number || coalesce(' | ' || nullif(p_reason, ''), ''),
    jsonb_build_object(
      'old_invoice_id', p_invoice_id,
      'old_invoice_number', v_old.invoice_number,
      'new_invoice_id', v_new_id,
      'new_invoice_number', v_new_number,
      'old_total', v_old.total,
      'new_total', v_new_total,
      'old_customer_id', v_old.customer_id,
      'new_customer_id', p_customer_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'old_invoice_id', p_invoice_id,
    'old_invoice_number', v_old.invoice_number,
    'id', v_new_id,
    'invoice_number', v_new_number,
    'customer_id', coalesce(v_new->>'customer_id', p_customer_id::text),
    'total', v_new->>'total',
    'paid', v_new->>'paid',
    'due', v_new->>'due',
    'status', v_new->>'status',
    'invoice_date', coalesce(v_new->>'invoice_date', p_invoice_date::text)
  );
END;
$function$;

-- -----------------------------------------------------------------------------
-- 2. Idempotent 10-argument Wrapper (Back-office & Idempotency Enforced)
-- -----------------------------------------------------------------------------
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
  -- Defense-in-depth authorization check:
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    IF NOT public.is_back_office() THEN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      ELSE
        RAISE EXCEPTION 'Back-office authorization required';
      END IF;
    END IF;
  ELSIF coalesce(auth.role(), '') = 'service_role' THEN
    NULL; -- Trusted service-role caller
  ELSE
    IF NOT (session_user = 'postgres' OR public.is_back_office()) THEN
      RAISE EXCEPTION 'Back-office authorization required';
    END IF;
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

-- -----------------------------------------------------------------------------
-- 3. Idempotent 20-argument Wrapper (Back-office & Idempotency Enforced)
-- -----------------------------------------------------------------------------
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
  -- Defense-in-depth authorization check:
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    IF NOT public.is_back_office() THEN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      ELSE
        RAISE EXCEPTION 'Back-office authorization required';
      END IF;
    END IF;
  ELSIF coalesce(auth.role(), '') = 'service_role' THEN
    NULL; -- Trusted service-role caller
  ELSE
    IF NOT (session_user = 'postgres' OR public.is_back_office()) THEN
      RAISE EXCEPTION 'Back-office authorization required';
    END IF;
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

-- -----------------------------------------------------------------------------
-- 4. Privilege & Access Control Hardening
-- -----------------------------------------------------------------------------
-- Revoke all execute from public and anon on all edit_invoice overloads
REVOKE ALL ON FUNCTION public.edit_invoice(uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.edit_invoice(uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric, text) FROM PUBLIC, anon;

-- The 19-argument mutating implementation must NOT be directly callable by anon or authenticated roles
REVOKE ALL ON FUNCTION public.edit_invoice(uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric) FROM PUBLIC, anon, authenticated;

-- Ensure legacy internal function cannot be called by public, anon, or authenticated roles
REVOKE ALL ON FUNCTION public.edit_invoice_internal(uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;

-- Grant EXECUTE to authorized roles:
-- Authenticated users and service_role can call the idempotent wrappers.
GRANT EXECUTE ON FUNCTION public.edit_invoice(uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.edit_invoice(uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric, text) TO authenticated, service_role;

-- Only trusted service_role can call the mutating implementation or legacy internal function directly.
GRANT EXECUTE ON FUNCTION public.edit_invoice(uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.edit_invoice_internal(uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text) TO service_role;

COMMIT;
