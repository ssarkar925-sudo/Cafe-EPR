-- Purchase returns get their own immutable header/date identity.
create table if not exists public.purchase_returns (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id),
  return_number text not null unique default ('PR-'||to_char(current_date,'YYYYMMDD')||'-'||substr(gen_random_uuid()::text,1,8)),
  return_date date not null default current_date,
  reason text not null default '',
  refund_amount numeric not null default 0,
  refund_method text,
  status text not null default 'completed',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.purchase_returns enable row level security;
drop policy if exists purchase_returns_select_backoffice on public.purchase_returns;
create policy purchase_returns_select_backoffice on public.purchase_returns for select to authenticated using (public.is_back_office());
drop policy if exists purchase_returns_insert_backoffice on public.purchase_returns;
create policy purchase_returns_insert_backoffice on public.purchase_returns for insert to authenticated with check (public.is_back_office());
drop policy if exists purchase_returns_update_backoffice on public.purchase_returns;
drop policy if exists purchase_returns_delete_backoffice on public.purchase_returns;
create index if not exists idx_purchase_returns_purchase on public.purchase_returns(purchase_id, return_date);
create index if not exists idx_purchase_returns_date on public.purchase_returns(return_date);

-- Replace the legacy 5-argument implementation with a 6-argument version whose
-- last parameter has a default, so existing callers continue to work while new
-- callers can explicitly supply the accounting/return date.
drop function if exists public.process_purchase_return(uuid,jsonb,numeric,text,text);
create or replace function public.process_purchase_return(p_purchase_id uuid, p_items jsonb, p_refund_amount numeric default 0.00, p_refund_method text default null, p_reason text default '', p_return_date date default current_date)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare
  v_purchase record; v_supplier record; v_item jsonb; v_pi record; v_prod record;
  v_ret_qty numeric; v_line_reversal numeric; v_line_tax numeric; v_total_reversal numeric:=0;
  v_cur_stock numeric; v_cur_cost numeric; v_new_stock numeric; v_new_cost numeric;
  v_cur_val numeric; v_rem_val numeric; v_supplier_new_bal numeric;
  v_refund_paid numeric:=coalesce(p_refund_amount,0);
  v_method text:=lower(coalesce(nullif(trim(p_refund_method),''),'cash'));
  v_movement_id uuid; v_return_id uuid; v_return_number text;
