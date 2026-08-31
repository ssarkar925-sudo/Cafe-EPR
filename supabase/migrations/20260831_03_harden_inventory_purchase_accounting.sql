-- Inventory/Purchases integration hardening.
-- 1) Prevent duplicate supplier bill references per supplier.
-- 2) Validate purchase GST rates.
-- 3) Post recoverable GST Input journals for purchase lines.
-- 4) Reverse GST Input on purchase returns.
-- 5) Make cash refunds on purchase returns settle Accounts Payable.

create unique index if not exists purchases_supplier_invoice_unique
  on public.purchases (supplier_id, lower(btrim(supplier_invoice_no)))
  where supplier_id is not null and supplier_invoice_no is not null and btrim(supplier_invoice_no) <> '';

alter table public.purchase_items
  drop constraint if exists purchase_items_gst_rate_check;
alter table public.purchase_items
  add constraint purchase_items_gst_rate_check check (gst_rate >= 0 and gst_rate <= 100);

create or replace function public.trg_post_cash_entry_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_asset text; v_dr text; v_cr text; v_desc text; v_source uuid; v_amount numeric;
begin
  if new.amount <= 0 then return new; end if;
  v_asset:=public.accounting_asset_code(new.method); v_amount:=round(new.amount,2); v_source:=new.id;
  if new.direction='in' then
    v_dr:=v_asset;
    v_cr:=case new.ref_type when 'return' then '5100' when 'expense' then '1400' when 'purchase_return' then '2000' when 'transaction' then '4010' else '1400' end;
  else
    v_cr:=v_asset;
    v_dr:=case new.ref_type when 'expense' then '6000' when 'invoice' then '1300' when 'quick_sale' then '1400' when 'purchase' then '2000' when 'return' then '5100' when 'purchase_return' then '2000' when 'transaction' then '1400' when 'day_close' then '3000' when 'settlement' then '1400' else '1400' end;
  end if;
  v_desc:=coalesce(new.description,'Cash movement');
  perform public.post_journal_entry(new.entry_date,'cash_entry',v_source,v_desc,jsonb_build_array(jsonb_build_object('account_code',v_dr,'debit',v_amount,'credit',0),jsonb_build_object('account_code',v_cr,'debit',0,'credit',v_amount)),null);
  return new;
end;
$$;

