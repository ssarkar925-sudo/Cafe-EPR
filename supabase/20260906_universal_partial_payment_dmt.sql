-- Versioned DB migration for universal DMT partial collections.
-- The function below is an overload of create_dmt_business_txn that preserves
-- the existing DMT workflow while allowing an exact customer collection amount
-- and a Khata remainder.

CREATE OR REPLACE FUNCTION public.create_dmt_business_txn(
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
  p_customer_pay_method text DEFAULT NULL,
  p_pay_from_instrument_id uuid DEFAULT NULL,
  p_pay_from_method text DEFAULT 'bank',
  p_receiver_name text DEFAULT NULL,
  p_portal_charge numeric DEFAULT 0,
  p_customer_collected_amount numeric DEFAULT NULL,
  p_customer_due_amount numeric DEFAULT NULL,
  p_customer_collection_method text DEFAULT NULL,
  p_customer_collection_instrument_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
  v_txn_id uuid;
  v_total numeric;
  v_collection numeric;
  v_due numeric;
  v_method text;
  v_inst uuid;
  v_prev numeric;
  v_new numeric;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_service_type <> 'dmt' then raise exception 'This RPC only accepts DMT transactions'; end if;

  v_total := coalesce(p_amount,0) + coalesce(p_service_fee,0) + coalesce(p_portal_charge,0);
  v_collection := case when p_customer_collected_amount is null then v_total else greatest(0,round(p_customer_collected_amount,2)) end;
  v_due := case when p_customer_due_amount is null then greatest(0,round(v_total-v_collection,2)) else greatest(0,round(p_customer_due_amount,2)) end;
  if round(v_collection+v_due,2) > round(v_total+0.01,2) then raise exception 'Customer collection plus due exceeds DMT total'; end if;
  if v_due > 0 and p_customer_id is null then raise exception 'Please select a customer to record the unpaid DMT balance'; end if;

  v_method := lower(coalesce(nullif(trim(p_customer_collection_method),''), nullif(trim(p_customer_pay_method),''), case when v_collection>0 then 'cash' else 'due' end));
  if v_collection=0 then v_method:='due'; end if;

  -- Delegate the provider/funding/DMT creation to the existing implementation.
  v_result := public.create_dmt_business_txn(
    p_service_type,p_transaction_date,p_transaction_timestamp,p_customer_id,p_customer_mobile,p_reference,p_remarks,p_status,
    p_bank_id,p_portal_id,p_merchant_qr_id,p_aadhaar_last4,p_transfer_method,p_sender_name,p_sender_mobile,p_beneficiary_name,
    p_beneficiary_mobile,p_beneficiary_bank,p_beneficiary_ifsc,p_beneficiary_account,p_upi_id,p_amount,p_service_fee,
    p_portal_commission,p_fee_source,p_paid_from,case when v_collection>0 then v_method else 'due' end,
    p_pay_from_instrument_id,p_pay_from_method,p_receiver_name,p_portal_charge
  );
  v_txn_id := (v_result->>'id')::uuid;

  -- Replace the legacy full customer-collection leg with the exact paid amount.
  perform set_config('erp.internal_cash_mutation_authorized','on',true);
  delete from public.cash_entries where ref_type='transaction' and ref_id=v_txn_id and direction='in';

  if v_collection > 0 then
    if p_customer_collection_instrument_id is not null then
      v_inst := p_customer_collection_instrument_id;
    elsif v_method='cash' then
      select id into v_inst from public.payment_instruments where is_active and lower(type)='cash' order by created_at asc limit 1;
    elsif v_method in ('upi','qr','upi_qr') then
      select id into v_inst from public.payment_instruments where is_active and lower(type) in ('upi','upi_qr') order by created_at asc limit 1;
    elsif v_method='bank' then
      select id into v_inst from public.payment_instruments where is_active and lower(type)='bank' order by created_at asc limit 1;
    elsif v_method='wallet' then
      select id into v_inst from public.payment_instruments where is_active and lower(type)='wallet' order by created_at asc limit 1;
    elsif v_method='card' then
      select id into v_inst from public.payment_instruments where is_active and lower(type) in ('debit_card','credit_card') order by created_at asc limit 1;
    elsif v_method='debit_card' then
      select id into v_inst from public.payment_instruments where is_active and lower(type)='debit_card' order by created_at asc limit 1;
    elsif v_method in ('credit_card','credit') then
      select id into v_inst from public.payment_instruments where is_active and lower(type)='credit_card' order by created_at asc limit 1;
    end if;
    if v_inst is null then raise exception 'No active customer collection payment instrument is configured for %',v_method; end if;

    insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
    values(
      p_transaction_date,
      case when v_method in ('qr','upi_qr') then 'upi' else v_method end,
      'in',
      v_collection,
      'DMT '||(v_result->>'transaction_number')||' customer collection',
      'transaction',v_txn_id,v_inst
    );
  end if;

  if v_due > 0 then
    perform pg_advisory_xact_lock(hashtextextended('erp:customer:'||p_customer_id::text,0));
    select coalesce(balance,0),name into v_prev,v_name from public.customers where id=p_customer_id for update;
    if not found then raise exception 'Customer not found for DMT due'; end if;
    v_new := round(v_prev+v_due,2);
    update public.customers set balance=v_new,updated_at=now() where id=p_customer_id;
    insert into public.customer_ledger(customer_id,entry_date,type,description,debit,credit,balance_after,ref_id)
    values(p_customer_id,p_transaction_date,'dmt','DMT '||(v_result->>'transaction_number')||' balance due',v_due,0,v_new,v_txn_id);
  end if;

  update public.transactions set
    customer_pay_method=case when v_collection>0 then v_method else 'due' end,
    customer_collected_amount=v_collection,
    customer_due_amount=v_due,
    customer_collection_method=v_method,
    customer_collection_instrument_id=v_inst,
    cash_in=case when v_method='cash' then v_collection else 0 end,
    bank_in=case when v_method='bank' then v_collection else 0 end,
    updated_at=now()
  where id=v_txn_id;

  return jsonb_build_object(
    'success',true,
    'transaction_number',v_result->>'transaction_number',
    'id',v_txn_id,
    'total_collected',v_collection,
    'customer_due',v_due,
    'collection_method',v_method
  );
end;
$function$;
