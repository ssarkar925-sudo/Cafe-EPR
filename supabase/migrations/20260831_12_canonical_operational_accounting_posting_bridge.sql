-- Canonical accounting bridge for operational modules.
-- The same migration is applied to the connected Cafe ERP Supabase project.

create or replace function public.accounting_instrument_account_code(p_instrument_id uuid) returns text language plpgsql stable security definer set search_path=public as $$
declare v_type text;
begin
  if p_instrument_id is null then return '1000'; end if;
  select lower(type) into v_type from public.payment_instruments where id=p_instrument_id and is_active=true;
  return case v_type
    when 'cash' then '1000' when 'bank' then '1010' when 'upi_qr' then '1020' when 'upi' then '1020'
    when 'wallet' then '1030' when 'aeps' then '1040' when 'dmt' then '1050' when 'credit_card' then '1060'
    else null end;
end $$;

create or replace function public.post_invoice_accounting_bridge() returns trigger language plpgsql security definer set search_path=public as $$
declare v_lines jsonb:='[]'::jsonb; v_pay record; v_tax numeric; v_sales numeric; v_cogs numeric; v_code text;
begin
  if new.status not in ('unpaid','partial','paid') then return new; end if;
  if exists(select 1 from public.journal_entries where source_type='invoice' and source_id=new.id) then return new; end if;
  v_tax:=coalesce(new.total_cgst,0)+coalesce(new.total_sgst,0)+coalesce(new.total_igst,0);
  v_sales:=coalesce(new.total_taxable_value,new.total-v_tax);
  for v_pay in select p.instrument_id,sum(p.amount) amount from public.payments p where p.invoice_id=new.id group by p.instrument_id loop
    v_code:=accounting_instrument_account_code(v_pay.instrument_id);
    if v_code is null then raise exception 'Invoice % has an unmapped payment instrument',new.invoice_number; end if;
    v_lines:=v_lines||jsonb_build_object('account_code',v_code,'debit',v_pay.amount,'credit',0);
  end loop;
  if coalesce(new.due,0)>0 then v_lines:=v_lines||jsonb_build_object('account_code','1300','debit',new.due,'credit',0); end if;
  if v_sales>0 then v_lines:=v_lines||jsonb_build_object('account_code','4000','debit',0,'credit',v_sales); end if;
  if v_tax>0 then v_lines:=v_lines||jsonb_build_object('account_code','2100','debit',0,'credit',v_tax); end if;
  select coalesce(sum(coalesce(ii.cost_price,0)*coalesce(ii.qty,0)),0) into v_cogs from public.invoice_items ii where ii.invoice_id=new.id and ii.product_id is not null;
  if v_cogs>0 then v_lines:=v_lines||jsonb_build_object('account_code','5000','debit',v_cogs,'credit',0)||jsonb_build_object('account_code','1200','debit',0,'credit',v_cogs); end if;
  perform public.post_journal_entry(new.invoice_date,'invoice',new.id,'Sale '||new.invoice_number,v_lines,null);
  return new;
end $$;

drop trigger if exists trg_post_invoice_accounting_bridge on public.invoices;
create trigger trg_post_invoice_accounting_bridge after update of paid,due,status on public.invoices for each row execute function public.post_invoice_accounting_bridge();

create or replace function public.post_purchase_accounting_bridge() returns trigger language plpgsql security definer set search_path=public as $$
declare v_lines jsonb:='[]'::jsonb; v_pay record; v_code text; v_subtotal numeric; v_tax numeric; v_due numeric; v_date date; v_number text;
begin
  if exists(select 1 from public.journal_entries where source_type='purchase' and source_id=new.id) then return new; end if;
  select subtotal,tax_total,due,purchase_date,purchase_number into v_subtotal,v_tax,v_due,v_date,v_number from public.purchases where id=new.id;
  if v_subtotal is null then return new; end if;
  if v_subtotal>0 then v_lines:=v_lines||jsonb_build_object('account_code','1200','debit',v_subtotal,'credit',0); end if;
  if coalesce(v_tax,0)>0 then v_lines:=v_lines||jsonb_build_object('account_code','2200','debit',v_tax,'credit',0); end if;
  for v_pay in select ce.instrument_id,sum(ce.amount) amount from public.cash_entries ce where ce.ref_type='purchase' and ce.ref_id=new.id and ce.direction='out' group by ce.instrument_id loop
    v_code:=accounting_instrument_account_code(v_pay.instrument_id);
    if v_code is null then raise exception 'Purchase % has an unmapped payment instrument',v_number; end if;
    v_lines:=v_lines||jsonb_build_object('account_code',v_code,'debit',0,'credit',v_pay.amount);
  end loop;
  if coalesce(v_due,0)>0 then v_lines:=v_lines||jsonb_build_object('account_code','2000','debit',0,'credit',v_due); end if;
  perform public.post_journal_entry(v_date,'purchase',new.id,'Purchase '||v_number,v_lines,null);
  return new;
end $$;

drop trigger if exists trg_post_purchase_accounting_bridge on public.purchases;
create constraint trigger trg_post_purchase_accounting_bridge after insert on public.purchases deferrable initially deferred for each row execute function public.post_purchase_accounting_bridge();

