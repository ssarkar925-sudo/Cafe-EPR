-- Utility bill customer collection and accounting repair.
-- 1) transactions.total_amount is generated from principal amount only.
--    Bill/utility customer collection must include service_fee/portal_charge.
-- 2) Internal collection synchronization must not create an edit journal
--    inside the original atomic mutation.
-- 3) Provider funding already represented by cash_entries must not be
--    double-counted by the deferred service journal bridge.
-- 4) record_bill_payment must use the deployed idempotency_commit signature.

create or replace function public.apply_transaction_customer_payment_split(p_txn_id uuid, p_allocations jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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

  for v_item in select value from jsonb_array_elements(p_allocations) loop
    v_amount:=round(coalesce((v_item->>'amount')::numeric,0),2);
    if v_amount<=0 then raise exception 'Each payment allocation must be positive'; end if;
    v_total:=v_total+v_amount;
  end loop;

  v_transaction_total:=case
    when lower(coalesce(v_txn.service_type,'')) in ('bill_payment','utility_bill','utility')
      then round(coalesce(v_txn.amount,0)+coalesce(v_txn.service_fee,0)+coalesce(v_txn.portal_charge,0),2)
    else round(coalesce(v_txn.total_amount,v_txn.amount+coalesce(v_txn.service_fee,0)+coalesce(v_txn.portal_charge,0)),2)
  end;

  if v_total>v_transaction_total+0.005 then
    raise exception 'Payment allocations exceed transaction total';
  end if;

  if v_txn.customer_id is null and v_total<v_transaction_total-0.005 then
    raise exception 'Customer is required when a transaction remains due';
  end if;

  delete from public.cash_entries where ref_type='transaction' and ref_id=p_txn_id and direction='in';

  for v_item in select value from jsonb_array_elements(p_allocations) loop
    v_amount:=round((v_item->>'amount')::numeric,2);
    v_method:=lower(coalesce(nullif(btrim(v_item->>'method'),''),'cash'));
    v_inst:=nullif(v_item->>'instrument_id','')::uuid;

    if v_inst is not null then
      select type into v_inst_type from public.payment_instruments where id=v_inst and is_active=true;
      if v_inst_type is null then raise exception 'Unknown or inactive payment instrument'; end if;
      v_method:=case v_inst_type
        when 'cash' then 'cash'
        when 'bank' then 'bank'
        when 'wallet' then 'wallet'
        when 'upi' then 'upi'
        when 'upi_qr' then 'upi'
        when 'debit_card' then 'debit_card'
        when 'credit_card' then 'credit_card'
        else null
      end;
      if v_method is null then raise exception 'Unsupported payment instrument type'; end if;
    else
      if v_method='card' then
        select id into v_inst from public.payment_instruments where is_active and lower(type) in ('debit_card','credit_card') order by created_at limit 1;
      elsif v_method='upi' then
        select id into v_inst from public.payment_instruments where is_active and lower(type) in ('upi','upi_qr') order by created_at limit 1;
      else
        select id into v_inst from public.payment_instruments where is_active and lower(type)=v_method order by created_at limit 1;
      end if;
    end if;

    if v_inst is null then raise exception 'No active payment instrument configured for %',v_method; end if;

    insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
    values(current_date,v_method,'in',v_amount,'Customer collection '||v_txn.transaction_number||' ('||upper(v_method)||')','transaction',p_txn_id,v_inst);
  end loop;

  v_due:=greatest(0,round(v_transaction_total-v_total,2));

  if v_due>0 and v_txn.customer_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('erp:customer:'||v_txn.customer_id::text,0));
    select coalesce(balance,0) into v_prev from public.customers where id=v_txn.customer_id for update;
    v_new:=round(v_prev+v_due,2);
    update public.customers set balance=v_new,updated_at=now() where id=v_txn.customer_id;
    insert into public.customer_ledger(customer_id,entry_date,type,description,debit,credit,balance_after,ref_id)
    values(v_txn.customer_id,current_date,'transaction',v_txn.transaction_number||' balance due',v_due,0,v_new,p_txn_id);
  end if;

  update public.transactions
  set customer_collected_amount=v_total,
      customer_due_amount=v_due,
      customer_collection_method=case when v_total>0 then lower(coalesce(p_allocations->0->>'method','cash')) else 'due' end,
      customer_pay_method=case when v_total>0 then lower(coalesce(p_allocations->0->>'method','cash')) else 'due' end,
      cash_in=case when lower(coalesce(p_allocations->0->>'method',''))='cash' then v_total else 0 end,
      bank_in=case when lower(coalesce(p_allocations->0->>'method',''))='bank' then v_total else 0 end,
      updated_at=now()
  where id=p_txn_id;

  return jsonb_build_object('success',true,'id',p_txn_id,'total_collected',v_total,'customer_due',v_due,'payment_count',jsonb_array_length(p_allocations));
