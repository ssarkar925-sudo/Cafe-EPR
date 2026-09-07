-- 20260907_05_finalize_rpc_guards_and_cash_append_only.sql
-- Finalizes explicit authorization on high-risk wrappers and restores strictly
-- append-only cash-entry semantics.

BEGIN;

CREATE OR REPLACE FUNCTION public.dedupe_transaction_money_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_instrument uuid;
BEGIN
  IF NEW.ref_type <> 'transaction' OR NEW.ref_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.instrument_id IS NULL THEN
    v_instrument := public.resolve_payment_instrument(NEW.method, NULL);
    IF v_instrument IS NOT NULL THEN NEW.instrument_id := v_instrument; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_invoice_multi_payment(
  p_invoice_id uuid, p_allocations jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_invoice record; v_item jsonb; v_method text; v_inst uuid; v_inst_type text; v_amount numeric; v_total numeric:=0; v_due_after numeric; v_customer_id uuid;
BEGIN
  IF auth.role()<>'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT public.is_back_office() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations)<>'array' OR jsonb_array_length(p_allocations)=0 THEN RAISE EXCEPTION 'At least one payment allocation is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('erp:invoice:'||p_invoice_id::text,0));
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_invoice.status IN ('cancelled','returned') THEN RAISE EXCEPTION 'Cannot pay a cancelled or returned invoice'; END IF;
  v_customer_id:=v_invoice.customer_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
    v_amount:=round(coalesce((v_item->>'amount')::numeric,0),2);
    IF v_amount<=0 THEN RAISE EXCEPTION 'Each payment allocation must be positive'; END IF;
    v_total:=v_total+v_amount;
  END LOOP;
  IF v_total>greatest(0,coalesce(v_invoice.total,0)-coalesce(v_invoice.paid,0))+0.005 THEN RAISE EXCEPTION 'Payment allocations exceed outstanding due'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
    v_amount:=round((v_item->>'amount')::numeric,2);
    v_method:=lower(coalesce(nullif(btrim(v_item->>'method'),''),'cash'));
    v_inst:=nullif(v_item->>'instrument_id','')::uuid;
    IF v_inst IS NOT NULL THEN
      SELECT lower(type) INTO v_inst_type FROM public.payment_instruments WHERE id=v_inst AND is_active=true;
      IF v_inst_type IS NULL THEN RAISE EXCEPTION 'Unknown or inactive payment instrument'; END IF;
      v_method:=CASE v_inst_type WHEN 'cash' THEN 'cash' WHEN 'bank' THEN 'bank' WHEN 'wallet' THEN 'wallet' WHEN 'upi' THEN 'upi' WHEN 'upi_qr' THEN 'upi' WHEN 'debit_card' THEN 'debit_card' WHEN 'credit_card' THEN 'credit_card' ELSE NULL END;
      IF v_method IS NULL THEN RAISE EXCEPTION 'Payment instrument type % cannot be used for invoice payment',v_inst_type; END IF;
    ELSE
      IF v_method='card' THEN SELECT id INTO v_inst FROM public.payment_instruments WHERE is_active AND lower(type) IN ('debit_card','credit_card') ORDER BY created_at LIMIT 1;
      ELSIF v_method='upi' THEN SELECT id INTO v_inst FROM public.payment_instruments WHERE is_active AND lower(type) IN ('upi','upi_qr') ORDER BY created_at LIMIT 1;
      ELSIF v_method IN ('bank','wallet','cash') THEN SELECT id INTO v_inst FROM public.payment_instruments WHERE is_active AND lower(type)=v_method ORDER BY created_at LIMIT 1; END IF;
      IF v_inst IS NULL THEN RAISE EXCEPTION 'No active payment instrument configured for %',v_method; END IF;
    END IF;
    INSERT INTO public.payments(invoice_id,method,amount,instrument_id) VALUES(p_invoice_id,v_method,v_amount,v_inst);
    INSERT INTO public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id) VALUES(current_date,v_method,'in',v_amount,'Payment '||v_invoice.invoice_number||' ('||upper(v_method)||')','invoice',p_invoice_id,v_inst);
  END LOOP;
  v_due_after:=greatest(0,round((coalesce(v_invoice.total,0)-coalesce(v_invoice.paid,0))-v_total,2));
  UPDATE public.invoices SET paid=coalesce(paid,0)+v_total,due=v_due_after,status=CASE WHEN v_due_after<=0.005 THEN 'paid' ELSE 'partial' END WHERE id=p_invoice_id;
  IF v_customer_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('erp:customer:'||v_customer_id::text,0));
    UPDATE public.customers SET balance=balance-v_total,updated_at=now() WHERE id=v_customer_id;
    INSERT INTO public.customer_ledger(customer_id,entry_date,type,description,credit,balance_after,ref_id) VALUES(v_customer_id,current_date,'payment','Payment on '||v_invoice.invoice_number||' ('||jsonb_array_length(p_allocations)||' tenders)',v_total,(SELECT balance FROM public.customers WHERE id=v_customer_id),p_invoice_id);
  END IF;
  RETURN (SELECT jsonb_build_object('id',id,'invoice_number',invoice_number,'total',total,'paid',paid,'due',due,'status',status,'payment_count',jsonb_array_length(p_allocations)) FROM public.invoices WHERE id=p_invoice_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_transaction_customer_payment_split(
  p_txn_id uuid, p_allocations jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_txn record; v_item jsonb; v_method text; v_inst uuid; v_inst_type text; v_amount numeric; v_total numeric:=0; v_due numeric; v_prev numeric; v_new numeric;
BEGIN
  IF auth.role()<>'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT public.is_back_office() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  END IF;
  PERFORM set_config('erp.financial_edit_in_progress','on',true);
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations)<>'array' THEN RAISE EXCEPTION 'Payment allocations must be an array'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('erp:transaction:'||p_txn_id::text,0));
  SELECT * INTO v_txn FROM public.transactions WHERE id=p_txn_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
    v_amount:=round(coalesce((v_item->>'amount')::numeric,0),2);
    IF v_amount<=0 THEN RAISE EXCEPTION 'Each payment allocation must be positive'; END IF;
    v_total:=v_total+v_amount;
  END LOOP;
  IF v_total>coalesce(v_txn.total_amount,v_txn.amount+coalesce(v_txn.service_fee,0)+coalesce(v_txn.portal_charge,0))+0.005 THEN RAISE EXCEPTION 'Payment allocations exceed transaction total'; END IF;
  IF v_txn.customer_id IS NULL AND v_total<coalesce(v_txn.total_amount,v_txn.amount+coalesce(v_txn.service_fee,0)+coalesce(v_txn.portal_charge,0))-0.005 THEN RAISE EXCEPTION 'Customer is required when a transaction remains due'; END IF;
  DELETE FROM public.cash_entries WHERE ref_type='transaction' AND ref_id=p_txn_id AND direction='in';
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
    v_amount:=round((v_item->>'amount')::numeric,2);
    v_method:=lower(coalesce(nullif(btrim(v_item->>'method'),''),'cash'));
    v_inst:=nullif(v_item->>'instrument_id','')::uuid;
    IF v_inst IS NOT NULL THEN
      SELECT type INTO v_inst_type FROM public.payment_instruments WHERE id=v_inst AND is_active=true;
      IF v_inst_type IS NULL THEN RAISE EXCEPTION 'Unknown or inactive payment instrument'; END IF;
      v_method:=CASE v_inst_type WHEN 'cash' THEN 'cash' WHEN 'bank' THEN 'bank' WHEN 'wallet' THEN 'wallet' WHEN 'upi' THEN 'upi' WHEN 'upi_qr' THEN 'upi' WHEN 'debit_card' THEN 'debit_card' WHEN 'credit_card' THEN 'credit_card' ELSE NULL END;
      IF v_method IS NULL THEN RAISE EXCEPTION 'Unsupported payment instrument type'; END IF;
    ELSE
      IF v_method='card' THEN SELECT id INTO v_inst FROM public.payment_instruments WHERE is_active AND lower(type) IN ('debit_card','credit_card') ORDER BY created_at LIMIT 1;
      ELSIF v_method='upi' THEN SELECT id INTO v_inst FROM public.payment_instruments WHERE is_active AND lower(type) IN ('upi','upi_qr') ORDER BY created_at LIMIT 1;
      ELSE SELECT id INTO v_inst FROM public.payment_instruments WHERE is_active AND lower(type)=v_method ORDER BY created_at LIMIT 1; END IF;
    END IF;
    IF v_inst IS NULL THEN RAISE EXCEPTION 'No active payment instrument configured for %',v_method; END IF;
    INSERT INTO public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id) VALUES(current_date,v_method,'in',v_amount,'Customer collection '||v_txn.transaction_number||' ('||upper(v_method)||')','transaction',p_txn_id,v_inst);
  END LOOP;
  v_due:=greatest(0,round(coalesce(v_txn.total_amount,v_txn.amount+coalesce(v_txn.service_fee,0)+coalesce(v_txn.portal_charge,0))-v_total,2));
  IF v_due>0 AND v_txn.customer_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('erp:customer:'||v_txn.customer_id::text,0));
    SELECT coalesce(balance,0) INTO v_prev FROM public.customers WHERE id=v_txn.customer_id FOR UPDATE;
    v_new:=round(v_prev+v_due,2);
    UPDATE public.customers SET balance=v_new,updated_at=now() WHERE id=v_txn.customer_id;
    INSERT INTO public.customer_ledger(customer_id,entry_date,type,description,debit,credit,balance_after,ref_id) VALUES(v_txn.customer_id,current_date,'transaction',v_txn.transaction_number||' balance due',v_due,0,v_new,p_txn_id);
  END IF;
  UPDATE public.transactions SET customer_collected_amount=v_total,customer_due_amount=v_due,customer_collection_method=CASE WHEN v_total>0 THEN lower(coalesce(p_allocations->0->>'method','cash')) ELSE 'due' END,customer_pay_method=CASE WHEN v_total>0 THEN lower(coalesce(p_allocations->0->>'method','cash')) ELSE 'due' END,cash_in=CASE WHEN lower(coalesce(p_allocations->0->>'method',''))='cash' THEN v_total ELSE 0 END,bank_in=CASE WHEN lower(coalesce(p_allocations->0->>'method',''))='bank' THEN v_total ELSE 0 END,updated_at=now() WHERE id=p_txn_id;
  RETURN jsonb_build_object('success',true,'id',p_txn_id,'total_collected',v_total,'customer_due',v_due,'payment_count',jsonb_array_length(p_allocations));
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_dmt_business_txn_multi_collection(
  p_service_type text,
  p_transaction_date date,
  p_transaction_timestamp timestamptz,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_remarks text,
  p_status text,
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
  p_fee_source text DEFAULT NULL,
  p_paid_from text DEFAULT NULL,
  p_pay_from_instrument_id uuid DEFAULT NULL,
  p_pay_from_method text DEFAULT 'bank',
  p_receiver_name text DEFAULT NULL,
  p_portal_charge numeric DEFAULT 0,
  p_customer_collection_allocations jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_total numeric:=round(coalesce(p_amount,0)+coalesce(p_service_fee,0)+coalesce(p_portal_charge,0),2); v_paid numeric:=0; v_due numeric; v_item jsonb; v_method text; v_inst uuid; v_result jsonb; v_txn uuid;
BEGIN
  IF auth.role()<>'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT public.is_back_office() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  END IF;
  IF p_customer_collection_allocations IS NULL OR jsonb_typeof(p_customer_collection_allocations)<>'array' THEN RAISE EXCEPTION 'Customer collection allocations must be an array'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_customer_collection_allocations) LOOP v_paid:=v_paid+round(coalesce((v_item->>'amount')::numeric,0),2); END LOOP;
  IF v_paid>v_total+0.005 THEN RAISE EXCEPTION 'Customer collections exceed DMT total'; END IF;
  v_due:=greatest(0,round(v_total-v_paid,2));
  IF v_due>0 AND p_customer_id IS NULL THEN RAISE EXCEPTION 'Please select a customer to record the unpaid DMT balance'; END IF;
  v_method:=CASE WHEN v_paid>0 THEN lower(coalesce(nullif(p_customer_collection_allocations->0->>'method',''),'cash')) ELSE 'due' END;
  v_result:=public.create_dmt_business_txn(p_service_type,p_transaction_date,p_transaction_timestamp,p_customer_id,p_customer_mobile,p_reference,p_remarks,p_status,p_bank_id,p_portal_id,p_merchant_qr_id,p_aadhaar_last4,p_transfer_method,p_sender_name,p_sender_mobile,p_beneficiary_name,p_beneficiary_mobile,p_beneficiary_bank,p_beneficiary_ifsc,p_beneficiary_account,p_upi_id,p_amount,p_service_fee,p_portal_commission,p_fee_source,p_paid_from,CASE WHEN v_paid>0 THEN v_method ELSE 'due' END,p_pay_from_instrument_id,p_pay_from_method,p_receiver_name,p_portal_charge,v_paid,v_due,v_method,NULL);
  v_txn:=(v_result->>'id')::uuid;
  PERFORM set_config('erp.internal_cash_mutation_authorized','on',true);
  DELETE FROM public.cash_entries WHERE ref_type='transaction' AND ref_id=v_txn AND direction='in';
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_customer_collection_allocations) LOOP
    v_method:=lower(coalesce(nullif(btrim(v_item->>'method'),''),'cash')); v_inst:=nullif(v_item->>'instrument_id','')::uuid;
    IF v_inst IS NULL THEN
      IF v_method='card' THEN SELECT id INTO v_inst FROM public.payment_instruments WHERE is_active AND lower(type) IN ('debit_card','credit_card') ORDER BY created_at LIMIT 1;
      ELSIF v_method='upi' THEN SELECT id INTO v_inst FROM public.payment_instruments WHERE is_active AND lower(type) IN ('upi','upi_qr') ORDER BY created_at LIMIT 1;
      ELSE SELECT id INTO v_inst FROM public.payment_instruments WHERE is_active AND lower(type)=v_method ORDER BY created_at LIMIT 1; END IF;
    END IF;
    IF v_inst IS NULL THEN RAISE EXCEPTION 'No active payment instrument configured for %',v_method; END IF;
    INSERT INTO public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id) VALUES(p_transaction_date,CASE WHEN v_method IN ('qr','upi_qr') THEN 'upi' ELSE v_method END,'in',round((v_item->>'amount')::numeric,2),'DMT '||(v_result->>'transaction_number')||' customer collection ('||upper(v_method)||')','transaction',v_txn,v_inst);
  END LOOP;
  RETURN jsonb_build_object('success',true,'id',v_txn,'transaction_number',v_result->>'transaction_number','total_collected',v_paid,'customer_due',v_due,'payment_count',jsonb_array_length(p_customer_collection_allocations));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_invoice_multi_payment(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_multi_payment(uuid,jsonb) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.record_customer_multi_payment(uuid,date,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_customer_multi_payment(uuid,date,jsonb,text) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.apply_transaction_customer_payment_split(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_transaction_customer_payment_split(uuid,jsonb) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.create_dmt_business_txn_multi_collection(text,date,timestamptz,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,uuid,text,text,numeric,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_dmt_business_txn_multi_collection(text,date,timestamptz,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,uuid,text,text,numeric,jsonb) TO authenticated,service_role;

COMMIT;
