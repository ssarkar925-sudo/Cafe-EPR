-- Supplier payment / payable reconciliation hardening.
create or replace function public.record_supplier_payment(p_supplier_id uuid,p_amount numeric,p_payment_date date default current_date,p_method text default 'cash',p_instrument_id uuid default null,p_reference text default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_supplier record; v_method text:=lower(coalesce(trim(p_method),'cash')); v_amount numeric:=round(coalesce(p_amount,0),2); v_asset text; v_old_balance numeric; v_new_balance numeric; v_entry_id uuid; v_cash_id uuid; v_desc text;
begin
 if auth.uid() is null and auth.role()<>'service_role' and current_user<>'postgres' then raise exception 'Not authenticated'; end if;
 if current_user<>'postgres' and auth.role()<>'service_role' and not public.is_back_office() then raise exception 'Forbidden'; end if;
 if p_supplier_id is null then raise exception 'Supplier is required'; end if;
 if v_amount<=0 then raise exception 'Supplier payment amount must be greater than 0'; end if;
 if v_method not in ('cash','bank','upi','upi_qr','qr','wallet','credit_card','debit_card','card') then raise exception 'Unsupported payment method: %',v_method; end if;
 perform pg_advisory_xact_lock(hashtextextended('erp:supplier-payment',0)); perform pg_advisory_xact_lock(hashtextextended('erp:supplier:'||p_supplier_id::text,0));
 select * into v_supplier from public.suppliers where id=p_supplier_id for update; if not found then raise exception 'Supplier not found'; end if;
 v_old_balance:=coalesce(v_supplier.current_balance,0); if v_amount>v_old_balance then raise exception 'Payment % exceeds supplier payable balance %',v_amount,v_old_balance; end if; v_new_balance:=round(v_old_balance-v_amount,2);
 if p_instrument_id is not null then select type into v_method from public.payment_instruments where id=p_instrument_id and is_active=true; if v_method is null then raise exception 'Payment instrument not found or inactive'; end if; end if;
 v_asset:=public.accounting_asset_code(v_method); v_desc:='Supplier Payment'||case when p_reference is not null and btrim(p_reference)<>'' then ' ['||btrim(p_reference)||']' else '' end||' - '||coalesce(v_supplier.name,'Supplier');
 update public.suppliers set current_balance=v_new_balance,updated_at=now() where id=p_supplier_id;
 insert into public.supplier_ledger(supplier_id,entry_date,type,description,credit,debit,balance_after,ref_type,ref_id) values(p_supplier_id,coalesce(p_payment_date,current_date),'payment',v_desc,0,v_amount,v_new_balance,'supplier_payment',null) returning id into v_cash_id;
 insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id) values(coalesce(p_payment_date,current_date),v_method,'out',v_amount,v_desc,'supplier_payment',v_cash_id,p_instrument_id) returning id into v_cash_id;
 v_entry_id:=public.post_journal_entry(coalesce(p_payment_date,current_date),'supplier_payment',v_cash_id,v_desc,jsonb_build_array(jsonb_build_object('account_code','2000','debit',v_amount,'credit',0),jsonb_build_object('account_code',v_asset,'debit',0,'credit',v_amount)),auth.uid());
 return jsonb_build_object('supplier_id',p_supplier_id,'amount',v_amount,'previous_balance',v_old_balance,'new_balance',v_new_balance,'method',v_method,'cash_entry_id',v_cash_id,'journal_entry_id',v_entry_id);
end; $$;

create or replace function public.get_supplier_reconciliation(p_supplier_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb;
begin
 if auth.uid() is null and auth.role()<>'service_role' and current_user<>'postgres' then raise exception 'Not authenticated'; end if;
 select coalesce(jsonb_agg(x order by x.supplier_name),'[]'::jsonb) into v_result from (select s.id supplier_id,s.name supplier_name,round(coalesce(s.opening_balance,0),2) opening_balance,round(coalesce(s.current_balance,0),2) stored_balance,round(coalesce(s.opening_balance,0)+coalesce(sum(sl.credit-sl.debit),0),2) ledger_balance,round(coalesce(s.current_balance,0)-(coalesce(s.opening_balance,0)+coalesce(sum(sl.credit-sl.debit),0)),2) variance from suppliers s left join supplier_ledger sl on sl.supplier_id=s.id and sl.type<>'opening' where p_supplier_id is null or s.id=p_supplier_id group by s.id,s.name,s.opening_balance,s.current_balance) x;
 return v_result;
end; $$;
revoke all on function public.record_supplier_payment(uuid,numeric,date,text,uuid,text,text) from public;
revoke all on function public.get_supplier_reconciliation(uuid) from public;
grant execute on function public.record_supplier_payment(uuid,numeric,date,text,uuid,text,text) to authenticated,service_role;
grant execute on function public.get_supplier_reconciliation(uuid) to authenticated,service_role;