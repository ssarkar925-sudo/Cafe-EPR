BEGIN;

CREATE OR REPLACE FUNCTION public.record_bill_payment(
  p_transaction_date date,
  p_transaction_timestamp timestamptz,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_remarks text,
  p_status text,
  p_amount numeric,
  p_service_fee numeric,
  p_portal_commission numeric,
  p_pay_from_instrument_id uuid,
  p_pay_from_method text,
  p_customer_pay_method text,
  p_customer_collection_instrument_id uuid,
  p_customer_payment_allocations jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gate jsonb;
  v_txn_id uuid;
  v_number text;
  v_fee numeric := round(coalesce(p_service_fee,0),2);
  v_commission numeric := round(coalesce(p_portal_commission,0),2);
  v_amount numeric := round(coalesce(p_amount,0),2);
  v_provider_cost numeric;
  v_funding_type text;
  v_allocations jsonb := coalesce(p_customer_payment_allocations,'[]'::jsonb);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_back_office() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key)='' THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;
  IF p_status NOT IN ('success','pending','failed') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF v_fee < 0 OR v_commission < 0 THEN RAISE EXCEPTION 'Fees and commission cannot be negative'; END IF;
  IF jsonb_typeof(v_allocations) <> 'array' THEN RAISE EXCEPTION 'Payment allocations must be an array'; END IF;
  IF p_pay_from_instrument_id IS NULL THEN RAISE EXCEPTION 'Funding account is required'; END IF;

  SELECT lower(type) INTO v_funding_type
  FROM public.payment_instruments
  WHERE id=p_pay_from_instrument_id AND is_active=true;
  IF v_funding_type IS NULL THEN RAISE EXCEPTION 'Funding payment instrument is missing or inactive'; END IF;
  IF v_funding_type='cash' THEN RAISE EXCEPTION 'Cash is not permitted as funding account for online bill payment'; END IF;
  IF lower(coalesce(p_pay_from_method,'')) <> v_funding_type THEN
    RAISE EXCEPTION 'Funding instrument type (%) does not match funding method (%)',v_funding_type,p_pay_from_method;
  END IF;

  v_gate:=public.idempotency_acquire(
    'record_bill_payment',
    p_idempotency_key,
    jsonb_build_object(
      'p_transaction_date',p_transaction_date,
      'p_transaction_timestamp',p_transaction_timestamp,
      'p_customer_id',p_customer_id,
      'p_customer_mobile',p_customer_mobile,
      'p_reference',p_reference,
      'p_remarks',p_remarks,
      'p_status',p_status,
      'p_amount',v_amount,
      'p_service_fee',v_fee,
      'p_portal_commission',v_commission,
      'p_pay_from_instrument_id',p_pay_from_instrument_id,
      'p_pay_from_method',p_pay_from_method,
      'p_customer_pay_method',p_customer_pay_method,
      'p_customer_collection_instrument_id',p_customer_collection_instrument_id,
      'p_customer_payment_allocations',v_allocations
    )
  );
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;

  v_provider_cost := round(v_amount-v_commission,2);
  IF v_provider_cost < 0 THEN RAISE EXCEPTION 'Commission cannot exceed bill amount'; END IF;

  IF jsonb_array_length(v_allocations) = 0 AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required when the bill payment is not collected immediately';
  END IF;

  v_number := 'BIL-' || to_char(coalesce(p_transaction_date,current_date),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));

  INSERT INTO public.transactions(
    id, transaction_number, direction, service_type, transaction_date, transaction_timestamp,
    customer_id, customer_mobile, reference, remarks, status, amount, service_fee,
    portal_commission, paid_from, customer_pay_method, pay_from_instrument_id,
    pay_from_method, portal_charge, pool_out, pool_credit, pool_credit_type,
    customer_collected_amount, customer_due_amount, customer_collection_method,
    customer_collection_instrument_id, created_by
  ) VALUES (
    gen_random_uuid(), v_number, 'in', 'bill_payment', coalesce(p_transaction_date,current_date),
    coalesce(p_transaction_timestamp,now()), p_customer_id, p_customer_mobile, p_reference,
    p_remarks, p_status, v_amount, v_fee, v_commission, 'funding_account',
    coalesce(nullif(lower(btrim(p_customer_pay_method)),''),'due'), p_pay_from_instrument_id,
    v_funding_type, 0, v_provider_cost, 0, 'utility', 0, 0,
    coalesce(nullif(lower(btrim(p_customer_pay_method)),''),'due'),
    p_customer_collection_instrument_id, auth.uid()
  ) RETURNING id, transaction_number INTO v_txn_id, v_number;

  IF p_status IN ('success') THEN
    PERFORM public.apply_transaction_customer_payment_split(v_txn_id,v_allocations);

    IF v_provider_cost > 0 THEN
      PERFORM set_config('erp.internal_cash_mutation_authorized','on',true);
      INSERT INTO public.cash_entries(
        entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id
      ) VALUES (
        coalesce(p_transaction_date,current_date), v_funding_type, 'out', v_provider_cost,
        'Bill '||v_number||' settlement from '||coalesce((SELECT name FROM public.payment_instruments WHERE id=p_pay_from_instrument_id),'funding account'),
        'transaction', v_txn_id, p_pay_from_instrument_id
      );
    END IF;
  END IF;

  PERFORM public.idempotency_commit(
    'record_bill_payment',p_idempotency_key,'completed',v_txn_id,
    jsonb_build_object('success',true,'id',v_txn_id,'transaction_number',v_number,'provider_cost',v_provider_cost)
  );
  RETURN jsonb_build_object('success',true,'id',v_txn_id,'transaction_number',v_number,'provider_cost',v_provider_cost);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_bill_payment(date,timestamptz,uuid,text,text,text,text,numeric,numeric,numeric,uuid,text,text,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_bill_payment(date,timestamptz,uuid,text,text,text,text,numeric,numeric,numeric,uuid,text,text,uuid,jsonb,text) TO authenticated, service_role;

COMMIT;
