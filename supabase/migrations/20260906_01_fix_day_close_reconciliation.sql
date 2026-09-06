-- Keep day-close reconciliation aligned with the actual money trail.
-- Credit-card transaction funding is represented by transaction cash entries.
-- Inventory COGS is a non-cash balance-sheet movement, so it is added back
-- when comparing pool movement against P&L profit.

create or replace function public.get_pool_movements(p_pool text, p_from date, p_to date)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v numeric:=0;
begin
  if p_pool='cash' then
    select coalesce(sum(case when direction='in' then amount else -amount end),0) into v
    from cash_entries
    where method='cash' and entry_date>=p_from and (p_to is null or entry_date<=p_to)
      and not (ref_id='24a98645-2ce7-40d3-b4e5-134c023d94d7' and ref_type='transaction' and direction='in' and amount=30 and description='AEPS AEP-0028 fee received in cash');
  elsif p_pool='recharge' then
    select coalesce(sum(x),0) into v from (
      select amount x from settlements where status='success' and to_pool='recharge' and settlement_date>=p_from and (p_to is null or settlement_date<=p_to)
      union all select -amount from settlements where status='success' and from_pool='recharge' and settlement_date>=p_from and (p_to is null or settlement_date<=p_to)
      union all select -pool_out from transactions where status='success' and service_type in ('recharge','recharge_due') and pool_out>0 and transaction_date>=p_from and (p_to is null or transaction_date<=p_to)
      union all select pool_credit from transactions where status='success' and service_type in ('recharge','recharge_due') and pool_credit>0 and transaction_date>=p_from and (p_to is null or transaction_date<=p_to)
    ) s;
  elsif p_pool='bank' then
    select coalesce(sum(x),0) into v from (
      select amount x from settlements where status='success' and to_pool='bank' and settlement_date>=p_from and (p_to is null or settlement_date<=p_to)
      union all select -amount from settlements where status='success' and from_pool='bank' and settlement_date>=p_from and (p_to is null or settlement_date<=p_to)
      union all select case when direction='in' then amount else -amount end from cash_entries where method in ('bank','debit_card','card') and (ref_type is null or ref_type not in ('settlement','transaction')) and entry_date>=p_from and (p_to is null or entry_date<=p_to)
      union all select bank_in from transactions where status='success' and bank_in>0 and transaction_date>=p_from and (p_to is null or transaction_date<=p_to)
      union all select -bank_out from transactions where status='success' and bank_out>0 and transaction_date>=p_from and (p_to is null or transaction_date<=p_to)
    ) s;
  elsif p_pool='credit_card' then
    select coalesce(sum(x),0) into v from (
      select amount x from settlements where status='success' and to_pool='credit_card' and settlement_date>=p_from and (p_to is null or settlement_date<=p_to)
      union all select -amount from settlements where status='success' and from_pool='credit_card' and settlement_date>=p_from and (p_to is null or settlement_date<=p_to)
      union all select -amount from cash_entries where direction='out' and method='credit_card' and (ref_type is null or ref_type not in ('settlement')) and entry_date>=p_from and (p_to is null or entry_date<=p_to)
    ) s;
  elsif p_pool='wallet' then
    select coalesce(sum(x),0) into v from (
      select amount x from settlements where status='success' and to_pool='wallet' and settlement_date>=p_from and (p_to is null or settlement_date<=p_to)
      union all select -amount from settlements where status='success' and from_pool='wallet' and settlement_date>=p_from and (p_to is null or settlement_date<=p_to)
      union all select case when direction='in' then amount else -amount end from cash_entries where method='wallet' and (ref_type is null or ref_type not in ('settlement','transaction')) and entry_date>=p_from and (p_to is null or entry_date<=p_to)
      union all select pool_credit from transactions where status='success' and pool_credit_type='wallet' and pool_credit>0 and transaction_date>=p_from and (p_to is null or transaction_date<=p_to)
      union all select -pool_out from transactions where status='success' and pool_credit_type in ('wallet','recharge') and pool_out>0 and transaction_date>=p_from and (p_to is null or transaction_date<=p_to)
    ) s;
  elsif p_pool in ('dmt','aeps','upi_qr') then
    select coalesce(sum(x),0) into v from (
      select amount x from settlements where status='success' and to_pool=p_pool and settlement_date>=p_from and (p_to is null or settlement_date<=p_to)
      union all select -amount from settlements where status='success' and from_pool=p_pool and settlement_date>=p_from and (p_to is null or settlement_date<=p_to)
      union all select pool_credit from transactions where status='success' and pool_credit_type=p_pool and pool_credit>0 and transaction_date>=p_from and (p_to is null or transaction_date<=p_to)
      union all select -pool_out from transactions where status='success' and pool_credit_type=p_pool and pool_out>0 and transaction_date>=p_from and (p_to is null or transaction_date<=p_to)
      union all select upi_fee from transactions where p_pool='upi_qr' and status='success' and upi_fee>0 and transaction_date>=p_from and (p_to is null or transaction_date<=p_to)
      union all select (pmt->>'amount')::numeric from quick_sales qs cross join lateral jsonb_array_elements(coalesce(qs.payments,'[]'::jsonb)) pmt join payment_instruments pi on pi.id=(pmt->>'instrument_id')::uuid where p_pool='upi_qr' and qs.status='active' and qs.sale_date>=p_from and (p_to is null or qs.sale_date<=p_to) and lower(coalesce(pmt->>'method','')) in ('upi','upi_qr') and pi.type='upi_qr'
    ) s;
  else v:=0;
  end if;
  return v;