end;
$$;

grant execute on function public.apply_transaction_customer_payment_split(uuid,jsonb) to authenticated,service_role;

create or replace function public.trg_service_transaction_edit_accounting()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_old_journal uuid;
begin
  if current_setting('erp.financial_edit_in_progress', true) = 'on' then
    return new;
  end if;
  if OLD.status<>'success' OR NEW.status<>'success' then return NEW; end if;
  if NEW.transaction_date IS NOT DISTINCT FROM OLD.transaction_date
     AND NEW.transaction_timestamp IS NOT DISTINCT FROM OLD.transaction_timestamp
     AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.service_fee IS NOT DISTINCT FROM OLD.service_fee
     AND NEW.portal_charge IS NOT DISTINCT FROM OLD.portal_charge
     AND NEW.portal_commission IS NOT DISTINCT FROM OLD.portal_commission
     AND NEW.cash_in IS NOT DISTINCT FROM OLD.cash_in
     AND NEW.cash_out IS NOT DISTINCT FROM OLD.cash_out
     AND NEW.bank_in IS NOT DISTINCT FROM OLD.bank_in
     AND NEW.bank_out IS NOT DISTINCT FROM OLD.bank_out
     AND NEW.pool_out IS NOT DISTINCT FROM OLD.pool_out
     AND NEW.pool_credit IS NOT DISTINCT FROM OLD.pool_credit
     AND NEW.pool_credit_type IS NOT DISTINCT FROM OLD.pool_credit_type
     AND NEW.upi_fee IS NOT DISTINCT FROM OLD.upi_fee
     AND NEW.pay_from_instrument_id IS NOT DISTINCT FROM OLD.pay_from_instrument_id
     AND NEW.pay_from_method IS NOT DISTINCT FROM OLD.pay_from_method
     AND NEW.customer_pay_method IS NOT DISTINCT FROM OLD.customer_pay_method
     AND NEW.paid_from IS NOT DISTINCT FROM OLD.paid_from
     AND NEW.fee_source IS NOT DISTINCT FROM OLD.fee_source
     AND NEW.provider_id IS NOT DISTINCT FROM OLD.provider_id
     AND NEW.bank_id IS NOT DISTINCT FROM OLD.bank_id
     AND NEW.portal_id IS NOT DISTINCT FROM OLD.portal_id
     AND NEW.merchant_qr_id IS NOT DISTINCT FROM OLD.merchant_qr_id
  then return NEW; end if;
  select je.id into v_old_journal
  from public.journal_entries je
  where je.source_type in ('service_transaction','service_transaction_edit')
    and je.source_id=NEW.id
  order by je.created_at desc,je.id desc
  limit 1;
  if v_old_journal is not null then
    perform public.append_journal_mirror_reversal(v_old_journal,'service_transaction_reversal','Reversal of service transaction journal for edit '||NEW.transaction_number);
  end if;
  perform public.post_service_transaction_journal_snapshot(NEW.id,'service_transaction_edit','Edited service transaction '||NEW.transaction_number);
  return NEW;
end;
$$;

create or replace function public.post_service_transaction_accounting_bridge()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_txn record;
  v_lines jsonb:='[]'::jsonb;
  v_net numeric;
  v_code text;
  v_funding_code text;
  v_fee numeric;
  v_commission numeric;
  v_total_customer numeric;
  v_collection numeric;
  v_due numeric;
  v_any boolean:=false;
  v_has_money_legs boolean:=false;
  r record;