create or replace function public.create_purchase(p_supplier_id uuid,p_purchase_date date,p_supplier_invoice_no text,p_items jsonb,p_payments jsonb,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_purchase_id uuid; v_purchase_number text; v_supplier record; v_supplier_name text:='Supplier'; v_item jsonb; v_payment jsonb;
  v_subtotal numeric:=0; v_tax_total numeric:=0; v_total numeric:=0; v_paid numeric:=0; v_due numeric:=0;
  v_prod record; v_item_qty numeric; v_item_rate numeric; v_item_tax numeric; v_item_gst_rate numeric; v_item_total numeric; v_item_taxable numeric;
  v_cur_stock numeric; v_cur_cost numeric; v_new_stock numeric; v_new_cost numeric; v_method text; v_instrument_id uuid; v_supplier_new_balance numeric; v_movement_id uuid;
begin
  if auth.uid() is null and auth.role()<>'service_role' and current_user<>'postgres' then raise exception 'Not authenticated'; end if;
  if current_user<>'postgres' and auth.role()<>'service_role' and not public.is_back_office() then raise exception 'Forbidden'; end if;
  perform pg_advisory_xact_lock(hashtextextended('erp:purchase-create',0));
  if p_supplier_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('erp:supplier:'||p_supplier_id::text,0));
    select * into v_supplier from public.suppliers where id=p_supplier_id for update;
    if not found then raise exception 'Supplier not found'; end if;
    v_supplier_name:=coalesce(v_supplier.name,'Supplier');
  end if;
  if p_supplier_invoice_no is not null and btrim(p_supplier_invoice_no)<>'' and p_supplier_id is not null and exists(select 1 from public.purchases where supplier_id=p_supplier_id and lower(btrim(supplier_invoice_no))=lower(btrim(p_supplier_invoice_no))) then
    raise exception 'Supplier invoice % is already recorded for this supplier',btrim(p_supplier_invoice_no);
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Purchase must contain at least one line item'; end if;
  perform set_config('erp.internal_stock_mutation_authorized','on',true);
  v_purchase_number:=public.generate_purchase_number();
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_qty:=coalesce((v_item->>'qty')::numeric,0); v_item_rate:=coalesce((v_item->>'purchase_rate')::numeric,0); v_item_gst_rate:=coalesce((v_item->>'gst_rate')::numeric,0);
    if v_item_qty<=0 then raise exception 'Item quantity must be greater than 0'; end if;
    if v_item_rate<0 then raise exception 'Item purchase rate cannot be negative'; end if;
    if v_item_gst_rate<0 or v_item_gst_rate>100 then raise exception 'GST rate must be between 0 and 100'; end if;
    v_item_taxable:=round(v_item_qty*v_item_rate,2); v_item_tax:=round(v_item_taxable*(v_item_gst_rate/100),2); v_item_total:=v_item_taxable+v_item_tax;
    v_subtotal:=v_subtotal+v_item_taxable; v_tax_total:=v_tax_total+v_item_tax; v_total:=v_total+v_item_total;
  end loop;
  if p_payments is not null and jsonb_typeof(p_payments)='array' then for v_payment in select * from jsonb_array_elements(p_payments) loop v_paid:=v_paid+coalesce((v_payment->>'amount')::numeric,0); end loop; end if;
  if v_paid>v_total then raise exception 'Paid amount (%) exceeds total purchase amount (%)',v_paid,v_total; end if;
  v_due:=v_total-v_paid;
  insert into public.purchases(purchase_number,supplier_id,supplier_invoice_no,purchase_date,subtotal,tax_total,total,paid,due,status,notes,created_by)
  values(v_purchase_number,p_supplier_id,p_supplier_invoice_no,coalesce(p_purchase_date,current_date),v_subtotal,v_tax_total,v_total,v_paid,v_due,'completed',p_notes,auth.uid()) returning id into v_purchase_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_qty:=(v_item->>'qty')::numeric; v_item_rate:=(v_item->>'purchase_rate')::numeric; v_item_gst_rate:=coalesce((v_item->>'gst_rate')::numeric,0);
    v_item_taxable:=round(v_item_qty*v_item_rate,2); v_item_tax:=round(v_item_taxable*(v_item_gst_rate/100),2); v_item_total:=v_item_taxable+v_item_tax;
    select id,stock_qty,cost_price,name into v_prod from public.products where id=(v_item->>'product_id')::uuid for update;
    if not found then raise exception 'Product % not found',v_item->>'product_id'; end if;
    v_cur_stock:=coalesce(v_prod.stock_qty,0); v_cur_cost:=coalesce(v_prod.cost_price,0); v_new_stock:=v_cur_stock+v_item_qty;
    if v_cur_stock<=0 then v_new_cost:=v_item_rate; else v_new_cost:=round(((v_cur_stock*v_cur_cost)+(v_item_qty*v_item_rate))/v_new_stock,2); end if;
    update public.products set stock_qty=v_new_stock,cost_price=v_new_cost,updated_at=now() where id=v_prod.id;
    insert into public.purchase_items(purchase_id,product_id,qty,purchase_rate,taxable_value,gst_rate,tax_amount,total_amount) values(v_purchase_id,v_prod.id,v_item_qty,v_item_rate,v_item_taxable,v_item_gst_rate,v_item_tax,v_item_total);
    insert into public.stock_movements(product_id,movement_date,movement_type,qty_change,unit_cost,stock_after,ref_type,ref_id,remarks,created_by)
    values(v_prod.id,coalesce(p_purchase_date,current_date),'PURCHASE',v_item_qty,v_item_rate,v_new_stock,'purchase',v_purchase_id,'Inward restock from '||v_purchase_number,auth.uid()) returning id into v_movement_id;
    if v_item_tax>0 then perform public.post_journal_entry(coalesce(p_purchase_date,current_date),'purchase_tax',v_movement_id,'GST Input on purchase '||v_purchase_number,jsonb_build_array(jsonb_build_object('account_code','2200','debit',v_item_tax,'credit',0),jsonb_build_object('account_code','2000','debit',0,'credit',v_item_tax)),auth.uid()); end if;
  end loop;
  if p_payments is not null and jsonb_typeof(p_payments)='array' then
    for v_payment in select * from jsonb_array_elements(p_payments) loop
      v_method:=lower(coalesce(v_payment->>'method','cash')); v_instrument_id:=nullif(v_payment->>'instrument_id','')::uuid;
      if v_instrument_id is not null then select type into v_method from public.payment_instruments where id=v_instrument_id and is_active=true; if v_method is null then raise exception 'Unknown payment instrument'; end if; end if;
      if coalesce((v_payment->>'amount')::numeric,0)>0 then insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id) values(coalesce(p_purchase_date,current_date),v_method,'out',(v_payment->>'amount')::numeric,'Purchase '||v_purchase_number||' payment ('||v_supplier_name||')','purchase',v_purchase_id,v_instrument_id); end if;
    end loop;
  end if;
  if p_supplier_id is not null then
    v_supplier_new_balance:=coalesce(v_supplier.current_balance,0)+v_due;
    update public.suppliers set current_balance=v_supplier_new_balance,updated_at=now() where id=p_supplier_id;
    insert into public.supplier_ledger(supplier_id,entry_date,type,description,credit,debit,balance_after,ref_type,ref_id) values(p_supplier_id,coalesce(p_purchase_date,current_date),'purchase','Inward Purchase Bill '||v_purchase_number||case when v_due>0 then ' (Due: ₹'||v_due::text||')' else ' (Paid)' end,v_total,v_paid,v_supplier_new_balance,'purchase',v_purchase_id);
  end if;
  return jsonb_build_object('id',v_purchase_id,'purchase_number',v_purchase_number,'total',v_total,'paid',v_paid,'due',v_due,'status','completed');
