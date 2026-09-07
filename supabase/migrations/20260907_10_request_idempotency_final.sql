-- 20260907_10_request_idempotency_final.sql
-- Server-side request-level idempotency for high-risk financial RPCs.
-- This migration is additive and does not mutate existing financial rows.
-- It preserves the existing canonical mutation functions and gates them with
-- actor + operation + client request key + canonical payload hash.

BEGIN;

CREATE TABLE IF NOT EXISTS public.idempotency_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  resource_type text,
  resource_id uuid,
  status text NOT NULL CHECK (status IN ('in_progress','completed','failed')),
  response_payload jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idempotency_requests_scope_uq UNIQUE (actor_id, operation, idempotency_key)
);

ALTER TABLE public.idempotency_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS idempotency_requests_select_own ON public.idempotency_requests;
CREATE POLICY idempotency_requests_select_own
  ON public.idempotency_requests
  FOR SELECT TO authenticated
  USING (actor_id = auth.uid() OR public.is_back_office());

CREATE OR REPLACE FUNCTION public.trg_enforce_idempotency_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_IMMUTABLE: request history cannot be deleted';
  END IF;

  IF NEW.actor_id IS DISTINCT FROM OLD.actor_id
     OR NEW.operation IS DISTINCT FROM OLD.operation
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
  THEN
    RAISE EXCEPTION 'IDEMPOTENCY_IMMUTABLE: request identity cannot change';
  END IF;

  IF OLD.status='completed' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_IMMUTABLE: completed request cannot change';
  END IF;

  IF OLD.status='in_progress' AND NEW.status NOT IN ('completed','failed') THEN
    RAISE EXCEPTION 'IDEMPOTENCY_INVALID_TRANSITION';
  END IF;

  IF OLD.status='failed' AND NEW.status <> 'in_progress' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_INVALID_TRANSITION';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_idempotency_immutability ON public.idempotency_requests;
CREATE TRIGGER trg_idempotency_immutability
  BEFORE UPDATE OR DELETE ON public.idempotency_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_idempotency_immutability();

