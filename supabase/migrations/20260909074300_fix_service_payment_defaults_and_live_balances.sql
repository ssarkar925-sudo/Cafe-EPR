begin;

/* Expose the authoritative payment-instrument balance under the names used by the shared UI. */
alter table public.payment_instruments
  add column if not exists balance numeric generated always as (current_balance) stored;
alter table public.payment_instruments
  add column if not exists available_balance numeric generated always as (current_balance) stored;

/*
  Canonical customer-collection posting.
  When a normal customer payment method is selected but the browser has not supplied
  an allocation row, resolve the configured/default payment instrument server-side.
  This prevents the Bill Payment / Recharge / Google Play flows from incorrectly
  behaving as if the transaction is an unpaid Khata transaction.
*/
create or replace function public.apply_transaction_customer_payment_split(
  p_txn_id uuid,
  p_allocations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_txn record;
  v_item jsonb;
  v_method text;
  v_inst uuid;
  v_inst_type text;
  v_amount numeric;
  v_total numeric := 0;
  v_transaction_total numeric;
  v_due numeric;
  v_prev numeric;
  v_new numeric;
  v_cash_total numeric := 0;
  v_bank_total numeric := 0;
  v_normalized jsonb := '[]'::jsonb;
  v_requested_method text;
begin
  if auth.role()<>'service_role' then
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not public.is_back_office() then raise exception 'Forbidden'; end if;
  end if;

  perform set_config('erp.financial_edit_in_progress','on',true);
  if p_allocations is null or jsonb_typeof(p_allocations)<>'array' then
    raise exception 'Payment allocations must be an array';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('erp:transaction:'||p_txn_id::text,0));
  select * into v_txn from public.transactions where id=p_txn_id for update;
  if not found then raise exception 'Transaction not found'; end if;

  /* Customer-facing services calculate the collectible amount from amount + fees. */
  if lower(coalesce(v_txn.service_type,'')) in ('bill_payment','utility_bill','utility','google_play_recharge','google_play') then
    v_transaction_total:=round(coalesce(v_txn.amount,0)+coalesce(v_txn.service_fee,0)+coalesce(v_txn.portal_charge,0),2);
  else
    v_transaction_total:=round(coalesce(v_txn.total_amount,v_txn.amount+coalesce(v_txn.service_fee,0)+coalesce(v_txn.portal_charge,0)),2);
  end if;

  /*
    Non-due payment without explicit rows means: use the selected/configured
    collection method for the full collectible amount. This is intentionally
    server-side so the ledger remains correct even if the UI sends [] rows.
  */
  v_requested_method:=lower(coalesce(nullif(btrim(coalesce(v_txn.customer_pay_method,'')),''),'cash'));
  if jsonb_array_length(p_allocations)=0 and v_requested_method not in ('due','khata') and v_transaction_total>0 then
    v_inst:=public.resolve_payment_instrument(v_requested_method,null);
    p_allocations:=jsonb_build_array(
      jsonb_build_object('method',v_requested_method,'amount',v_transaction_total,'instrument_id',v_inst)
    );
  end if;

  for v_item in select value from jsonb_array_elements(p_allocations) loop
    v_amount:=round(coalesce((v_item->>'amount')::numeric,0),2);
    if v_amount<=0 then raise exception 'Each payment allocation must be positive'; end if;
    v_total:=v_total+v_amount;
    v_method:=lower(coalesce(nullif(btrim(v_item->>'method'),''),'cash'));
    v_inst:=nullif(v_item->>'instrument_id','')::uuid;
    if v_inst is not null then
      select type into v_inst_type
      from public.payment_instruments
      where id=v_inst and is_active=true;
      if v_inst_type is null then raise exception 'Unknown or inactive payment instrument'; end if;
      v_method:=case lower(v_inst_type)
        when 'cash' then 'cash'
        when 'bank' then 'bank'
        when 'wallet' then 'wallet'
        when 'upi' then 'upi'
        when 'upi_qr' then 'upi'
        when 'debit_card' then 'debit_card'
        when 'credit_card' then 'credit_card'
        else null end;
      if v_method is null then raise exception 'Unsupported payment instrument type'; end if;
    else
      if v_method='card' then
        select id into v_inst
        from public.payment_instruments
        where is_active and lower(type) in ('debit_card','credit_card')
        order by created_at limit 1;
      elsif v_method='upi' then
        select id into v_inst
        from public.payment_instruments
        where is_active and lower(type) in ('upi','upi_qr')
        order by created_at limit 1;
      else
        select id into v_inst
        from public.payment_instruments
        where is_active and lower(type)=v_method
        order by created_at limit 1;
      end if;
    end if;
    if v_inst is null then raise exception 'No active payment instrument configured for %',v_method; end if;
    v_normalized:=v_normalized||jsonb_build_array(
      jsonb_build_object('method',v_method,'amount',v_amount,'instrument_id',v_inst)
    );
  end loop;

  if v_total>v_transaction_total+0.005 then raise exception 'Payment allocations exceed transaction total'; end if;
  if v_txn.customer_id is null and v_total<v_transaction_total-0.005 then
    raise exception 'Customer is required when a transaction remains due';
  end if;

  delete from public.cash_entries where ref_type='transaction' and ref_id=p_txn_id and direction='in';
  for v_item in select value from jsonb_array_elements(v_normalized) loop
    v_amount:=round((v_item->>'amount')::numeric,2);
    v_method:=v_item->>'method';
    v_inst:=nullif(v_item->>'instrument_id','')::uuid;
    insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
    values(
      coalesce(v_txn.transaction_date,current_date),v_method,'in',v_amount,
      'Customer collection '||v_txn.transaction_number||' ('||upper(v_method)||')',
      'transaction',p_txn_id,v_inst
    );
    if v_method='cash' then v_cash_total:=v_cash_total+v_amount;
    elsif v_method='bank' then v_bank_total:=v_bank_total+v_amount;
    end if;
  end loop;

  v_due:=greatest(0,round(v_transaction_total-v_total,2));
  if v_due>0 and v_txn.customer_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('erp:customer:'||v_txn.customer_id::text,0));
    select coalesce(balance,0) into v_prev from public.customers where id=v_txn.customer_id for update;
    if not found then raise exception 'Customer not found'; end if;
    v_new:=round(v_prev+v_due,2);
    update public.customers set balance=v_new,updated_at=now() where id=v_txn.customer_id;
    insert into public.customer_ledger(customer_id,entry_date,type,description,debit,credit,balance_after,ref_id)
    values(
      v_txn.customer_id,coalesce(v_txn.transaction_date,current_date),'transaction',
      v_txn.transaction_number||' balance due',v_due,0,v_new,p_txn_id
    );
  end if;

  update public.transactions
  set customer_payment_allocations=v_normalized,
      customer_collected_amount=v_total,
      customer_due_amount=v_due,
      customer_collection_method=case when v_total>0 then lower(coalesce(v_normalized->0->>'method',v_requested_method)) else 'due' end,
      customer_pay_method=case when v_total>0 then lower(coalesce(v_normalized->0->>'method',v_requested_method)) else 'due' end,
      cash_in=v_cash_total,
      bank_in=v_bank_total,
      updated_at=now()
  where id=p_txn_id;

  return jsonb_build_object(
    'success',true,
    'id',p_txn_id,
    'total_collected',v_total,
    'customer_due',v_due,
    'payment_count',jsonb_array_length(v_normalized),
    'allocations',v_normalized
  );