begin
  perform pg_advisory_xact_lock(hashtextextended('erp:purchase-return',0));
  perform pg_advisory_xact_lock(hashtextextended('erp:financial-pool:bank',0));
  perform pg_advisory_xact_lock(hashtextextended('erp:financial-pool:cash',0));
  perform pg_advisory_xact_lock(hashtextextended('erp:financial-pool:credit_card',0));
  perform pg_advisory_xact_lock(hashtextextended('erp:financial-pool:upi_qr',0));
  perform pg_advisory_xact_lock(hashtextextended('erp:financial-pool:wallet',0));
  if auth.uid() is null and auth.role()<>'service_role' and current_user<>'postgres' then raise exception 'Not authenticated'; end if;
  if current_user<>'postgres' and auth.role()<>'service_role' and not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_return_date is null then raise exception 'Return date is required'; end if;
  if p_return_date>current_date then raise exception 'Return date cannot be in the future'; end if;
  if v_refund_paid<0 then raise exception 'Refund amount cannot be negative'; end if;
  if v_method not in ('cash','bank','upi','upi_qr','qr','wallet','credit_card','debit_card','card') then raise exception 'Unsupported refund method: %',v_method; end if;
  select * into v_purchase from public.purchases where id=p_purchase_id for update;
  if not found then raise exception 'Purchase record not found'; end if;
  if v_purchase.status<>'completed' then raise exception 'Only completed purchases can be returned'; end if;
  if v_purchase.supplier_id is not null then select * into v_supplier from public.suppliers where id=v_purchase.supplier_id for update; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'No items specified for return'; end if;
  perform set_config('erp.internal_stock_mutation_authorized','on',true);
  perform set_config('erp.internal_purchase_return_in_progress','on',true);
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_ret_qty:=coalesce((v_item->>'return_qty')::numeric,0);
    if v_ret_qty<=0 then raise exception 'Return quantity must be greater than 0'; end if;
    select * into v_pi from public.purchase_items where id=(v_item->>'purchase_item_id')::uuid and purchase_id=p_purchase_id for update;
    if not found then raise exception 'Purchase line item not found'; end if;
    if v_ret_qty>(v_pi.qty-coalesce(v_pi.returned_qty,0)) then raise exception 'Return quantity exceeds remaining quantity'; end if;
    v_line_reversal:=round(v_ret_qty*coalesce(v_pi.purchase_rate,0)*(1+coalesce(v_pi.gst_rate,0)/100),2);
    v_total_reversal:=v_total_reversal+v_line_reversal;
  end loop;
  if v_refund_paid>v_total_reversal then raise exception 'Refund amount (%) cannot exceed returned purchase value (%)',v_refund_paid,v_total_reversal; end if;
  insert into public.purchase_returns(purchase_id,return_date,reason,refund_amount,refund_method,created_by)
    values(p_purchase_id,p_return_date,coalesce(p_reason,''),v_refund_paid,v_method,auth.uid())
    returning id,return_number into v_return_id,v_return_number;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_ret_qty:=(v_item->>'return_qty')::numeric;
    select * into v_pi from public.purchase_items where id=(v_item->>'purchase_item_id')::uuid for update;
    select id,stock_qty,cost_price,name into v_prod from public.products where id=v_pi.product_id for update;
    v_cur_stock:=coalesce(v_prod.stock_qty,0); v_cur_cost:=coalesce(v_prod.cost_price,0);
    if v_cur_stock<v_ret_qty then raise exception 'Cannot return % units of %: current physical stock is only %',v_ret_qty,v_prod.name,v_cur_stock; end if;
    update public.purchase_items set returned_qty=coalesce(returned_qty,0)+v_ret_qty where id=v_pi.id;
    v_new_stock:=v_cur_stock-v_ret_qty; v_cur_val:=v_cur_stock*v_cur_cost; v_rem_val:=v_cur_val-(v_ret_qty*coalesce(v_pi.purchase_rate,0));
    if v_new_stock<=0 then v_new_cost:=v_cur_cost; else v_new_cost:=round(greatest(0,v_rem_val)/v_new_stock,2); end if;
    update public.products set stock_qty=v_new_stock,cost_price=v_new_cost,updated_at=now() where id=v_prod.id;
    insert into public.stock_movements(product_id,movement_date,movement_type,qty_change,unit_cost,stock_after,ref_type,ref_id,remarks,created_by)
      values(v_prod.id,p_return_date,'PURCHASE_RETURN',-v_ret_qty,v_pi.purchase_rate,v_new_stock,'purchase_return',v_return_id,'Purchase return to supplier from '||v_purchase.purchase_number||case when p_reason<>'' then ' ('||p_reason||')' else '' end,auth.uid()) returning id into v_movement_id;
    v_line_tax:=round(v_ret_qty*coalesce(v_pi.purchase_rate,0)*(coalesce(v_pi.gst_rate,0)/100),2);
    if v_line_tax>0 then perform public.post_journal_entry(p_return_date,'purchase_return_tax',v_movement_id,'GST Input reversal on purchase return '||v_purchase.purchase_number,jsonb_build_array(jsonb_build_object('account_code','2000','debit',v_line_tax,'credit',0),jsonb_build_object('account_code','2200','debit',0,'credit',v_line_tax)),auth.uid()); end if;
  end loop;
  if v_refund_paid>0 then insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id) values(p_return_date,v_method,'in',v_refund_paid,'Purchase Return Refund '||v_purchase.purchase_number,'purchase_return',v_return_id); end if;
  if v_purchase.supplier_id is not null then
    v_supplier_new_bal:=coalesce(v_supplier.current_balance,0)-v_total_reversal+v_refund_paid;
    update public.suppliers set current_balance=v_supplier_new_bal,updated_at=now() where id=v_purchase.supplier_id;
    insert into public.supplier_ledger(supplier_id,entry_date,type,description,credit,debit,balance_after,ref_type,ref_id) values(v_purchase.supplier_id,p_return_date,'return','Purchase Return Debit Note: '||v_purchase.purchase_number||case when p_reason<>'' then ' ('||p_reason||')' else '' end,v_refund_paid,v_total_reversal,v_supplier_new_bal,'purchase_return',v_return_id);
  end if;
  return jsonb_build_object('purchase_id',p_purchase_id,'purchase_number',v_purchase.purchase_number,'purchase_return_id',v_return_id,'return_number',v_return_number,'return_date',p_return_date,'total_reversal',v_total_reversal,'refund_collected',v_refund_paid,'status','completed');
end;
$function$;
grant execute on function public.process_purchase_return(uuid,jsonb,numeric,text,text,date) to authenticated;