CREATE OR REPLACE FUNCTION public.hash_idempotency_payload(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $$
  SELECT encode(extensions.digest(coalesce(p_payload,'{}'::jsonb)::text,'sha256'),'hex');
$$;

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
  v_actor uuid := auth.uid();
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
DECLARE v_actor uuid := auth.uid();
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

-- High-risk write wrappers. Existing no-key overloads remain available for
-- compatibility until all deployed clients have adopted the idempotent calls.

CREATE OR REPLACE FUNCTION public.create_sale(
  p_customer_id uuid, p_invoice_date date, p_subtotal numeric, p_discount numeric, p_total numeric,
  p_payments jsonb, p_items jsonb, p_previous_due numeric, p_previous_due_method text,
  p_previous_due_instrument_id uuid, p_advance_used numeric, p_place_of_supply text,
  p_supply_type text, p_customer_gstin text, p_b2b_or_b2c text, p_total_taxable_value numeric,
  p_total_cgst numeric, p_total_sgst numeric, p_total_igst numeric, p_is_reverse_charge boolean,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('create_sale',p_idempotency_key,jsonb_build_object(
    'p_customer_id',p_customer_id,'p_invoice_date',p_invoice_date,'p_subtotal',p_subtotal,
    'p_discount',p_discount,'p_total',p_total,'p_payments',p_payments,'p_items',p_items,
    'p_previous_due',p_previous_due,'p_previous_due_method',p_previous_due_method,
    'p_previous_due_instrument_id',p_previous_due_instrument_id,'p_advance_used',p_advance_used,
    'p_place_of_supply',p_place_of_supply,'p_supply_type',p_supply_type,'p_customer_gstin',p_customer_gstin,
    'p_b2b_or_b2c',p_b2b_or_b2c,'p_total_taxable_value',p_total_taxable_value,
    'p_total_cgst',p_total_cgst,'p_total_sgst',p_total_sgst,'p_total_igst',p_total_igst,
    'p_is_reverse_charge',p_is_reverse_charge));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.create_sale(p_customer_id,p_invoice_date,p_subtotal,p_discount,p_total,p_payments,p_items,p_previous_due,p_previous_due_method,p_previous_due_instrument_id,p_advance_used,p_place_of_supply,p_supply_type,p_customer_gstin,p_b2b_or_b2c,p_total_taxable_value,p_total_cgst,p_total_sgst,p_total_igst,p_is_reverse_charge);
  PERFORM public.idempotency_commit('create_sale',p_idempotency_key,'completed',NULL,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_quick_sale(
  p_sale_date date,p_amount numeric,p_cost numeric,p_customer_id uuid,p_product_id uuid,p_service_id uuid,
  p_item_name text,p_tendered numeric,p_payments jsonb,p_items jsonb,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('record_quick_sale',p_idempotency_key,jsonb_build_object(
    'p_sale_date',p_sale_date,'p_amount',p_amount,'p_cost',p_cost,'p_customer_id',p_customer_id,
    'p_product_id',p_product_id,'p_service_id',p_service_id,'p_item_name',p_item_name,
    'p_tendered',p_tendered,'p_payments',p_payments,'p_items',p_items));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.record_quick_sale(p_sale_date,p_amount,p_cost,p_customer_id,p_product_id,p_service_id,p_item_name,p_tendered,p_payments,p_items);
  PERFORM public.idempotency_commit('record_quick_sale',p_idempotency_key,'completed',NULL,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_business_txn(
  p_service_type text,p_transaction_date date,p_transaction_timestamp timestamptz,p_customer_id uuid,p_customer_mobile text,
  p_reference text,p_remarks text,p_status text,p_bank_id uuid,p_portal_id uuid,p_merchant_qr_id uuid,p_aadhaar_last4 text,
  p_transfer_method text,p_sender_name text,p_sender_mobile text,p_beneficiary_name text,p_beneficiary_mobile text,
  p_beneficiary_bank text,p_beneficiary_ifsc text,p_beneficiary_account text,p_upi_id text,p_amount numeric,
  p_service_fee numeric,p_portal_commission numeric,p_fee_source text,p_paid_from text,p_customer_pay_method text,
  p_pay_from_instrument_id uuid,p_pay_from_method text,p_receiver_name text,p_portal_charge numeric,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('create_business_txn',p_idempotency_key,to_jsonb(jsonb_build_object(
    'p_service_type',p_service_type,'p_transaction_date',p_transaction_date,'p_transaction_timestamp',p_transaction_timestamp,
    'p_customer_id',p_customer_id,'p_customer_mobile',p_customer_mobile,'p_reference',p_reference,'p_remarks',p_remarks,
    'p_status',p_status,'p_bank_id',p_bank_id,'p_portal_id',p_portal_id,'p_merchant_qr_id',p_merchant_qr_id,
    'p_aadhaar_last4',p_aadhaar_last4,'p_transfer_method',p_transfer_method,'p_sender_name',p_sender_name,
    'p_sender_mobile',p_sender_mobile,'p_beneficiary_name',p_beneficiary_name,'p_beneficiary_mobile',p_beneficiary_mobile,
    'p_beneficiary_bank',p_beneficiary_bank,'p_beneficiary_ifsc',p_beneficiary_ifsc,'p_beneficiary_account',p_beneficiary_account,
    'p_upi_id',p_upi_id,'p_amount',p_amount,'p_service_fee',p_service_fee,'p_portal_commission',p_portal_commission,
    'p_fee_source',p_fee_source,'p_paid_from',p_paid_from,'p_customer_pay_method',p_customer_pay_method,
    'p_pay_from_instrument_id',p_pay_from_instrument_id,'p_pay_from_method',p_pay_from_method,
    'p_receiver_name',p_receiver_name,'p_portal_charge',p_portal_charge)));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.create_business_txn(p_service_type,p_transaction_date,p_transaction_timestamp,p_customer_id,p_customer_mobile,p_reference,p_remarks,p_status,p_bank_id,p_portal_id,p_merchant_qr_id,p_aadhaar_last4,p_transfer_method,p_sender_name,p_sender_mobile,p_beneficiary_name,p_beneficiary_mobile,p_beneficiary_bank,p_beneficiary_ifsc,p_beneficiary_account,p_upi_id,p_amount,p_service_fee,p_portal_commission,p_fee_source,p_paid_from,p_customer_pay_method,p_pay_from_instrument_id,p_pay_from_method,p_receiver_name,p_portal_charge);
  PERFORM public.idempotency_commit('create_business_txn',p_idempotency_key,'completed',NULL,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_recharge(
  p_provider_id uuid,p_transaction_date date,p_transaction_timestamp timestamptz,p_customer_id uuid,p_customer_mobile text,
  p_reference text,p_remarks text,p_status text,p_amount numeric,p_customer_pay_method text,p_pay_from_instrument_id uuid,
  p_pay_from_method text,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('create_recharge',p_idempotency_key,jsonb_build_object(
    'p_provider_id',p_provider_id,'p_transaction_date',p_transaction_date,'p_transaction_timestamp',p_transaction_timestamp,
    'p_customer_id',p_customer_id,'p_customer_mobile',p_customer_mobile,'p_reference',p_reference,'p_remarks',p_remarks,
    'p_status',p_status,'p_amount',p_amount,'p_customer_pay_method',p_customer_pay_method,
    'p_pay_from_instrument_id',p_pay_from_instrument_id,'p_pay_from_method',p_pay_from_method));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.create_recharge(p_provider_id,p_transaction_date,p_transaction_timestamp,p_customer_id,p_customer_mobile,p_reference,p_remarks,p_status,p_amount,p_customer_pay_method,p_pay_from_instrument_id,p_pay_from_method);
  PERFORM public.idempotency_commit('create_recharge',p_idempotency_key,'completed',NULL,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid,p_method text,p_amount numeric,p_instrument_id uuid,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('record_invoice_payment',p_idempotency_key,jsonb_build_object(
    'p_invoice_id',p_invoice_id,'p_method',p_method,'p_amount',p_amount,'p_instrument_id',p_instrument_id));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.record_invoice_payment(p_invoice_id,p_method,p_amount,p_instrument_id);
  PERFORM public.idempotency_commit('record_invoice_payment',p_idempotency_key,'completed',NULL,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_invoice_multi_payment(
  p_invoice_id uuid,p_allocations jsonb,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('record_invoice_multi_payment',p_idempotency_key,jsonb_build_object('p_invoice_id',p_invoice_id,'p_allocations',p_allocations));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.record_invoice_multi_payment(p_invoice_id,p_allocations);
  PERFORM public.idempotency_commit('record_invoice_multi_payment',p_idempotency_key,'completed',NULL,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_invoice(
  p_invoice_id uuid,p_reason text,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('cancel_invoice',p_idempotency_key,jsonb_build_object('p_invoice_id',p_invoice_id,'p_reason',p_reason));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.cancel_invoice(p_invoice_id,p_reason);
  PERFORM public.idempotency_commit('cancel_invoice',p_idempotency_key,'completed',p_invoice_id,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_quick_sale(
  p_sale_id uuid,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('cancel_quick_sale',p_idempotency_key,jsonb_build_object('p_sale_id',p_sale_id));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.cancel_quick_sale(p_sale_id);
  PERFORM public.idempotency_commit('cancel_quick_sale',p_idempotency_key,'completed',p_sale_id,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_business_txn(
  p_txn_id uuid,p_reason text,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('reverse_business_txn',p_idempotency_key,jsonb_build_object('p_txn_id',p_txn_id,'p_reason',p_reason));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.reverse_business_txn(p_txn_id,p_reason);
  PERFORM public.idempotency_commit('reverse_business_txn',p_idempotency_key,'completed',p_txn_id,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.edit_bill_payment(
  p_txn_id uuid,p_customer_id uuid,p_customer_mobile text,p_reference text,p_amount numeric,p_service_fee numeric,
  p_portal_commission numeric,p_customer_pay_method text,p_funding_instrument_id uuid,p_status text,p_remarks text,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('edit_bill_payment',p_idempotency_key,jsonb_build_object(
    'p_txn_id',p_txn_id,'p_customer_id',p_customer_id,'p_customer_mobile',p_customer_mobile,
    'p_reference',p_reference,'p_amount',p_amount,'p_service_fee',p_service_fee,'p_portal_commission',p_portal_commission,
    'p_customer_pay_method',p_customer_pay_method,'p_funding_instrument_id',p_funding_instrument_id,
    'p_status',p_status,'p_remarks',p_remarks));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.edit_bill_payment(p_txn_id,p_customer_id,p_customer_mobile,p_reference,p_amount,p_service_fee,p_portal_commission,p_customer_pay_method,p_funding_instrument_id,p_status,p_remarks);
  PERFORM public.idempotency_commit('edit_bill_payment',p_idempotency_key,'completed',p_txn_id,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_recharge(
  p_txn_id uuid,p_provider_id uuid,p_transaction_date date,p_transaction_timestamp timestamptz,p_customer_id uuid,
  p_customer_mobile text,p_reference text,p_remarks text,p_amount numeric,p_customer_pay_method text,
  p_pay_from_instrument_id uuid,p_pay_from_method text,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('update_recharge',p_idempotency_key,jsonb_build_object(
    'p_txn_id',p_txn_id,'p_provider_id',p_provider_id,'p_transaction_date',p_transaction_date,
    'p_transaction_timestamp',p_transaction_timestamp,'p_customer_id',p_customer_id,'p_customer_mobile',p_customer_mobile,
    'p_reference',p_reference,'p_remarks',p_remarks,'p_amount',p_amount,
    'p_customer_pay_method',p_customer_pay_method,'p_pay_from_instrument_id',p_pay_from_instrument_id,'p_pay_from_method',p_pay_from_method));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.update_recharge(p_txn_id,p_provider_id,p_transaction_date,p_transaction_timestamp,p_customer_id,p_customer_mobile,p_reference,p_remarks,p_amount,p_customer_pay_method,p_pay_from_instrument_id,p_pay_from_method);
  PERFORM public.idempotency_commit('update_recharge',p_idempotency_key,'completed',p_txn_id,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_customer_multi_payment(
  p_customer_id uuid,p_entry_date date,p_allocations jsonb,p_reference text,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('record_customer_multi_payment',p_idempotency_key,jsonb_build_object(
    'p_customer_id',p_customer_id,'p_entry_date',p_entry_date,'p_allocations',p_allocations,'p_reference',p_reference));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.record_customer_multi_payment(p_customer_id,p_entry_date,p_allocations,p_reference);
  PERFORM public.idempotency_commit('record_customer_multi_payment',p_idempotency_key,'completed',NULL,v_result);
  RETURN v_result;
END;
$function$;

REVOKE ALL ON public.idempotency_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.idempotency_requests TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.idempotency_acquire(text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.idempotency_commit(text,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hash_idempotency_payload(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.idempotency_acquire(text,text,jsonb) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.idempotency_commit(text,text,text,uuid,jsonb) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.hash_idempotency_payload(jsonb) TO postgres, service_role;

REVOKE EXECUTE ON FUNCTION public.create_sale(uuid,date,numeric,numeric,numeric,jsonb,jsonb,numeric,text,uuid,numeric,text,text,text,text,numeric,numeric,numeric,numeric,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale(uuid,date,numeric,numeric,numeric,jsonb,jsonb,numeric,text,uuid,numeric,text,text,text,text,numeric,numeric,numeric,numeric,boolean,text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.record_quick_sale(date,numeric,numeric,uuid,uuid,uuid,text,numeric,jsonb,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_quick_sale(date,numeric,numeric,uuid,uuid,uuid,text,numeric,jsonb,jsonb,text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_business_txn(text,date,timestamptz,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,text,uuid,text,text,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_business_txn(text,date,timestamptz,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,text,uuid,text,text,numeric,text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_recharge(uuid,date,timestamptz,uuid,text,text,text,text,numeric,text,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_recharge(uuid,date,timestamptz,uuid,text,text,text,text,numeric,text,uuid,text,text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.record_invoice_payment(uuid,text,numeric,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid,text,numeric,uuid,text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.record_invoice_multi_payment(uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_multi_payment(uuid,jsonb,text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.cancel_invoice(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(uuid,text,text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.cancel_quick_sale(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_quick_sale(uuid,text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reverse_business_txn(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_business_txn(uuid,text,text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.edit_bill_payment(uuid,uuid,text,text,numeric,numeric,numeric,text,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_bill_payment(uuid,uuid,text,text,numeric,numeric,numeric,text,uuid,text,text,text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_recharge(uuid,uuid,date,timestamptz,uuid,text,text,text,numeric,text,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_recharge(uuid,uuid,date,timestamptz,uuid,text,text,text,numeric,text,uuid,text,text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.record_customer_multi_payment(uuid,date,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_customer_multi_payment(uuid,date,jsonb,text,text) TO authenticated, service_role;

COMMIT;