end;
$function$;

/* Bill-payment wrapper must allow the same server-side default collection resolution. */
create or replace function public.record_bill_payment(
  p_transaction_date date,
  p_transaction_timestamp timestamp with time zone,
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
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_gate jsonb;
  v_txn_id uuid;
  v_number text;
  v_fee numeric:=round(coalesce(p_service_fee,0),2);
  v_commission numeric:=round(coalesce(p_portal_commission,0),2);
  v_amount numeric:=round(coalesce(p_amount,0),2);
  v_provider_cost numeric;
  v_funding_type text;
  v_allocations jsonb:=coalesce(p_customer_payment_allocations,'[]'::jsonb);
  v_inst_type text;
  v_customer_method text:=lower(coalesce(nullif(btrim(coalesce(p_customer_pay_method,'')),''),'cash'));
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_idempotency_key is null or btrim(p_idempotency_key)='' then raise exception 'Idempotency key is required'; end if;
  if p_status not in ('success','pending','failed') then raise exception 'Invalid status'; end if;
  if v_amount<=0 then raise exception 'Amount must be positive'; end if;
  if v_fee<0 or v_commission<0 then raise exception 'Fees and commission cannot be negative'; end if;
  if jsonb_typeof(v_allocations)<>'array' then raise exception 'Payment allocations must be an array'; end if;
  if p_pay_from_instrument_id is null then raise exception 'Funding account is required'; end if;
  if v_customer_method not in ('cash','upi','bank','wallet','card','debit_card','credit_card','due','khata') then
    raise exception 'Unsupported customer payment method: %',v_customer_method;
  end if;

  select lower(type) into v_funding_type
  from public.payment_instruments
  where id=p_pay_from_instrument_id and is_active=true;
  if v_funding_type is null then raise exception 'Funding payment instrument is missing or inactive'; end if;
  if v_funding_type='cash' then raise exception 'Cash is not permitted as funding account for online bill payment'; end if;
  if lower(coalesce(p_pay_from_method,''))<>v_funding_type then
    raise exception 'Funding instrument type (%) does not match funding method (%)',v_funding_type,p_pay_from_method;
  end if;

  if p_customer_collection_instrument_id is not null then
    select lower(type) into v_inst_type
    from public.payment_instruments
    where id=p_customer_collection_instrument_id and is_active=true;
    if v_inst_type is null then raise exception 'Customer collection payment instrument is missing or inactive'; end if;
    if jsonb_array_length(v_allocations)=1 then
      v_allocations:=jsonb_build_array(
        jsonb_set(v_allocations->0,'{instrument_id}',to_jsonb(p_customer_collection_instrument_id),true)
      );
    end if;
  end if;

  v_gate:=public.idempotency_acquire(
    'record_bill_payment',
    p_idempotency_key,
    jsonb_build_object(
      'transaction_date',p_transaction_date,
      'transaction_timestamp',p_transaction_timestamp,
      'customer_id',p_customer_id,
      'reference',p_reference,
      'amount',v_amount,
      'service_fee',v_fee,
      'portal_commission',v_commission,
      'funding_instrument_id',p_pay_from_instrument_id,
      'customer_pay_method',v_customer_method,
      'customer_collection_instrument_id',p_customer_collection_instrument_id,
      'customer_payment_allocations',v_allocations,
      'status',p_status
    )
  );
  if v_gate->>'status'='replay' then return v_gate->'response_payload'; end if;

  v_provider_cost:=round(v_amount-v_commission,2);
  if v_provider_cost<0 then raise exception 'Commission cannot exceed bill amount'; end if;

  /* Only a true due/khata collection requires a customer when no rows are supplied. */
  if jsonb_array_length(v_allocations)=0 and v_customer_method in ('due','khata') and p_customer_id is null then
    raise exception 'Customer is required when the bill payment is not collected immediately';
  end if;

  v_number:='BIL-'||to_char(coalesce(p_transaction_date,current_date),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));

  insert into public.transactions(
    transaction_number,service_type,direction,transaction_date,transaction_timestamp,
    customer_id,customer_mobile,reference,remarks,status,amount,service_fee,
    portal_commission,portal_charge,paid_from,pay_from_instrument_id,pay_from_method,
    pool_out,pool_credit,pool_credit_type,customer_pay_method,customer_collection_method,
    customer_collection_instrument_id,customer_collected_amount,customer_due_amount,created_by
  ) values(
    v_number,'bill_payment','in',p_transaction_date,coalesce(p_transaction_timestamp,now()),
    p_customer_id,p_customer_mobile,p_reference,p_remarks,p_status,v_amount,v_fee,
    v_commission,0,null,p_pay_from_instrument_id,p_pay_from_method,v_provider_cost,0,
    'utility',v_customer_method,v_customer_method,p_customer_collection_instrument_id,0,0,auth.uid()
  ) returning id into v_txn_id;

  if p_status='success' then
    perform public.apply_transaction_customer_payment_split(v_txn_id,v_allocations);
    if v_provider_cost>0 then
      perform set_config('erp.internal_cash_mutation_authorized','on',true);
      insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
      values(
        coalesce(p_transaction_date,current_date),v_funding_type,'out',v_provider_cost,
        'Bill payment funding '||v_number,'transaction',v_txn_id,p_pay_from_instrument_id
      );
    end if;
  end if;

  perform public.idempotency_commit(
    'record_bill_payment',
    p_idempotency_key,
    'completed',
    v_txn_id,
    jsonb_build_object(
      'success',true,
      'id',v_txn_id,
      'transaction_number',v_number,
      'provider_cost',v_provider_cost
    )
  );

  return jsonb_build_object('success',true,'id',v_txn_id,'transaction_number',v_number,'provider_cost',v_provider_cost);
end;
$function$;

commit;