begin
  select * into v_txn from public.transactions where id=new.id;
  if lower(coalesce(v_txn.status,'')) not in ('success','successful','completed','posted') then return new; end if;
  if exists(select 1 from public.journal_entries where source_type='service_transaction' and source_id=v_txn.id) then return new; end if;
  v_fee:=coalesce(v_txn.service_fee,0)+coalesce(v_txn.portal_charge,0);
  v_commission:=coalesce(v_txn.portal_commission,0);
  v_total_customer:=coalesce(v_txn.amount,0)+v_fee;
  v_collection:=greatest(0,coalesce(v_txn.customer_collected_amount,0));
  v_due:=greatest(0,coalesce(v_txn.customer_due_amount,0));
  if v_collection=0 and v_due=0 and lower(coalesce(v_txn.customer_pay_method,''))='due' then v_due:=v_total_customer; end if;
  if v_collection=0 and v_due=0 and lower(coalesce(v_txn.customer_pay_method,''))<>'due' and v_total_customer>0 then v_collection:=v_total_customer; end if;

  for r in select ce.instrument_id,sum(case when ce.direction='in' then ce.amount else -ce.amount end) net from public.cash_entries ce where ce.ref_type='transaction' and ce.ref_id=v_txn.id and ce.instrument_id is not null group by ce.instrument_id loop
    v_net:=round(coalesce(r.net,0),2);
    if abs(v_net)<=0.005 then continue; end if;
    v_code:=public.accounting_instrument_account_code(r.instrument_id);
    if v_code is null then select public.accounting_asset_code(type) into v_code from public.payment_instruments where id=r.instrument_id; end if;
    if v_code is null then v_code:='1400'; end if;
    if v_net>0 then v_lines:=v_lines||jsonb_build_object('account_code',v_code,'debit',v_net,'credit',0); else v_lines:=v_lines||jsonb_build_object('account_code',v_code,'debit',0,'credit',abs(v_net)); end if;
    v_any:=true; v_has_money_legs:=true;
  end loop;

  if v_due>0 and v_txn.customer_id is not null then
    v_lines:=v_lines||jsonb_build_object('account_code','1300','debit',v_due,'credit',0);
    v_any:=true;
  end if;

  if not v_has_money_legs and v_collection>0 then
    v_code:=public.accounting_instrument_account_code(coalesce(v_txn.customer_collection_instrument_id,v_txn.instrument_id));
    if v_code is null then v_code:=public.accounting_asset_code(v_txn.customer_collection_method); end if;
    v_lines:=v_lines||jsonb_build_object('account_code',coalesce(v_code,'1000'),'debit',v_collection,'credit',0);
    v_any:=true;
  end if;

  if not v_has_money_legs and (coalesce(v_txn.pool_out,0)>0 or coalesce(v_txn.bank_out,0)>0) then
    v_funding_code:=public.accounting_instrument_account_code(v_txn.pay_from_instrument_id);
    if v_funding_code is null then v_funding_code:=public.accounting_asset_code(v_txn.pay_from_method); end if;
    v_lines:=v_lines||jsonb_build_object('account_code',coalesce(v_funding_code,'1010'),'debit',0,'credit',round(coalesce(nullif(v_txn.pool_out,0),v_txn.bank_out),2));
    v_any:=true;
  end if;

  if v_fee>0 then v_lines:=v_lines||jsonb_build_object('account_code','4020','debit',0,'credit',v_fee); end if;
  if v_commission>0 then v_lines:=v_lines||jsonb_build_object('account_code','4030','debit',0,'credit',v_commission); end if;

  if jsonb_array_length(v_lines)>0 then
    perform public.post_journal_entry(v_txn.transaction_date,'service_transaction',v_txn.id,'Service '||v_txn.transaction_number,v_lines,v_txn.created_by);
  end if;
  return new;
end;
$$;

