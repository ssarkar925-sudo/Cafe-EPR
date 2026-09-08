-- Preserve exact customer payment allocations for utility/bill payments,
-- and prevent reconciliation edits from collapsing an existing split collection.

alter table public.transactions
  add column if not exists customer_payment_allocations jsonb not null default '[]'::jsonb;

update public.transactions t
set customer_payment_allocations = coalesce(x.allocations, '[]'::jsonb),
    cash_in = coalesce(x.cash_amount, 0),
    bank_in = coalesce(x.bank_amount, 0)
from (
  select ce.ref_id,
         jsonb_agg(
           jsonb_build_object(
             'method', ce.method,
             'amount', ce.amount,
             'instrument_id', ce.instrument_id
           ) order by ce.created_at, ce.id
         ) as allocations,
         sum(case when lower(ce.method)='cash' then ce.amount else 0 end) as cash_amount,
         sum(case when lower(ce.method)='bank' then ce.amount else 0 end) as bank_amount
  from public.cash_entries ce
  where ce.ref_type='transaction' and ce.direction='in'
  group by ce.ref_id
) x
where t.id=x.ref_id
  and t.service_type in ('bill_payment','utility_bill','utility');

create or replace function public.apply_transaction_customer_payment_split(p_txn_id uuid, p_allocations jsonb)
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
begin
  if auth.role()<>'service_role' then
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not public.is_back_office() then raise exception 'Forbidden'; end if;
  end if;
  perform set_config('erp.financial_edit_in_progress','on',true);
  if p_allocations is null or jsonb_typeof(p_allocations)<>'array' then raise exception 'Payment allocations must be an array'; end if;
  perform pg_advisory_xact_lock(hashtextextended('erp:transaction:'||p_txn_id::text,0));
  select * into v_txn from public.transactions where id=p_txn_id for update;
  if not found then raise exception 'Transaction not found'; end if;

  for v_item in select value from jsonb_array_elements(p_allocations) loop
    v_amount:=round(coalesce((v_item->>'amount')::numeric,0),2);
    if v_amount<=0 then raise exception 'Each payment allocation must be positive'; end if;
    v_total:=v_total+v_amount;
    v_method:=lower(coalesce(nullif(btrim(v_item->>'method'),''),'cash'));
    v_inst:=nullif(v_item->>'instrument_id','')::uuid;
    if v_inst is not null then
      select type into v_inst_type from public.payment_instruments where id=v_inst and is_active=true;
      if v_inst_type is null then raise exception 'Unknown or inactive payment instrument'; end if;
      v_method:=case lower(v_inst_type)
        when 'cash' then 'cash' when 'bank' then 'bank' when 'wallet' then 'wallet'
        when 'upi' then 'upi' when 'upi_qr' then 'upi'
        when 'debit_card' then 'debit_card' when 'credit_card' then 'credit_card'
        else null end;
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
    v_normalized:=v_normalized||jsonb_build_array(jsonb_build_object('method',v_method,'amount',v_amount,'instrument_id',v_inst));
  end loop;

  v_transaction_total:=case
    when lower(coalesce(v_txn.service_type,'')) in ('bill_payment','utility_bill','utility')
      then round(coalesce(v_txn.amount,0)+coalesce(v_txn.service_fee,0)+coalesce(v_txn.portal_charge,0),2)
    else round(coalesce(v_txn.total_amount,v_txn.amount+coalesce(v_txn.service_fee,0)+coalesce(v_txn.portal_charge,0)),2)
  end;
  if v_total>v_transaction_total+0.005 then raise exception 'Payment allocations exceed transaction total'; end if;
  if v_txn.customer_id is null and v_total<v_transaction_total-0.005 then raise exception 'Customer is required when a transaction remains due'; end if;

  delete from public.cash_entries where ref_type='transaction' and ref_id=p_txn_id and direction='in';
  for v_item in select value from jsonb_array_elements(v_normalized) loop
    v_amount:=round((v_item->>'amount')::numeric,2);
    v_method:=v_item->>'method';
    v_inst:=nullif(v_item->>'instrument_id','')::uuid;
    insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
    values(current_date,v_method,'in',v_amount,'Customer collection '||v_txn.transaction_number||' ('||upper(v_method)||')','transaction',p_txn_id,v_inst);
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
    values(v_txn.customer_id,current_date,'transaction',v_txn.transaction_number||' balance due',v_due,0,v_new,p_txn_id);
  end if;

  update public.transactions
  set customer_payment_allocations=v_normalized,
      customer_collected_amount=v_total,
      customer_due_amount=v_due,
      customer_collection_method=case when v_total>0 then lower(coalesce(v_normalized->0->>'method','cash')) else 'due' end,
      customer_pay_method=case when v_total>0 then lower(coalesce(v_normalized->0->>'method','cash')) else 'due' end,
      cash_in=v_cash_total,
      bank_in=v_bank_total,
      updated_at=now()
  where id=p_txn_id;

  return jsonb_build_object('success',true,'id',p_txn_id,'total_collected',v_total,'customer_due',v_due,'payment_count',jsonb_array_length(v_normalized),'allocations',v_normalized);