end;
$$;

create or replace function public.process_purchase_return(p_purchase_id uuid,p_items jsonb,p_refund_amount numeric default 0.00,p_refund_method text default null,p_reason text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_purchase record; v_supplier record; v_item jsonb; v_pi record; v_prod record; v_ret_qty numeric; v_line_reversal numeric; v_line_tax numeric; v_total_reversal numeric:=0;
  v_cur_stock numeric; v_cur_cost numeric; v_new_stock numeric; v_new_cost numeric; v_cur_val numeric; v_rem_val numeric; v_supplier_new_bal numeric;
  v_refund_paid numeric:=coalesce(p_refund_amount,0); v_method text:=lower(coalesce(nullif(trim(p_refund_method),''),'cash')); v_movement_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('erp:purchase-return',0));
  perform pg_advisory_xact_lock(hashtextextended('erp:financial-pool:bank',0)); perform pg_advisory_xact_lock(hashtextextended('erp:financial-pool:cash',0));
  perform pg_advisory_xact_lock(hashtextextended('erp:financial-pool:credit_card',0)); perform pg_advisory_xact_lock(hashtextextended('erp:financial-pool:upi_qr',0)); perform pg_advisory_xact_lock(hashtextextended('erp:financial-pool:wallet',0));
  if auth.uid() is null and auth.role()<>'service_role' and current_user<>'postgres' then raise exception 'Not authenticated'; end if;
  if current_user<>'postgres' and auth.role()<>'service_role' and not public.is_back_office() then raise exception 'Forbidden'; end if;
  if v_refund_paid<0 then raise exception 'Refund amount cannot be negative'; end if;
  if v_method not in ('cash','bank','upi','upi_qr','qr','wallet','credit_card','debit_card','card') then raise exception 'Unsupported refund method: %',v_method; end if;
  select * into v_purchase from public.purchases where id=p_purchase_id for update; if not found then raise exception 'Purchase record not found'; end if;
  if v_purchase.status<>'completed' then raise exception 'Only completed purchases can be returned'; end if;
  if v_purchase.supplier_id is not null then select * into v_supplier from public.suppliers where id=v_purchase.supplier_id for update; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'No items specified for return'; end if;
  perform set_config('erp.internal_stock_mutation_authorized','on',true); perform set_config('erp.internal_purchase_return_in_progress','on',true);
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_ret_qty:=coalesce((v_item->>'return_qty')::numeric,0); if v_ret_qty<=0 then raise exception 'Return quantity must be greater than 0'; end if;
    select * into v_pi from public.purchase_items where id=(v_item->>'purchase_item_id')::uuid and purchase_id=p_purchase_id for update; if not found then raise exception 'Purchase line item not found'; end if;
    if v_ret_qty>(v_pi.qty-coalesce(v_pi.returned_qty,0)) then raise exception 'Return quantity exceeds remaining quantity'; end if;
    v_line_reversal:=round(v_ret_qty*coalesce(v_pi.purchase_rate,0)*(1+coalesce(v_pi.gst_rate,0)/100),2); v_total_reversal:=v_total_reversal+v_line_reversal;
  end loop;
  if v_refund_paid>v_total_reversal then raise exception 'Refund amount (%) cannot exceed returned purchase value (%)',v_refund_paid,v_total_reversal; end if;
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
    values(v_prod.id,current_date,'PURCHASE_RETURN',-v_ret_qty,v_pi.purchase_rate,v_new_stock,'purchase_return',p_purchase_id,'Purchase return to supplier from '||v_purchase.purchase_number||case when p_reason<>'' then ' ('||p_reason||')' else '' end,auth.uid()) returning id into v_movement_id;
    v_line_tax:=round(v_ret_qty*coalesce(v_pi.purchase_rate,0)*(coalesce(v_pi.gst_rate,0)/100),2);
    if v_line_tax>0 then perform public.post_journal_entry(current_date,'purchase_return_tax',v_movement_id,'GST Input reversal on purchase return '||v_purchase.purchase_number,jsonb_build_array(jsonb_build_object('account_code','2000','debit',v_line_tax,'credit',0),jsonb_build_object('account_code','2200','debit',0,'credit',v_line_tax)),auth.uid()); end if;
  end loop;
  if v_refund_paid>0 then insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id) values(current_date,v_method,'in',v_refund_paid,'Purchase Return Refund '||v_purchase.purchase_number,'purchase_return',p_purchase_id); end if;
  if v_purchase.supplier_id is not null then
    v_supplier_new_bal:=coalesce(v_supplier.current_balance,0)-v_total_reversal+v_refund_paid;
    update public.suppliers set current_balance=v_supplier_new_bal,updated_at=now() where id=v_purchase.supplier_id;
    insert into public.supplier_ledger(supplier_id,entry_date,type,description,credit,debit,balance_after,ref_type,ref_id) values(v_purchase.supplier_id,current_date,'return','Purchase Return Debit Note: '||v_purchase.purchase_number||case when p_reason<>'' then ' ('||p_reason||')' else '' end,v_refund_paid,v_total_reversal,v_supplier_new_bal,'purchase_return',p_purchase_id);
  end if;
  return jsonb_build_object('purchase_id',p_purchase_id,'purchase_number',v_purchase.purchase_number,'total_reversal',v_total_reversal,'refund_collected',v_refund_paid,'status','completed');
end;
$$;