grant execute on function public.post_service_transaction_accounting_bridge() to authenticated,service_role;

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
as $$
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
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_idempotency_key is null or btrim(p_idempotency_key)='' then raise exception 'Idempotency key is required'; end if;
  if p_status not in ('success','pending','failed') then raise exception 'Invalid status'; end if;
  if v_amount<=0 then raise exception 'Amount must be positive'; end if;
  if v_fee<0 or v_commission<0 then raise exception 'Fees and commission cannot be negative'; end if;
  if jsonb_typeof(v_allocations)<>'array' then raise exception 'Payment allocations must be an array'; end if;
  if p_pay_from_instrument_id is null then raise exception 'Funding account is required'; end if;
  select lower(type) into v_funding_type from public.payment_instruments where id=p_pay_from_instrument_id and is_active=true;
  if v_funding_type is null then raise exception 'Funding payment instrument is missing or inactive'; end if;
  if v_funding_type='cash' then raise exception 'Cash is not permitted as funding account for online bill payment'; end if;
  if lower(coalesce(p_pay_from_method,''))<>v_funding_type then raise exception 'Funding instrument type (%) does not match funding method (%)',v_funding_type,p_pay_from_method; end if;
  if p_customer_collection_instrument_id is not null then
    select lower(type) into v_inst_type from public.payment_instruments where id=p_customer_collection_instrument_id and is_active=true;
    if v_inst_type is null then raise exception 'Customer collection payment instrument is missing or inactive'; end if;
    if jsonb_array_length(v_allocations)=1 then
      v_allocations:=jsonb_build_array(jsonb_set(v_allocations->0,'{instrument_id}',to_jsonb(p_customer_collection_instrument_id),true));
    end if;
  end if;
  v_gate:=public.idempotency_acquire('record_bill_payment',p_idempotency_key,jsonb_build_object('transaction_date',p_transaction_date,'transaction_timestamp',p_transaction_timestamp,'customer_id',p_customer_id,'reference',p_reference,'amount',v_amount,'service_fee',v_fee,'portal_commission',v_commission,'funding_instrument_id',p_pay_from_instrument_id,'customer_pay_method',p_customer_pay_method,'customer_collection_instrument_id',p_customer_collection_instrument_id,'customer_payment_allocations',v_allocations,'status',p_status));
  if v_gate->>'status'='replay' then return v_gate->'response_payload'; end if;
  v_provider_cost:=round(v_amount-v_commission,2);
  if v_provider_cost<0 then raise exception 'Commission cannot exceed bill amount'; end if;
  if jsonb_array_length(v_allocations)=0 and p_customer_id is null then raise exception 'Customer is required when the bill payment is not collected immediately'; end if;
  v_number:='BIL-'||to_char(coalesce(p_transaction_date,current_date),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.transactions(transaction_number,service_type,direction,transaction_date,transaction_timestamp,customer_id,customer_mobile,reference,remarks,status,amount,service_fee,portal_commission,portal_charge,paid_from,pay_from_instrument_id,pay_from_method,pool_out,pool_credit,pool_credit_type,customer_pay_method,customer_collection_method,customer_collection_instrument_id,customer_collected_amount,customer_due_amount,created_by)
  values(v_number,'bill_payment','in',p_transaction_date,coalesce(p_transaction_timestamp,now()),p_customer_id,p_customer_mobile,p_reference,p_remarks,p_status,v_amount,v_fee,v_commission,0,null,p_pay_from_instrument_id,p_pay_from_method,v_provider_cost,0,'utility',p_customer_pay_method,p_customer_pay_method,p_customer_collection_instrument_id,0,0,auth.uid())
  returning id into v_txn_id;
  if p_status='success' then
    perform public.apply_transaction_customer_payment_split(v_txn_id,v_allocations);
    if v_provider_cost>0 then
      perform set_config('erp.internal_cash_mutation_authorized','on',true);
      insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
      values(coalesce(p_transaction_date,current_date),v_funding_type,'out',v_provider_cost,'Bill payment funding '||v_number,'transaction',v_txn_id,p_pay_from_instrument_id);
    end if;
  end if;
  perform public.idempotency_commit('record_bill_payment',p_idempotency_key,'completed',v_txn_id,jsonb_build_object('success',true,'id',v_txn_id,'transaction_number',v_number,'provider_cost',v_provider_cost));
  return jsonb_build_object('success',true,'id',v_txn_id,'transaction_number',v_number,'provider_cost',v_provider_cost);
end;
$$;

grant execute on function public.record_bill_payment(date,timestamp with time zone,uuid,text,text,text,text,numeric,numeric,numeric,uuid,text,text,uuid,jsonb,text) to authenticated,service_role;