end;
$function$;

create or replace function public.edit_bill_payment(
  p_txn_id uuid,
  p_customer_id uuid default null,
  p_customer_mobile text default null,
  p_reference text default null,
  p_amount numeric default null,
  p_service_fee numeric default 0,
  p_portal_commission numeric default 0,
  p_customer_pay_method text default 'cash',
  p_funding_instrument_id uuid default null,
  p_status text default 'success',
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_txn record;
  v_entry_date date;
  v_new_cost numeric;
  v_new_collected numeric;
  v_new_funding_method text := 'bank';
  v_existing_allocations jsonb := '[]'::jsonb;
  v_existing_total numeric := 0;
  v_cash_total numeric := 0;
  v_bank_total numeric := 0;
  v_alloc jsonb;
  v_item_method text;
  v_item_amount numeric;
  v_item_inst uuid;
  v_cash_drawer_id uuid;
  v_default_upi_id uuid;
  v_default_bank_id uuid;
  r record;
begin
  perform set_config('erp.financial_edit_in_progress','on',true);
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  perform set_config('erp.internal_cash_mutation_authorized', 'on', true);
  perform pg_advisory_xact_lock(hashtextextended('erp:transaction-update:'||p_txn_id::text, 0));

  select * into v_txn from public.transactions where id = p_txn_id for update;
  if not found then raise exception 'Transaction not found'; end if;

  v_entry_date := coalesce(v_txn.transaction_date, current_date);
  v_new_cost := greatest(0, p_amount - coalesce(p_portal_commission, 0));
  v_new_collected := round(p_amount + coalesce(p_service_fee, 0), 2);
  v_existing_allocations := coalesce(v_txn.customer_payment_allocations, '[]'::jsonb);

  if jsonb_typeof(v_existing_allocations) <> 'array' then
    v_existing_allocations := '[]'::jsonb;
  end if;

  if p_status = 'success' and p_customer_pay_method <> 'due' and jsonb_array_length(v_existing_allocations) > 1 then
    select coalesce(sum(round(coalesce((value->>'amount')::numeric,0),2)),0)
      into v_existing_total
    from jsonb_array_elements(v_existing_allocations);
    if abs(v_existing_total - v_new_collected) > 0.005 then
      raise exception 'Split collection amount cannot be changed during reconciliation. Current split total is %, requested total is %.', v_existing_total, v_new_collected;
    end if;
  end if;

  select id into v_cash_drawer_id
  from public.payment_instruments
  where is_active = true and lower(type) = 'cash'
  order by created_at asc limit 1;

  select id into v_default_upi_id
  from public.payment_instruments
  where is_active = true and lower(type) in ('upi_qr', 'upi')
  order by created_at asc limit 1;

  select id into v_default_bank_id
  from public.payment_instruments
  where is_active = true and lower(type) in ('bank', 'debit_card')
  order by created_at asc limit 1;

  -- Reverse previous money entries without deleting the audit trail.
  for r in select * from public.cash_entries where ref_type = 'transaction' and ref_id = p_txn_id loop
    insert into public.cash_entries(
      entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id
    ) values (
      v_entry_date,
      r.method,
      case when r.direction = 'out' then 'in' else 'out' end,
      r.amount,
      'Reversal on edit: ' || coalesce(r.description, 'Txn ' || v_txn.transaction_number),
      'transaction',
      p_txn_id,
      r.instrument_id
    );
  end loop;

  if p_status = 'success' then
    -- Preserve a real split allocation instead of collapsing it to p_customer_pay_method.
    if jsonb_array_length(v_existing_allocations) > 1 and p_customer_pay_method <> 'due' then
      for v_alloc in select value from jsonb_array_elements(v_existing_allocations) loop
        v_item_amount := round(coalesce((v_alloc->>'amount')::numeric,0),2);
        v_item_method := lower(coalesce(nullif(btrim(v_alloc->>'method'),''),'cash'));
        v_item_inst := nullif(v_alloc->>'instrument_id','')::uuid;
        if v_item_amount <= 0 then raise exception 'Invalid stored split allocation'; end if;
        if v_item_inst is null then
          if v_item_method='cash' then
            v_item_inst := v_cash_drawer_id;
          elsif v_item_method='upi' then
            v_item_inst := v_default_upi_id;
          else
            v_item_inst := v_default_bank_id;
          end if;
        end if;
        if v_item_inst is null then raise exception 'Payment instrument is not configured for %',v_item_method; end if;
        insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
        values(v_entry_date,v_item_method,'in',v_item_amount,'Collection for '||v_txn.transaction_number||' ('||upper(v_item_method)||') [Reconciled]','transaction',p_txn_id,v_item_inst);
        if v_item_method='cash' then v_cash_total:=v_cash_total+v_item_amount;
        elsif v_item_method='bank' then v_bank_total:=v_bank_total+v_item_amount;
        end if;
      end loop;
    else
      if p_customer_pay_method <> 'due' and v_new_collected > 0 then
        if p_customer_pay_method = 'cash' then
          v_cash_drawer_id := coalesce(v_cash_drawer_id, v_default_bank_id);
          insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
          values(v_entry_date,'cash','in',v_new_collected,'Collection for ' || v_txn.transaction_number || ' (CASH) [Reconciled]','transaction',p_txn_id,v_cash_drawer_id);
          v_existing_allocations := jsonb_build_array(jsonb_build_object('method','cash','amount',v_new_collected,'instrument_id',v_cash_drawer_id));
          v_cash_total := v_new_collected;
        elsif p_customer_pay_method in ('upi','qr','upi_qr') then
          v_default_upi_id := coalesce(v_default_upi_id, v_default_bank_id, v_cash_drawer_id);
          v_existing_allocations := jsonb_build_array(jsonb_build_object('method','upi','amount',v_new_collected,'instrument_id',v_default_upi_id));
          insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
          values(v_entry_date,'upi','in',v_new_collected,'Collection for ' || v_txn.transaction_number || ' (UPI) [Reconciled]','transaction',p_txn_id,v_default_upi_id);
        else
          v_default_bank_id := coalesce(v_default_bank_id, v_cash_drawer_id);
          v_existing_allocations := jsonb_build_array(jsonb_build_object('method',lower(p_customer_pay_method),'amount',v_new_collected,'instrument_id',v_default_bank_id));
          insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
          values(v_entry_date,lower(p_customer_pay_method),'in',v_new_collected,'Collection for ' || v_txn.transaction_number || ' ('||upper(p_customer_pay_method)||') [Reconciled]','transaction',p_txn_id,v_default_bank_id);
          if lower(p_customer_pay_method)='bank' then v_bank_total := v_new_collected; end if;
        end if;
      else
        v_existing_allocations := '[]'::jsonb;
      end if;
    end if;

    if v_new_cost > 0 and p_funding_instrument_id is not null then
      select case lower(type)
        when 'aeps_portal' then 'aeps'
        when 'dmt_portal' then 'dmt'
        when 'upi_qr' then 'upi'
        else lower(type)
      end
      into v_new_funding_method
      from public.payment_instruments
      where id = p_funding_instrument_id;
      v_new_funding_method := coalesce(v_new_funding_method, 'bank');
      insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
      values(v_entry_date,v_new_funding_method,'out',v_new_cost,'Settlement for ' || v_txn.transaction_number || ' from ' || (select name from public.payment_instruments where id=p_funding_instrument_id) || ' [Reconciled]','transaction',p_txn_id,p_funding_instrument_id);
    end if;
  else
    -- Preserve the historical allocation JSON even when the transaction is marked non-success.
    null;
  end if;

  update public.transactions set
    customer_id = p_customer_id,
    customer_mobile = p_customer_mobile,
    reference = nullif(p_reference, ''),
    amount = p_amount,
    service_fee = coalesce(p_service_fee, 0),
    portal_commission = coalesce(p_portal_commission, 0),
    pool_out = v_new_cost,
    customer_pay_method = p_customer_pay_method,
    instrument_id = p_funding_instrument_id,
    pay_from_instrument_id = p_funding_instrument_id,
    pay_from_method = v_new_funding_method,
    remarks = p_remarks,
    status = p_status,
    customer_payment_allocations = case when p_status='success' then v_existing_allocations else v_txn.customer_payment_allocations end,
    customer_collected_amount = case when p_status='success' then v_new_collected else v_txn.customer_collected_amount end,
    customer_due_amount = case when p_status='success' then 0 else v_txn.customer_due_amount end,
    customer_collection_method = case when p_status='success' and jsonb_array_length(v_existing_allocations)>0 then lower(coalesce(v_existing_allocations->0->>'method','cash')) else v_txn.customer_collection_method end,
    cash_in = case when p_status='success' then v_cash_total else v_txn.cash_in end,
    bank_in = case when p_status='success' then v_bank_total else v_txn.bank_in end,
    updated_at = now()
  where id = p_txn_id;

  insert into public.audit_logs(user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'edit', 'transaction', p_txn_id::text,
    'Complete Edit & Reconciliation on ' || v_txn.transaction_number,
    jsonb_build_object(
      'transaction_number', v_txn.transaction_number,
      'amount', p_amount,
      'funding_instrument_id', p_funding_instrument_id,
      'customer_pay_method', p_customer_pay_method,
      'customer_payment_allocations', case when p_status='success' then v_existing_allocations else v_txn.customer_payment_allocations end
    )
  );

  return (select to_jsonb(t.*) from public.transactions t where t.id = p_txn_id);
end;
$function$;
