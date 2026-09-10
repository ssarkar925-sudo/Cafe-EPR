-- Fix update_business_txn reading v_txn.service_type before v_txn is loaded.
-- The locked transaction is now loaded before any service-specific validation.
CREATE OR REPLACE FUNCTION public.update_business_txn(p_txn_id uuid, p_transaction_date date, p_transaction_timestamp timestamptz, p_customer_id uuid, p_customer_mobile text, p_reference text, p_remarks text, p_bank_id uuid, p_portal_id uuid, p_merchant_qr_id uuid, p_aadhaar_last4 text, p_transfer_method text, p_sender_name text, p_sender_mobile text, p_beneficiary_name text, p_beneficiary_mobile text, p_beneficiary_bank text, p_beneficiary_ifsc text, p_beneficiary_account text, p_upi_id text, p_amount numeric, p_service_fee numeric, p_portal_commission numeric, p_fee_source text DEFAULT NULL, p_paid_from text DEFAULT NULL, p_customer_pay_method text DEFAULT NULL, p_pay_from_instrument_id uuid DEFAULT NULL, p_pay_from_method text DEFAULT 'bank', p_receiver_name text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  v_txn record;
  v_cash_out numeric := 0; v_cash_in numeric := 0; v_bank_out numeric := 0; v_bank_in numeric := 0; v_pool_out numeric := 0; v_pool_credit numeric := 0; v_pool_type text; v_upi_fee numeric := 0; v_fee numeric := coalesce(p_service_fee,0); v_final_pay_from_method text := 'bank'; v_resolved_pay_from_id uuid := p_pay_from_instrument_id; v_cash_id uuid; v_upi_id uuid; v_collection_id uuid; v_collection_method text; v_collection numeric := 0; r record;
begin
  perform set_config('erp.financial_edit_in_progress','on',true);
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_service_fee is null or p_service_fee < 0 then raise exception 'Service fee cannot be negative'; end if;
  if p_portal_commission is null or p_portal_commission < 0 then raise exception 'Portal commission cannot be negative'; end if;
  p_fee_source := public.canonical_transaction_fee_source(p_fee_source,p_customer_pay_method);

  perform set_config('erp.internal_cash_mutation_authorized','on',true);
  perform pg_advisory_xact_lock(hashtextextended('erp:transaction-update:'||p_txn_id::text,0));
  select * into v_txn from public.transactions where id=p_txn_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_txn.status <> 'success' then raise exception 'Only successful transactions can be edited'; end if;

  -- Critical ordering fix: v_txn is populated before service_type is read.
  if v_txn.service_type='upi' and coalesce(p_customer_pay_method,'qr') <> 'cash' and p_fee_source in ('cut_from_withdrawal','cut_from_payment') and v_fee > p_amount then
    raise exception 'UPI cash-out fee cannot exceed UPI amount';
  end if;

  select id into v_cash_id from public.payment_instruments where is_active=true and lower(type)='cash' order by created_at asc limit 1;
  if coalesce(p_merchant_qr_id,v_txn.merchant_qr_id) is not null then select payment_instrument_id into v_upi_id from public.upi_merchant_qrs where id=coalesce(p_merchant_qr_id,v_txn.merchant_qr_id); end if;
  if v_upi_id is null then select id into v_upi_id from public.payment_instruments where is_active=true and lower(type) in ('upi','upi_qr') order by created_at asc limit 1; end if;

  if v_resolved_pay_from_id is null then
    if coalesce(p_paid_from,v_txn.paid_from)='portal' and coalesce(p_portal_id,v_txn.portal_id) is not null then select ap.payment_instrument_id into v_resolved_pay_from_id from public.aeps_portals ap where ap.id=coalesce(p_portal_id,v_txn.portal_id);
    elsif v_txn.service_type='dmt' or coalesce(p_paid_from,v_txn.paid_from)='bank' then select id into v_resolved_pay_from_id from public.payment_instruments where is_active=true and lower(type) in ('bank','debit_card') order by created_at asc limit 1;
    elsif v_txn.service_type='aeps' and coalesce(p_portal_id,v_txn.portal_id) is not null then select ap.payment_instrument_id into v_resolved_pay_from_id from public.aeps_portals ap where ap.id=coalesce(p_portal_id,v_txn.portal_id); end if;
  end if;
  if v_resolved_pay_from_id is not null then select case lower(type) when 'aeps_portal' then 'aeps' when 'dmt_portal' then 'dmt' when 'upi_qr' then 'upi' else lower(type) end into v_final_pay_from_method from public.payment_instruments where id=v_resolved_pay_from_id; else v_final_pay_from_method:=coalesce(p_pay_from_method,'bank'); end if;

  for r in select * from public.cash_entries where ref_type='transaction' and ref_id=p_txn_id loop
    insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id) values(coalesce(v_txn.transaction_date,current_date),r.method,case when r.direction='out' then 'in' else 'out' end,r.amount,'Reversal on edit: '||coalesce(r.description,upper(v_txn.service_type)||' '||v_txn.transaction_number),'transaction',p_txn_id,r.instrument_id);
  end loop;

  if v_txn.service_type='aeps' then
    if p_fee_source='upi' then v_cash_out:=p_amount; v_upi_fee:=v_fee; elsif p_fee_source='separate_cash' then v_cash_out:=p_amount; v_cash_in:=v_fee; else v_cash_out:=greatest(0,p_amount-v_fee); end if;
    v_pool_credit:=p_amount+coalesce(p_portal_commission,0); v_pool_type:='aeps';
    if v_cash_out>0 then insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id) values(p_transaction_date,'cash','out',v_cash_out,'AEPS '||v_txn.transaction_number||' cash payout','transaction',p_txn_id,v_cash_id); end if;
    if v_cash_in>0 then insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id) values(p_transaction_date,'cash','in',v_cash_in,'AEPS '||v_txn.transaction_number||' fee received in cash','transaction',p_txn_id,v_cash_id); end if;
    if v_upi_fee>0 and v_upi_id is not null then insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id) values(p_transaction_date,'upi','in',v_upi_fee,'AEPS '||v_txn.transaction_number||' fee received via UPI','transaction',p_txn_id,v_upi_id); end if;
  elsif v_txn.service_type='dmt' then
    v_collection_method:=lower(coalesce(p_customer_pay_method,'cash')); v_collection:=p_amount+v_fee;
    if v_collection_method='cash' then v_collection_id:=v_cash_id; elsif v_collection_method in ('upi','qr','upi_qr') then v_collection_id:=v_upi_id; elsif v_collection_method='bank' then select id into v_collection_id from public.payment_instruments where is_active=true and lower(type) in ('bank','debit_card') order by created_at asc limit 1; elsif v_collection_method='wallet' then select id into v_collection_id from public.payment_instruments where is_active=true and lower(type)='wallet' order by created_at asc limit 1; end if;
    if v_collection_method<>'due' and v_collection>0 then insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id) values(p_transaction_date,case when v_collection_method in ('qr','upi_qr') then 'upi' else v_collection_method end,'in',v_collection,'DMT '||v_txn.transaction_number||' customer collection','transaction',p_txn_id,v_collection_id); end if;
    if p_amount>0 and v_resolved_pay_from_id is not null then insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id) values(p_transaction_date,v_final_pay_from_method,'out',p_amount,'DMT '||v_txn.transaction_number||' funded from '||(select name from public.payment_instruments where id=v_resolved_pay_from_id),'transaction',p_txn_id,v_resolved_pay_from_id); end if;
    v_cash_in:=case when v_collection_method='cash' then v_collection else 0 end; v_bank_in:=case when v_collection_method='bank' then v_collection else 0 end; v_bank_out:=case when v_final_pay_from_method='bank' then p_amount else 0 end;
  elsif v_txn.service_type='upi' then
    if coalesce(p_customer_pay_method,'qr')='cash' then v_cash_in:=p_amount+v_fee; v_cash_out:=p_amount; insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id) values(p_transaction_date,'cash','in',v_cash_in,'UPI '||v_txn.transaction_number||' received in cash','transaction',p_txn_id,v_cash_id);
    else if p_fee_source in ('customer_paid_extra','separate_cash') then v_pool_credit:=p_amount+v_fee; v_cash_out:=p_amount; elsif p_fee_source in ('cut_from_payment','cut_from_withdrawal') then v_pool_credit:=p_amount; v_cash_out:=greatest(0,p_amount-v_fee); else v_pool_credit:=p_amount; v_cash_out:=greatest(0,p_amount-v_fee); end if; v_pool_type:='upi_qr'; insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id) values(p_transaction_date,'upi','in',v_pool_credit,'UPI '||v_txn.transaction_number||' received via QR','transaction',p_txn_id,v_upi_id); end if;
    insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id) values(p_transaction_date,'cash','out',v_cash_out,'UPI '||v_txn.transaction_number||' cash payout','transaction',p_txn_id,v_cash_id);
  end if;

  update public.transactions set transaction_date=p_transaction_date,transaction_timestamp=coalesce(p_transaction_timestamp,p_transaction_date::timestamptz),customer_id=p_customer_id,customer_mobile=p_customer_mobile,reference=nullif(p_reference,''),remarks=p_remarks,bank_id=p_bank_id,portal_id=p_portal_id,merchant_qr_id=p_merchant_qr_id,aadhaar_last4=p_aadhaar_last4,transfer_method=p_transfer_method,sender_name=p_sender_name,sender_mobile=p_sender_mobile,beneficiary_name=p_beneficiary_name,beneficiary_mobile=p_beneficiary_mobile,beneficiary_bank=p_beneficiary_bank,beneficiary_ifsc=p_beneficiary_ifsc,beneficiary_account=p_beneficiary_account,upi_id=p_upi_id,receiver_name=p_receiver_name,amount=p_amount,service_fee=v_fee,portal_commission=coalesce(p_portal_commission,0),fee_source=p_fee_source,paid_from=p_paid_from,customer_pay_method=p_customer_pay_method,instrument_id=coalesce(v_resolved_pay_from_id,v_txn.instrument_id),pay_from_instrument_id=v_resolved_pay_from_id,pay_from_method=v_final_pay_from_method,cash_out=v_cash_out,cash_in=v_cash_in,bank_out=v_bank_out,bank_in=v_bank_in,pool_out=v_pool_out,pool_credit=v_pool_credit,pool_credit_type=v_pool_type,upi_fee=v_upi_fee,updated_at=now() where id=p_txn_id;
  insert into public.audit_logs(user_id,user_name,action,entity,entity_id,description,details) values(auth.uid(),null,'transaction_updated','transactions',p_txn_id::text,'Updated '||upper(v_txn.service_type)||' '||v_txn.transaction_number,jsonb_build_object('amount',p_amount,'reference',p_reference,'pay_from_instrument_id',v_resolved_pay_from_id,'pay_from_method',v_final_pay_from_method));
  return (select to_jsonb(t.*) from public.transactions t where t.id=p_txn_id);
end;
$$;