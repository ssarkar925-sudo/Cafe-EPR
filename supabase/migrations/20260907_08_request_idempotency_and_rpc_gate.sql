-- 20260907_08_request_idempotency_and_rpc_gate.sql
-- End-to-end request-level idempotency for browser/client financial mutations.
-- Additive: core business tables are not altered.

BEGIN;

CREATE TABLE IF NOT EXISTS public.idempotency_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'IN_PROGRESS',
  response_payload jsonb,
  resource_type text,
  resource_id uuid,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT idempotency_requests_status_chk CHECK (status IN ('IN_PROGRESS','COMPLETED','FAILED')),
  CONSTRAINT idempotency_requests_key_chk CHECK (length(btrim(idempotency_key)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_requests_scope
  ON public.idempotency_requests (
    coalesce(actor_id,'00000000-0000-0000-0000-000000000000'::uuid),
    operation,
    idempotency_key
  );

CREATE INDEX IF NOT EXISTS idx_idempotency_requests_resource
  ON public.idempotency_requests(resource_type,resource_id);

ALTER TABLE public.idempotency_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.idempotency_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.idempotency_requests TO authenticated;

DROP POLICY IF EXISTS "Users view own idempotency requests" ON public.idempotency_requests;
CREATE POLICY "Users view own idempotency requests"
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
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'FINANCIAL_RECORD_IMMUTABLE: idempotency records cannot be deleted';
  END IF;

  IF OLD.status='COMPLETED' THEN
    RAISE EXCEPTION 'FINANCIAL_RECORD_IMMUTABLE: completed idempotency records cannot be updated';
  END IF;

  IF NEW.actor_id IS DISTINCT FROM OLD.actor_id
     OR NEW.operation IS DISTINCT FROM OLD.operation
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
  THEN
    RAISE EXCEPTION 'FINANCIAL_RECORD_IMMUTABLE: idempotency identity cannot be changed';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_idempotency_immutability ON public.idempotency_requests;
CREATE TRIGGER trg_idempotency_immutability
BEFORE UPDATE OR DELETE ON public.idempotency_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_idempotency_immutability();

REVOKE EXECUTE ON FUNCTION public.trg_enforce_idempotency_immutability() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.hash_idempotency_payload(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT encode(digest(coalesce(p_payload,'null'::jsonb)::text,'sha256'),'hex');
$function$;

CREATE OR REPLACE FUNCTION public.idempotency_acquire(
  p_operation text,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_hash text;
  v_row public.idempotency_requests%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_operation IS NULL OR btrim(p_operation)='' THEN
    RAISE EXCEPTION 'Operation is required';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key)='' THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  v_hash := public.hash_idempotency_payload(coalesce(p_payload,'null'::jsonb));

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'idemp:'||v_actor::text||':'||p_operation||':'||p_idempotency_key,
      0
    )
  );

  SELECT * INTO v_row
  FROM public.idempotency_requests
  WHERE actor_id=v_actor
    AND operation=p_operation
    AND idempotency_key=p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_row.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Request payload does not match original request'
        USING ERRCODE='23505';
    END IF;

    IF v_row.status='COMPLETED' THEN
      RETURN jsonb_build_object(
        'status','REPLAY',
        'response_payload',v_row.response_payload,
        'resource_type',v_row.resource_type,
        'resource_id',v_row.resource_id
      );
    END IF;

    IF v_row.status='IN_PROGRESS' THEN
      RAISE EXCEPTION 'IDEMPOTENCY_IN_PROGRESS: Request is already executing'
        USING ERRCODE='23505';
    END IF;

    UPDATE public.idempotency_requests
    SET status='IN_PROGRESS',
        response_payload=NULL,
        error_code=NULL,
        error_message=NULL,
        completed_at=NULL
    WHERE id=v_row.id;

    RETURN jsonb_build_object('status','ACQUIRED','request_id',v_row.id);
  END IF;

  INSERT INTO public.idempotency_requests(
    actor_id,operation,idempotency_key,payload_hash,status
  )
  VALUES(v_actor,p_operation,p_idempotency_key,v_hash,'IN_PROGRESS');

  RETURN jsonb_build_object('status','ACQUIRED');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.idempotency_acquire(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.idempotency_acquire(text,text,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.idempotency_commit(
  p_operation text,
  p_idempotency_key text,
  p_status text,
  p_resource_id uuid,
  p_response_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF upper(coalesce(p_status,'')) <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Idempotency commit status must be COMPLETED';
  END IF;

  UPDATE public.idempotency_requests
  SET status='COMPLETED',
      response_payload=p_response_payload,
      resource_id=p_resource_id,
      completed_at=now(),
      updated_at=now()
  WHERE actor_id=v_actor
    AND operation=p_operation
    AND idempotency_key=p_idempotency_key
    AND status='IN_PROGRESS';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Idempotency request was not acquired or is no longer active';
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.idempotency_commit(text,text,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.idempotency_commit(text,text,text,uuid,jsonb) TO authenticated,service_role;

-- ============================================================
-- Idempotent public RPC gates
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.create_sale(uuid,date,numeric,numeric,numeric,jsonb,jsonb,numeric,text,uuid,numeric,text,text,text,text,numeric,numeric,numeric,numeric,boolean) FROM authenticated;
CREATE OR REPLACE FUNCTION public.create_sale_idempotent(
  p_customer_id uuid,p_invoice_date date,p_subtotal numeric,p_discount numeric,p_total numeric,p_payments jsonb,p_items jsonb,
  p_previous_due numeric DEFAULT 0,p_previous_due_method text DEFAULT 'cash',p_previous_due_instrument_id uuid DEFAULT NULL,
  p_advance_used numeric DEFAULT 0,p_place_of_supply text DEFAULT NULL,p_supply_type text DEFAULT 'intra_state',
  p_customer_gstin text DEFAULT NULL,p_b2b_or_b2c text DEFAULT 'B2C_SMALL',p_total_taxable_value numeric DEFAULT NULL,
  p_total_cgst numeric DEFAULT 0,p_total_sgst numeric DEFAULT 0,p_total_igst numeric DEFAULT 0,p_is_reverse_charge boolean DEFAULT false,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_back_office() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  v_gate:=public.idempotency_acquire('create_sale',p_idempotency_key,jsonb_build_object(
    'p_customer_id',p_customer_id,'p_invoice_date',p_invoice_date,'p_subtotal',p_subtotal,'p_discount',p_discount,'p_total',p_total,
    'p_payments',p_payments,'p_items',p_items,'p_previous_due',p_previous_due,'p_previous_due_method',p_previous_due_method,
    'p_previous_due_instrument_id',p_previous_due_instrument_id,'p_advance_used',p_advance_used,'p_place_of_supply',p_place_of_supply,
    'p_supply_type',p_supply_type,'p_customer_gstin',p_customer_gstin,'p_b2b_or_b2c',p_b2b_or_b2c,'p_total_taxable_value',p_total_taxable_value,
    'p_total_cgst',p_total_cgst,'p_total_sgst',p_total_sgst,'p_total_igst',p_total_igst,'p_is_reverse_charge',p_is_reverse_charge
  ));
  IF v_gate->>'status'='REPLAY' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.create_sale(p_customer_id,p_invoice_date,p_subtotal,p_discount,p_total,p_payments,p_items,p_previous_due,p_previous_due_method,p_previous_due_instrument_id,p_advance_used,p_place_of_supply,p_supply_type,p_customer_gstin,p_b2b_or_b2c,p_total_taxable_value,p_total_cgst,p_total_sgst,p_total_igst,p_is_reverse_charge);
  PERFORM public.idempotency_commit('create_sale',p_idempotency_key,'COMPLETED',(v_result->>'invoice_id')::uuid,v_result);
  RETURN v_result;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.create_sale_idempotent(uuid,date,numeric,numeric,numeric,jsonb,jsonb,numeric,text,uuid,numeric,text,text,text,text,numeric,numeric,numeric,numeric,boolean,text) TO authenticated,service_role;

REVOKE EXECUTE ON FUNCTION public.record_quick_sale(date,numeric,numeric,uuid,uuid,uuid,text,numeric,jsonb,jsonb) FROM authenticated;
CREATE OR REPLACE FUNCTION public.record_quick_sale_idempotent(
  p_sale_date date,p_amount numeric,p_cost numeric DEFAULT 0,p_customer_id uuid DEFAULT NULL,p_product_id uuid DEFAULT NULL,p_service_id uuid DEFAULT NULL,
  p_item_name text DEFAULT NULL,p_tendered numeric DEFAULT NULL,p_payments jsonb DEFAULT '[]'::jsonb,p_items jsonb DEFAULT NULL,p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_back_office() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  v_gate:=public.idempotency_acquire('record_quick_sale',p_idempotency_key,jsonb_build_object('p_sale_date',p_sale_date,'p_amount',p_amount,'p_cost',p_cost,'p_customer_id',p_customer_id,'p_product_id',p_product_id,'p_service_id',p_service_id,'p_item_name',p_item_name,'p_tendered',p_tendered,'p_payments',p_payments,'p_items',p_items));
  IF v_gate->>'status'='REPLAY' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.record_quick_sale(p_sale_date,p_amount,p_cost,p_customer_id,p_product_id,p_service_id,p_item_name,p_tendered,p_payments,p_items);
  PERFORM public.idempotency_commit('record_quick_sale',p_idempotency_key,'COMPLETED',(v_result->>'id')::uuid,v_result);
  RETURN v_result;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.record_quick_sale_idempotent(date,numeric,numeric,uuid,uuid,uuid,text,numeric,jsonb,jsonb,text) TO authenticated,service_role;

REVOKE EXECUTE ON FUNCTION public.create_business_txn(text,date,timestamptz,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,text,uuid,text,text,numeric) FROM authenticated;
CREATE OR REPLACE FUNCTION public.create_business_txn_idempotent(
  p_service_type text,p_transaction_date date,p_transaction_timestamp timestamptz,p_customer_id uuid,p_customer_mobile text,p_reference text,p_remarks text,
  p_status text,p_bank_id uuid,p_portal_id uuid,p_merchant_qr_id uuid,p_aadhaar_last4 text,p_transfer_method text,p_sender_name text,p_sender_mobile text,
  p_beneficiary_name text,p_beneficiary_mobile text,p_beneficiary_bank text,p_beneficiary_ifsc text,p_beneficiary_account text,p_upi_id text,p_amount numeric,
  p_service_fee numeric,p_portal_commission numeric,p_fee_source text DEFAULT NULL,p_paid_from text DEFAULT NULL,p_customer_pay_method text DEFAULT NULL,
  p_pay_from_instrument_id uuid DEFAULT NULL,p_pay_from_method text DEFAULT 'bank',p_receiver_name text DEFAULT NULL,p_portal_charge numeric DEFAULT 0,p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_back_office() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  v_gate:=public.idempotency_acquire('create_business_txn',p_idempotency_key,jsonb_build_object(
    'p_service_type',p_service_type,'p_transaction_date',p_transaction_date,'p_transaction_timestamp',p_transaction_timestamp,'p_customer_id',p_customer_id,'p_customer_mobile',p_customer_mobile,
    'p_reference',p_reference,'p_remarks',p_remarks,'p_status',p_status,'p_bank_id',p_bank_id,'p_portal_id',p_portal_id,'p_merchant_qr_id',p_merchant_qr_id,'p_aadhaar_last4',p_aadhaar_last4,
    'p_transfer_method',p_transfer_method,'p_sender_name',p_sender_name,'p_sender_mobile',p_sender_mobile,'p_beneficiary_name',p_beneficiary_name,'p_beneficiary_mobile',p_beneficiary_mobile,
    'p_beneficiary_bank',p_beneficiary_bank,'p_beneficiary_ifsc',p_beneficiary_ifsc,'p_beneficiary_account',p_beneficiary_account,'p_upi_id',p_upi_id,'p_amount',p_amount,
    'p_service_fee',p_service_fee,'p_portal_commission',p_portal_commission,'p_fee_source',p_fee_source,'p_paid_from',p_paid_from,'p_customer_pay_method',p_customer_pay_method,
    'p_pay_from_instrument_id',p_pay_from_instrument_id,'p_pay_from_method',p_pay_from_method,'p_receiver_name',p_receiver_name,'p_portal_charge',p_portal_charge
  ));
  IF v_gate->>'status'='REPLAY' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.create_business_txn(p_service_type,p_transaction_date,p_transaction_timestamp,p_customer_id,p_customer_mobile,p_reference,p_remarks,p_status,p_bank_id,p_portal_id,p_merchant_qr_id,p_aadhaar_last4,p_transfer_method,p_sender_name,p_sender_mobile,p_beneficiary_name,p_beneficiary_mobile,p_beneficiary_bank,p_beneficiary_ifsc,p_beneficiary_account,p_upi_id,p_amount,p_service_fee,p_portal_commission,p_fee_source,p_paid_from,p_customer_pay_method,p_pay_from_instrument_id,p_pay_from_method,p_receiver_name,p_portal_charge);
  PERFORM public.idempotency_commit('create_business_txn',p_idempotency_key,'COMPLETED',(v_result->>'id')::uuid,v_result);
  RETURN v_result;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.create_business_txn_idempotent(text,date,timestamptz,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,text,uuid,text,text,numeric,text) TO authenticated,service_role;

REVOKE EXECUTE ON FUNCTION public.record_invoice_payment(uuid,text,numeric,uuid) FROM authenticated;
CREATE OR REPLACE FUNCTION public.record_invoice_payment_idempotent(p_invoice_id uuid,p_method text,p_amount numeric,p_instrument_id uuid DEFAULT NULL,p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_back_office() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  v_gate:=public.idempotency_acquire('record_invoice_payment',p_idempotency_key,jsonb_build_object('p_invoice_id',p_invoice_id,'p_method',p_method,'p_amount',p_amount,'p_instrument_id',p_instrument_id));
  IF v_gate->>'status'='REPLAY' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.record_invoice_payment(p_invoice_id,p_method,p_amount,p_instrument_id);
  PERFORM public.idempotency_commit('record_invoice_payment',p_idempotency_key,'COMPLETED',p_invoice_id,v_result);
  RETURN v_result;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment_idempotent(uuid,text,numeric,uuid,text) TO authenticated,service_role;

REVOKE EXECUTE ON FUNCTION public.cancel_invoice(uuid,text) FROM authenticated;
CREATE OR REPLACE FUNCTION public.cancel_invoice_idempotent(p_invoice_id uuid,p_reason text DEFAULT 'Cancelled by Administrator',p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: Only Admin can cancel/void invoices'; END IF;
  v_gate:=public.idempotency_acquire('cancel_invoice',p_idempotency_key,jsonb_build_object('p_invoice_id',p_invoice_id,'p_reason',p_reason));
  IF v_gate->>'status'='REPLAY' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.cancel_invoice(p_invoice_id,p_reason);
  PERFORM public.idempotency_commit('cancel_invoice',p_idempotency_key,'COMPLETED',p_invoice_id,v_result);
  RETURN v_result;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.cancel_invoice_idempotent(uuid,text,text) TO authenticated,service_role;

REVOKE EXECUTE ON FUNCTION public.cancel_quick_sale(uuid) FROM authenticated;
CREATE OR REPLACE FUNCTION public.cancel_quick_sale_idempotent(p_sale_id uuid,p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_back_office() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  v_gate:=public.idempotency_acquire('cancel_quick_sale',p_idempotency_key,jsonb_build_object('p_sale_id',p_sale_id));
  IF v_gate->>'status'='REPLAY' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.cancel_quick_sale(p_sale_id);
  PERFORM public.idempotency_commit('cancel_quick_sale',p_idempotency_key,'COMPLETED',p_sale_id,v_result);
  RETURN v_result;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.cancel_quick_sale_idempotent(uuid,text) TO authenticated,service_role;

REVOKE EXECUTE ON FUNCTION public.reverse_business_txn(uuid,text) FROM authenticated;
CREATE OR REPLACE FUNCTION public.reverse_business_txn_idempotent(p_txn_id uuid,p_reason text,p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_back_office() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  v_gate:=public.idempotency_acquire('reverse_business_txn',p_idempotency_key,jsonb_build_object('p_txn_id',p_txn_id,'p_reason',p_reason));
  IF v_gate->>'status'='REPLAY' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.reverse_business_txn(p_txn_id,p_reason);
  PERFORM public.idempotency_commit('reverse_business_txn',p_idempotency_key,'COMPLETED',p_txn_id,v_result);
  RETURN v_result;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.reverse_business_txn_idempotent(uuid,text,text) TO authenticated,service_role;

-- High-risk original RPCs are server-side only. Client calls must use the
-- idempotent wrappers above.
REVOKE EXECUTE ON FUNCTION public.create_sale(uuid,date,numeric,numeric,numeric,jsonb,jsonb,numeric,text,uuid,numeric,text,text,text,text,numeric,numeric,numeric,numeric,boolean) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.record_quick_sale(date,numeric,numeric,uuid,uuid,uuid,text,numeric,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.create_business_txn(text,date,timestamptz,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,text,uuid,text,text,numeric) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.record_invoice_payment(uuid,text,numeric,uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_invoice(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_quick_sale(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_business_txn(uuid,text) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.create_sale(uuid,date,numeric,numeric,numeric,jsonb,jsonb,numeric,text,uuid,numeric,text,text,text,text,numeric,numeric,numeric,numeric,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_quick_sale(date,numeric,numeric,uuid,uuid,uuid,text,numeric,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_business_txn(text,date,timestamptz,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,text,uuid,text,text,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid,text,numeric,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_quick_sale(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_business_txn(uuid,text) TO service_role;

COMMIT;