create or replace function public.post_quick_sale_accounting_bridge() returns trigger language plpgsql security definer set search_path=public as $$
declare v_lines jsonb:='[]'::jsonb; v_pay jsonb; v_code text; v_cost numeric;
begin
  if new.status not in ('completed','paid','active') then return new; end if;
  if exists(select 1 from public.journal_entries where source_type='quick_sale' and source_id=new.id) then return new; end if;
  for v_pay in select * from jsonb_array_elements(coalesce(new.payments,'[]'::jsonb)) loop
    v_code:=accounting_instrument_account_code(nullif(v_pay->>'instrument_id','')::uuid);
    if v_code is null then raise exception 'Quick sale % has an unmapped payment instrument',new.sale_number; end if;
    v_lines:=v_lines||jsonb_build_object('account_code',v_code,'debit',coalesce((v_pay->>'amount')::numeric,0),'credit',0);
  end loop;
  if coalesce(new.amount,0)>0 then v_lines:=v_lines||jsonb_build_object('account_code','4000','debit',0,'credit',new.amount); end if;
  v_cost:=coalesce(new.cost,0);
  if v_cost>0 then v_lines:=v_lines||jsonb_build_object('account_code','5000','debit',v_cost,'credit',0)||jsonb_build_object('account_code','1200','debit',0,'credit',v_cost); end if;
  perform public.post_journal_entry(new.sale_date,'quick_sale',new.id,'Quick Sale '||new.sale_number,v_lines,new.created_by);
  return new;
end $$;

drop trigger if exists trg_post_quick_sale_accounting_bridge on public.quick_sales;
create constraint trigger trg_post_quick_sale_accounting_bridge after insert on public.quick_sales deferrable initially deferred for each row execute function public.post_quick_sale_accounting_bridge();

create or replace function public.post_expense_accounting_bridge() returns trigger language plpgsql security definer set search_path=public as $$
declare v_code text; v_instrument uuid; v_lines jsonb;
begin
  if new.status is not null and lower(new.status) not in ('active','posted','completed','approved') then return new; end if;
  if exists(select 1 from public.journal_entries where source_type='expense' and source_id=new.id) then return new; end if;
  select ce.instrument_id into v_instrument from public.cash_entries ce where ce.ref_type='expense' and ce.ref_id=new.id and ce.direction='out' order by ce.created_at desc limit 1;
  v_code:=accounting_instrument_account_code(v_instrument);
  if v_code is null then raise exception 'Expense % has an unmapped payment instrument',new.id; end if;
  v_lines:=jsonb_build_array(jsonb_build_object('account_code','6000','debit',new.amount,'credit',0),jsonb_build_object('account_code',v_code,'debit',0,'credit',new.amount));
  perform public.post_journal_entry(new.expense_date,'expense',new.id,'Expense '||coalesce(new.category,'General'),v_lines,new.created_by);
  return new;
end $$;

drop trigger if exists trg_post_expense_accounting_bridge on public.expenses;
create constraint trigger trg_post_expense_accounting_bridge after insert on public.expenses deferrable initially deferred for each row execute function public.post_expense_accounting_bridge();

create or replace function public.post_service_transaction_accounting_bridge() returns trigger language plpgsql security definer set search_path=public as $$
declare v_code text; v_fee numeric; v_principal numeric; v_lines jsonb:='[]'::jsonb;
begin
  if lower(coalesce(new.status,'')) not in ('success','successful','completed','posted') then return new; end if;
  if exists(select 1 from public.journal_entries where source_type='service_transaction' and source_id=new.id) then return new; end if;
  v_fee:=coalesce(new.commission,0)+coalesce(new.service_fee,0)+coalesce(new.portal_commission,0)+coalesce(new.portal_charge,0)+coalesce(new.upi_fee,0);
  v_code:=accounting_instrument_account_code(coalesce(new.instrument_id,new.pay_from_instrument_id));
  if v_code is null then raise exception 'Service transaction % has no resolvable accounting instrument',new.transaction_number; end if;
  v_principal:=greatest(coalesce(new.amount,0),0);
  if lower(new.direction)='in' then
    if v_principal>0 then v_lines:=v_lines||jsonb_build_object('account_code',v_code,'debit',v_principal+v_fee,'credit',0)||jsonb_build_object('account_code','1400','debit',0,'credit',v_principal); end if;
  else
    if v_principal>0 then v_lines:=v_lines||jsonb_build_object('account_code','1400','debit',v_principal,'credit',0)||jsonb_build_object('account_code',v_code,'debit',0,'credit',v_principal); end if;
  end if;
  if v_fee>0 then v_lines:=v_lines||jsonb_build_object('account_code','4020','debit',0,'credit',v_fee); end if;
  if jsonb_array_length(v_lines)>0 then perform public.post_journal_entry(new.transaction_date,'service_transaction',new.id,'Service '||new.transaction_number,v_lines,new.created_by); end if;
  return new;
end $$;

drop trigger if exists trg_post_service_transaction_accounting_bridge on public.transactions;
create trigger trg_post_service_transaction_accounting_bridge after insert on public.transactions for each row execute function public.post_service_transaction_accounting_bridge();
