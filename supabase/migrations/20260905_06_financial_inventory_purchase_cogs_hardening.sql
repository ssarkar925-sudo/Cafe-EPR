create or replace function public.trg_post_stock_journal()
returns trigger language plpgsql security definer set search_path='public' as $$
declare v_amt numeric;
begin
  v_amt:=round(abs(new.qty_change)*coalesce(new.unit_cost,0),2);
  if v_amt<=0 then return new; end if;
  if new.movement_type='PURCHASE' then return new;
  elsif new.movement_type='SALE' then
    perform public.post_journal_entry(new.movement_date,'stock_movement',new.id,'Cost of goods sold',jsonb_build_array(jsonb_build_object('account_code','5000','debit',v_amt,'credit',0),jsonb_build_object('account_code','1200','debit',0,'credit',v_amt)),null);
  elsif new.movement_type in ('SALES_RETURN','RETURN') then
    perform public.post_journal_entry(new.movement_date,'stock_movement',new.id,'Sales return inventory reversal',jsonb_build_array(jsonb_build_object('account_code','1200','debit',v_amt,'credit',0),jsonb_build_object('account_code','5000','debit',0,'credit',v_amt)),null);
  elsif new.movement_type='PURCHASE_RETURN' then
    perform public.post_journal_entry(new.movement_date,'stock_movement',new.id,'Purchase return inventory reversal',jsonb_build_array(jsonb_build_object('account_code','2000','debit',v_amt,'credit',0),jsonb_build_object('account_code','1200','debit',0,'credit',v_amt)),null);
  elsif new.movement_type='OPENING_STOCK' then
    perform public.post_journal_entry(new.movement_date,'stock_movement',new.id,'Opening stock',jsonb_build_array(jsonb_build_object('account_code','1200','debit',v_amt,'credit',0),jsonb_build_object('account_code','3000','debit',0,'credit',v_amt)),null);
  elsif new.movement_type='ADJUSTMENT' then
    if new.qty_change>0 then
      perform public.post_journal_entry(new.movement_date,'stock_movement',new.id,'Positive inventory adjustment',jsonb_build_array(jsonb_build_object('account_code','1200','debit',v_amt,'credit',0),jsonb_build_object('account_code','5200','debit',0,'credit',v_amt)),null);
    else
      perform public.post_journal_entry(new.movement_date,'stock_movement',new.id,'Negative inventory adjustment',jsonb_build_array(jsonb_build_object('account_code','5200','debit',v_amt,'credit',0),jsonb_build_object('account_code','1200','debit',0,'credit',v_amt)),null);
    end if;
  end if;
  return new;
end; $$;

create or replace function public.post_purchase_accounting_for_id(p_purchase_id uuid)
returns void language plpgsql security definer set search_path='public' as $$
declare v_lines jsonb:='[]'::jsonb; v_pay record; v_code text; v_subtotal numeric; v_tax numeric; v_due numeric; v_paid numeric; v_cash_paid numeric; v_date date; v_number text;
begin
  if exists(select 1 from public.journal_entries where source_type='purchase' and source_id=p_purchase_id) then return; end if;
  select subtotal,tax_total,due,paid,purchase_date,purchase_number into v_subtotal,v_tax,v_due,v_paid,v_date,v_number from public.purchases where id=p_purchase_id;
  if v_subtotal is null then return; end if;
  select coalesce(sum(amount),0) into v_cash_paid from public.cash_entries where ref_type='purchase' and ref_id=p_purchase_id and direction='out';
  if coalesce(v_paid,0)>0 and round(v_cash_paid,2)<>round(v_paid,2) then return; end if;
  if v_subtotal>0 then v_lines:=v_lines||jsonb_build_object('account_code','1200','debit',v_subtotal,'credit',0); end if;
  if coalesce(v_tax,0)>0 then v_lines:=v_lines||jsonb_build_object('account_code','2200','debit',v_tax,'credit',0); end if;
  for v_pay in select ce.instrument_id,sum(ce.amount) amount from public.cash_entries ce where ce.ref_type='purchase' and ce.ref_id=p_purchase_id and ce.direction='out' group by ce.instrument_id loop
    v_code:=accounting_instrument_account_code(v_pay.instrument_id);
    if v_code is null then raise exception 'Purchase % has an unmapped payment instrument',v_number; end if;
    v_lines:=v_lines||jsonb_build_object('account_code',v_code,'debit',0,'credit',v_pay.amount);
  end loop;
  if coalesce(v_due,0)>0 then v_lines:=v_lines||jsonb_build_object('account_code','2000','debit',0,'credit',v_due); end if;
  perform public.post_journal_entry(v_date,'purchase',p_purchase_id,'Purchase '||v_number,v_lines,null);
end; $$;

create or replace function public.post_purchase_accounting_bridge()
returns trigger language plpgsql security definer set search_path='public' as $$
begin perform public.post_purchase_accounting_for_id(new.id); return new; end; $$;

create or replace function public.finalize_purchase_accounting(p_purchase_id uuid)
returns void language plpgsql security definer set search_path='public' as $$
declare v_paid numeric; v_cash_paid numeric;
begin
  select paid into v_paid from public.purchases where id=p_purchase_id for update;
  if not found then raise exception 'Purchase not found'; end if;
  select coalesce(sum(amount),0) into v_cash_paid from public.cash_entries where ref_type='purchase' and ref_id=p_purchase_id and direction='out';
  if round(v_cash_paid,2)<>round(coalesce(v_paid,0),2) then raise exception 'Purchase payment trail mismatch for %: header paid %, cash entries %',p_purchase_id,v_paid,v_cash_paid; end if;
  perform public.post_purchase_accounting_for_id(p_purchase_id);