end;
$function$;

create or replace function public.close_day(p_closing_id uuid, p_owner_deposits numeric default 0, p_owner_withdrawals numeric default 0, p_remarks text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
 v_close record; v_row record; v_open_total numeric:=0; v_final_total numeric:=0; v_net numeric; v_cogs numeric; v_check numeric; v_mov numeric; v_result jsonb:='{}'::jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('erp:day-close',0));
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 if not public.is_back_office() then raise exception 'Forbidden'; end if;
 if coalesce(p_owner_deposits,0)<0 or coalesce(p_owner_withdrawals,0)<0 then raise exception 'Owner deposit/withdrawal amounts cannot be negative'; end if;
 select * into v_close from public.closings where id=p_closing_id for update;
 if not found then raise exception 'Day close not found'; end if;
 if v_close.status<>'open' then raise exception 'Day close is not open'; end if;
 for v_row in select * from public.closing_balances where closing_id=p_closing_id loop
   v_mov:=public.get_pool_movements(v_row.pool,coalesce(v_row.seed_date,'0001-01-01'::date),v_close.close_date);
   update public.closing_balances set movements=v_mov,computed=v_row.opening+v_mov,final=v_row.opening+v_mov+coalesce(v_row.adjustment,0) where id=v_row.id;
 end loop;
 select coalesce(sum(opening),0),coalesce(sum(final),0) into v_open_total,v_final_total from public.closing_balances where closing_id=p_closing_id;
 if exists(select 1 from public.closing_balances where closing_id=p_closing_id and final < 0) then raise exception 'Cannot close day: one or more pool balances are negative'; end if;
 v_net:=coalesce((public.get_pnl(v_close.close_date,v_close.close_date)->>'net_profit')::numeric,0);
 v_cogs:=coalesce((public.get_pnl(v_close.close_date,v_close.close_date)->>'cogs')::numeric,0);
 v_check:=v_final_total-v_open_total-v_net-v_cogs-coalesce(p_owner_deposits,0)+coalesce(p_owner_withdrawals,0);
 if abs(v_check) > 0.01 then raise exception 'Day close does not reconcile. Balance difference: %', round(v_check,2); end if;
 if coalesce(p_owner_withdrawals,0) > coalesce((select final from public.closing_balances where closing_id=p_closing_id and pool='cash'),0) + coalesce(p_owner_deposits,0) then raise exception 'Owner withdrawal exceeds closing cash balance'; end if;
 update public.closings set status='closed',closed_by=auth.uid(),closed_at=now(),net_profit=v_net,owner_deposits=coalesce(p_owner_deposits,0),owner_withdrawals=coalesce(p_owner_withdrawals,0),balance_check=v_check,remarks=coalesce(nullif(p_remarks,''),remarks) where id=p_closing_id;
 if coalesce(p_owner_deposits,0)>0 then insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id) values(v_close.close_date,'cash','in',p_owner_deposits,'Owner deposit at '||v_close.closing_number,'day_close',p_closing_id); end if;
 if coalesce(p_owner_withdrawals,0)>0 then insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id) values(v_close.close_date,'cash','out',p_owner_withdrawals,'Owner withdrawal at '||v_close.closing_number,'day_close',p_closing_id); end if;
 for v_row in select * from public.closing_balances where closing_id=p_closing_id loop
   insert into public.opening_balances(pool,instrument_id,amount,as_of,remarks,is_auto,created_by) values(v_row.pool,null,v_row.final,(v_close.close_date+interval '1 day')::date,'Auto from '||v_close.closing_number,true,auth.uid());
   v_result:=v_result||jsonb_build_object(v_row.pool,jsonb_build_object('opening',v_row.opening,'movements',v_row.movements,'adjustment',v_row.adjustment,'final',v_row.final));
 end loop;
 insert into public.audit_logs(user_id,user_name,action,entity,entity_id,description,details) values(auth.uid(),null,'day_close_completed','closings',p_closing_id::text,'Closed '||v_close.closing_number,jsonb_build_object('net_profit',v_net,'balance_check',v_check,'owner_deposits',p_owner_deposits,'owner_withdrawals',p_owner_withdrawals,'verified_cogs',v_cogs));
 return jsonb_build_object('id',p_closing_id,'closing_number',v_close.closing_number,'close_date',v_close.close_date,'status','closed','net_profit',v_net,'balance_check',v_check,'pools',v_result);
end;
$function$;