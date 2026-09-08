-- Allow the Bill & Recharge Hub editor to change an existing customer split
-- atomically while retaining the existing append-only financial reconciliation path.

DO $$
DECLARE
  v_oid oid := 'public.edit_bill_payment(uuid,uuid,text,text,numeric,numeric,numeric,text,uuid,text,text)'::regprocedure;
  v_def text;
  v_old text := 'v_allocations:=coalesce(v_txn.customer_payment_allocations,''[]''::jsonb);';
  v_new text := 'v_allocations:=coalesce(nullif(current_setting(''erp.edit_customer_payment_allocations'',true),'''')::jsonb,v_txn.customer_payment_allocations,''[]''::jsonb);';
BEGIN
  SELECT pg_get_functiondef(v_oid) INTO v_def;
  IF position('current_setting(''erp.edit_customer_payment_allocations''' IN v_def) = 0 THEN
    IF position(v_old IN v_def) = 0 THEN
      RAISE EXCEPTION 'edit_bill_payment allocation anchor not found; refusing unsafe patch';
    END IF;
    v_def := replace(v_def, v_old, v_new);
    EXECUTE v_def;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.edit_bill_payment_with_allocations(
  p_txn_id uuid,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_amount numeric,
  p_service_fee numeric,
  p_portal_commission numeric,
  p_customer_pay_method text,
  p_funding_instrument_id uuid,
  p_status text,
  p_remarks text,
  p_customer_payment_allocations jsonb,
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
  v_txn record;
  v_item jsonb;
  v_method text;
  v_inst uuid;
  v_inst_type text;
  v_amount numeric;
  v_total numeric := 0;
  v_expected numeric;
  v_normalized jsonb := '[]'::jsonb;
  v_first_method text := 'due';
BEGIN
  v_gate := public.idempotency_acquire(
    'edit_bill_payment_with_allocations',
    p_idempotency_key,
    jsonb_build_object(
      'p_txn_id',p_txn_id,
      'p_customer_id',p_customer_id,
      'p_customer_mobile',p_customer_mobile,
      'p_reference',p_reference,
      'p_amount',p_amount,
      'p_service_fee',p_service_fee,
      'p_portal_commission',p_portal_commission,
      'p_customer_pay_method',p_customer_pay_method,
      'p_funding_instrument_id',p_funding_instrument_id,
      'p_status',p_status,
      'p_remarks',p_remarks,
      'p_customer_payment_allocations',coalesce(p_customer_payment_allocations,'[]'::jsonb)
    )
  );
  IF v_gate->>'status'='replay' THEN
    RETURN v_gate->'response_payload';
  END IF;

  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_back_office() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF p_status NOT IN ('success','pending','failed','reversed') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF p_customer_payment_allocations IS NULL OR jsonb_typeof(p_customer_payment_allocations)<>'array' THEN
    RAISE EXCEPTION 'Customer payment allocations must be an array';
  END IF;

  SELECT * INTO v_txn FROM public.transactions WHERE id=p_txn_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  IF p_status='success' THEN
    v_expected := round(coalesce(p_amount,0)+coalesce(p_service_fee,0),2);

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_customer_payment_allocations) LOOP
      v_amount := round(coalesce((v_item->>'amount')::numeric,0),2);
      IF v_amount <= 0 THEN RAISE EXCEPTION 'Each customer payment allocation must be positive'; END IF;
      v_total := v_total + v_amount;

      v_method := lower(coalesce(nullif(btrim(v_item->>'method'),''),'cash'));
      IF v_method='qr' OR v_method='upi_qr' THEN v_method:='upi'; END IF;
      IF v_method='card' THEN v_method:='credit_card'; END IF;
      IF v_method NOT IN ('cash','upi','bank','wallet','debit_card','credit_card') THEN
        RAISE EXCEPTION 'Invalid customer payment method in split: %', v_method;
      END IF;

      v_inst := nullif(v_item->>'instrument_id','')::uuid;
      IF v_inst IS NOT NULL THEN
        SELECT type INTO v_inst_type FROM public.payment_instruments WHERE id=v_inst AND is_active=true;
        IF v_inst_type IS NULL THEN RAISE EXCEPTION 'Unknown or inactive customer payment instrument'; END IF;
        v_method := CASE lower(v_inst_type)
          WHEN 'cash' THEN 'cash'
          WHEN 'upi' THEN 'upi'
          WHEN 'upi_qr' THEN 'upi'
          WHEN 'bank' THEN 'bank'
          WHEN 'wallet' THEN 'wallet'
          WHEN 'debit_card' THEN 'debit_card'
          WHEN 'credit_card' THEN 'credit_card'
          ELSE NULL
        END;
        IF v_method IS NULL THEN RAISE EXCEPTION 'Unsupported customer payment instrument type'; END IF;
      ELSE
        IF v_method='cash' THEN
          SELECT id INTO v_inst FROM public.payment_instruments WHERE is_active AND lower(type)='cash' ORDER BY created_at asc LIMIT 1;
        ELSIF v_method='upi' THEN
          SELECT id INTO v_inst FROM public.payment_instruments WHERE is_active AND lower(type) IN ('upi','upi_qr') ORDER BY created_at asc LIMIT 1;
        ELSIF v_method='bank' THEN
          SELECT id INTO v_inst FROM public.payment_instruments WHERE is_active AND lower(type)='bank' ORDER BY created_at asc LIMIT 1;
        ELSIF v_method='wallet' THEN
          SELECT id INTO v_inst FROM public.payment_instruments WHERE is_active AND lower(type)='wallet' ORDER BY created_at asc LIMIT 1;
        ELSIF v_method='debit_card' THEN
          SELECT id INTO v_inst FROM public.payment_instruments WHERE is_active AND lower(type)='debit_card' ORDER BY created_at asc LIMIT 1;
        ELSIF v_method='credit_card' THEN
          SELECT id INTO v_inst FROM public.payment_instruments WHERE is_active AND lower(type)='credit_card' ORDER BY created_at asc LIMIT 1;
        END IF;
      END IF;

      IF v_inst IS NULL THEN RAISE EXCEPTION 'No active customer payment instrument configured for %', v_method; END IF;
      IF v_first_method='due' THEN v_first_method:=v_method; END IF;
      v_normalized := v_normalized || jsonb_build_array(
        jsonb_build_object('method',v_method,'amount',v_amount,'instrument_id',v_inst)
      );
    END LOOP;

    -- The editor handles full customer collection splits. Partial collection should
    -- use the Khata workflow rather than silently creating an inconsistent edit.
    IF jsonb_array_length(v_normalized)=0 THEN
      IF lower(coalesce(p_customer_pay_method,''))<>'due' THEN
        RAISE EXCEPTION 'Choose at least one customer payment method or Khata Due';
      END IF;
    ELSE
      IF abs(v_total-v_expected)>0.005 THEN
        RAISE EXCEPTION 'Split customer collection must equal the transaction customer total (%, received %)',v_expected,v_total;
      END IF;
    END IF;
  END IF;

  IF p_status='success' THEN
    PERFORM set_config('erp.edit_customer_payment_allocations', v_normalized::text, true);
    v_result := public.edit_bill_payment(
      p_txn_id,
      p_customer_id,
      p_customer_mobile,
      p_reference,
      p_amount,
      p_service_fee,
      p_portal_commission,
      CASE WHEN jsonb_array_length(v_normalized)=0 THEN 'due' ELSE v_first_method END,
      p_funding_instrument_id,
      p_status,
      p_remarks
    );
  ELSE
    v_result := public.edit_bill_payment(
      p_txn_id,
      p_customer_id,
      p_customer_mobile,
      p_reference,
      p_amount,
      p_service_fee,
      p_portal_commission,
      p_customer_pay_method,
      p_funding_instrument_id,
      p_status,
      p_remarks
    );
  END IF;

  PERFORM public.idempotency_commit(
    'edit_bill_payment_with_allocations',
    p_idempotency_key,
    'completed',
    p_txn_id,
    v_result
  );
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.edit_bill_payment_with_allocations(uuid,uuid,text,text,numeric,numeric,numeric,text,uuid,text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_bill_payment_with_allocations(uuid,uuid,text,text,numeric,numeric,numeric,text,uuid,text,text,jsonb,text) TO authenticated;
