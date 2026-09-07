-- 20260907_12_idempotent_lifecycle_wrappers.sql
-- Adds request-idempotency to the remaining high-risk lifecycle RPCs.
-- Existing canonical implementations remain the inner mutation workers.

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
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('edit_invoice',p_idempotency_key,jsonb_build_object(
    'p_invoice_id',p_invoice_id,'p_customer_id',p_customer_id,'p_invoice_date',p_invoice_date,
    'p_subtotal',p_subtotal,'p_discount',p_discount,'p_total',p_total,
    'p_payments',p_payments,'p_items',p_items,'p_reason',p_reason));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.edit_invoice(p_invoice_id,p_customer_id,p_invoice_date,p_subtotal,p_discount,p_total,p_payments,p_items,p_reason);
  PERFORM public.idempotency_commit('edit_invoice',p_idempotency_key,'completed',p_invoice_id,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_business_txn(
  p_txn_id uuid,
  p_transaction_date date,
  p_transaction_timestamp timestamptz,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_remarks text,
  p_bank_id uuid,
  p_portal_id uuid,
  p_merchant_qr_id uuid,
  p_aadhaar_last4 text,
  p_transfer_method text,
  p_sender_name text,
  p_sender_mobile text,
  p_beneficiary_name text,
  p_beneficiary_mobile text,
  p_beneficiary_bank text,
  p_beneficiary_ifsc text,
  p_beneficiary_account text,
  p_upi_id text,
  p_amount numeric,
  p_service_fee numeric,
  p_portal_commission numeric,
  p_fee_source text,
  p_paid_from text,
  p_customer_pay_method text,
  p_pay_from_instrument_id uuid,
  p_pay_from_method text,
  p_receiver_name text,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('update_business_txn',p_idempotency_key,jsonb_build_object(
    'p_txn_id',p_txn_id,'p_transaction_date',p_transaction_date,'p_transaction_timestamp',p_transaction_timestamp,
    'p_customer_id',p_customer_id,'p_customer_mobile',p_customer_mobile,'p_reference',p_reference,
    'p_remarks',p_remarks,'p_bank_id',p_bank_id,'p_portal_id',p_portal_id,'p_merchant_qr_id',p_merchant_qr_id,
    'p_aadhaar_last4',p_aadhaar_last4,'p_transfer_method',p_transfer_method,'p_sender_name',p_sender_name,
    'p_sender_mobile',p_sender_mobile,'p_beneficiary_name',p_beneficiary_name,'p_beneficiary_mobile',p_beneficiary_mobile,
    'p_beneficiary_bank',p_beneficiary_bank,'p_beneficiary_ifsc',p_beneficiary_ifsc,'p_beneficiary_account',p_beneficiary_account,
    'p_upi_id',p_upi_id,'p_amount',p_amount,'p_service_fee',p_service_fee,'p_portal_commission',p_portal_commission,
    'p_fee_source',p_fee_source,'p_paid_from',p_paid_from,'p_customer_pay_method',p_customer_pay_method,
    'p_pay_from_instrument_id',p_pay_from_instrument_id,'p_pay_from_method',p_pay_from_method,'p_receiver_name',p_receiver_name));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.update_business_txn(p_txn_id,p_transaction_date,p_transaction_timestamp,p_customer_id,p_customer_mobile,p_reference,p_remarks,p_bank_id,p_portal_id,p_merchant_qr_id,p_aadhaar_last4,p_transfer_method,p_sender_name,p_sender_mobile,p_beneficiary_name,p_beneficiary_mobile,p_beneficiary_bank,p_beneficiary_ifsc,p_beneficiary_account,p_upi_id,p_amount,p_service_fee,p_portal_commission,p_fee_source,p_paid_from,p_customer_pay_method,p_pay_from_instrument_id,p_pay_from_method,p_receiver_name);
  PERFORM public.idempotency_commit('update_business_txn',p_idempotency_key,'completed',p_txn_id,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_advance(
  p_customer_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_note text,
  p_reference text,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('record_advance',p_idempotency_key,jsonb_build_object('p_customer_id',p_customer_id,'p_amount',p_amount,'p_entry_date',p_entry_date,'p_note',p_note,'p_reference',p_reference));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.record_advance(p_customer_id,p_amount,p_entry_date,p_note,p_reference);
  PERFORM public.idempotency_commit('record_advance',p_idempotency_key,'completed',NULL,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.return_advance(
  p_customer_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_note text,
  p_reference text,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('return_advance',p_idempotency_key,jsonb_build_object('p_customer_id',p_customer_id,'p_amount',p_amount,'p_entry_date',p_entry_date,'p_note',p_note,'p_reference',p_reference));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.return_advance(p_customer_id,p_amount,p_entry_date,p_note,p_reference);
  PERFORM public.idempotency_commit('return_advance',p_idempotency_key,'completed',NULL,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_return(
  p_return_id uuid,
  p_items jsonb,
  p_refund_amount numeric,
  p_refund_method text,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('process_return',p_idempotency_key,jsonb_build_object('p_return_id',p_return_id,'p_items',p_items,'p_refund_amount',p_refund_amount,'p_refund_method',p_refund_method,'p_reason',p_reason));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.process_return(p_return_id,p_items,p_refund_amount,p_refund_method,p_reason);
  PERFORM public.idempotency_commit('process_return',p_idempotency_key,'completed',p_return_id,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_expense(
  p_expense_id uuid,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('cancel_expense',p_idempotency_key,jsonb_build_object('p_expense_id',p_expense_id));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.cancel_expense(p_expense_id);
  PERFORM public.idempotency_commit('cancel_expense',p_idempotency_key,'completed',p_expense_id,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_opening_balance(
  p_account_type text,
  p_amount numeric,
  p_opening_date date,
  p_instrument_id uuid,
  p_note text,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  v_gate:=public.idempotency_acquire('set_opening_balance',p_idempotency_key,jsonb_build_object('p_account_type',p_account_type,'p_amount',p_amount,'p_opening_date',p_opening_date,'p_instrument_id',p_instrument_id,'p_note',p_note));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.set_opening_balance(p_account_type,p_amount,p_opening_date,p_instrument_id,p_note);
  PERFORM public.idempotency_commit('set_opening_balance',p_idempotency_key,'completed',NULL,v_result);
  RETURN v_result;
END;
$function$;

-- The idempotency actor/commit helpers are callable only by wrappers/server.
REVOKE EXECUTE ON FUNCTION public.edit_invoice(uuid,uuid,date,numeric,numeric,numeric,jsonb,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_invoice(uuid,uuid,date,numeric,numeric,numeric,jsonb,jsonb,text,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_business_txn(uuid,date,timestamptz,uuid,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,text,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_business_txn(uuid,date,timestamptz,uuid,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,text,uuid,text,text,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.record_advance(uuid,numeric,date,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_advance(uuid,numeric,date,text,text,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.return_advance(uuid,numeric,date,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_advance(uuid,numeric,date,text,text,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.process_return(uuid,jsonb,numeric,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_return(uuid,jsonb,numeric,text,text,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cancel_expense(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_expense(uuid,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_opening_balance(text,numeric,date,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_opening_balance(text,numeric,date,uuid,text,text) TO authenticated, service_role;

COMMIT;