end; $$;

create or replace function public.trg_finalize_purchase_accounting_from_cash()
returns trigger language plpgsql security definer set search_path='public' as $$
begin
  if new.ref_type='purchase' and new.direction='out' and new.ref_id is not null then perform public.finalize_purchase_accounting(new.ref_id); end if;
  return new;
end; $$;

do $$
declare v_def text; v_sig text := 'p_supplier_id uuid, p_purchase_date date, p_supplier_invoice_no text, p_items jsonb, p_payments jsonb, p_notes text';
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_purchase' and pg_get_function_identity_arguments(p.oid)=v_sig;
  if v_def is null then raise exception 'create_purchase function not found'; end if;
  v_def:=replace(v_def,'return jsonb_build_object(','perform public.finalize_purchase_accounting(v_purchase_id);'||chr(10)||'  return jsonb_build_object(');
  execute v_def;
end $$;

create or replace function public.get_inventory_reconciliation(p_product_id uuid default null)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_result jsonb;
begin
  if auth.uid() is null and auth.role()<>'service_role' and current_user<>'postgres' then raise exception 'Not authenticated'; end if;
  if auth.role()<>'service_role' and current_user<>'postgres' and not public.is_back_office() then raise exception 'Forbidden'; end if;
  select coalesce(jsonb_agg(x order by x.product_name),'[]'::jsonb) into v_result from (with ordered as (select sm.*,lag(sm.stock_after) over(partition by sm.product_id order by sm.movement_date,sm.created_at,sm.id) prev_after), calc as (select o.product_id,(array_agg(o.stock_after order by o.movement_date desc,o.created_at desc,o.id desc))[1] last_recorded_stock,count(*) movement_count,count(*) filter(where o.prev_after is not null and abs(round(o.stock_after-(o.prev_after+o.qty_change),3))>0.005) broken_chain_count,count(*) filter(where o.stock_after is null) null_stock_after_count from ordered o group by o.product_id) select p.id product_id,p.name product_name,round(coalesce(p.stock_qty,0),3) live_stock,round(coalesce(c.last_recorded_stock,0),3) ledger_stock,coalesce(c.movement_count,0) movement_count,coalesce(c.broken_chain_count,0) broken_chain_count,round(coalesce(p.stock_qty,0)-coalesce(c.last_recorded_stock,0),3) stock_variance,round(coalesce(p.stock_qty,0)*coalesce(p.cost_price,0),2) inventory_value,round(coalesce(p.cost_price,0),2) weighted_average_cost,case when c.product_id is null then 'NO_MOVEMENTS' when coalesce(c.null_stock_after_count,0)>0 or coalesce(c.broken_chain_count,0)>0 then 'BROKEN_LEDGER_CHAIN' when abs(coalesce(p.stock_qty,0)-coalesce(c.last_recorded_stock,0))>0.005 then 'STOCK_MISMATCH' else 'OK' end status from products p left join calc c on c.product_id=p.id where p_product_id is null or p.id=p_product_id) x; return v_result;
end; $$;

create or replace function public.reconcile_purchase_supplier_stock(p_purchase_id uuid default null)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v jsonb;
begin
 if auth.uid() is null and auth.role()<>'service_role' and current_user<>'postgres' then raise exception 'Not authenticated'; end if;
 if auth.role()<>'service_role' and current_user<>'postgres' and not public.is_back_office() then raise exception 'Forbidden'; end if;
 select coalesce(jsonb_agg(x order by x.purchase_number),'[]'::jsonb) into v from (select p.id purchase_id,p.purchase_number,p.supplier_id,round(p.total,2) purchase_total,round(p.paid,2) paid,round(p.due,2) due,round(coalesce(sum(pi.total_amount),0),2) line_total,round(coalesce(sum(pi.qty*pi.purchase_rate),0),2) line_taxable,round(coalesce(sum(pi.tax_amount),0),2) line_tax,round(p.total-coalesce(sum(pi.total_amount),0),2) total_variance,round(coalesce(s.current_balance,0),2) supplier_balance,round(coalesce((select sum(ce.amount) from cash_entries ce where ce.ref_type='purchase' and ce.ref_id=p.id and ce.direction='out'),0),2) payment_trail from purchases p left join purchase_items pi on pi.purchase_id=p.id left join suppliers s on s.id=p.supplier_id where p_purchase_id is null or p.id=p_purchase_id group by p.id,p.purchase_number,p.supplier_id,p.total,p.paid,p.due,s.current_balance) x; return v;
end; $$;

drop trigger if exists trg_post_purchase_accounting_bridge on public.purchases;
drop trigger if exists trg_finalize_purchase_accounting_from_cash on public.cash_entries;
create trigger trg_finalize_purchase_accounting_from_cash after insert on public.cash_entries for each row execute function public.trg_finalize_purchase_accounting_from_cash();
revoke execute on function public.finalize_purchase_accounting(uuid) from public,anon,authenticated;
grant execute on function public.finalize_purchase_accounting(uuid) to service_role;
