-- Keep invoice payment state canonical: outstanding due is always total - paid.
create or replace function public.record_invoice_payment(p_invoice_id uuid, p_method text, p_amount numeric, p_instrument_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_invoice record; v_due_before numeric; v_due_after numeric; v_method text; v_inst_type text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  v_method := lower(coalesce(nullif(btrim(p_method),''),'cash'));
  if p_instrument_id is not null then
    select type into v_inst_type from public.payment_instruments where id=p_instrument_id and is_active=true;
    if v_inst_type is null then raise exception 'Unknown or inactive payment instrument'; end if;
    v_method := case v_inst_type when 'cash' then 'cash' when 'bank' then 'bank' when 'wallet' then 'wallet' when 'upi' then 'upi' when 'debit_card' then 'debit_card' when 'credit_card' then 'credit_card' else null end;
    if v_method is null then raise exception 'Payment instrument type % cannot be used for invoice payment', v_inst_type; end if;
  else
    if v_method not in ('cash','upi','card','bank','wallet','debit_card','credit_card') then raise exception 'Invalid payment method'; end if;
    if v_method <> 'cash' then raise exception 'A payment instrument is required for % payments', v_method; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('erp:invoice:'||p_invoice_id::text,0));
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status in ('cancelled','returned') then raise exception 'Cannot pay a cancelled or returned invoice'; end if;
  v_due_before := greatest(0, coalesce(v_invoice.total,0)-coalesce(v_invoice.paid,0));
  if p_amount > v_due_before + 0.005 then raise exception 'Payment exceeds outstanding due'; end if;
  v_due_after := greatest(0,v_due_before-p_amount);
  insert into public.payments(invoice_id,method,amount,instrument_id) values(p_invoice_id,v_method,p_amount,p_instrument_id);
  insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id) values(current_date,v_method,'in',p_amount,'Payment '||v_invoice.invoice_number,'invoice',p_invoice_id,p_instrument_id);
  update public.invoices set paid=coalesce(paid,0)+p_amount,due=v_due_after,status=case when v_due_after<=0.005 then 'paid' else 'partial' end where id=p_invoice_id;
  if v_invoice.customer_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('erp:customer:'||v_invoice.customer_id::text,0));
    update public.customers set balance=balance-p_amount,updated_at=now() where id=v_invoice.customer_id;
    insert into public.customer_ledger(customer_id,entry_date,type,description,credit,balance_after,ref_id) values(v_invoice.customer_id,current_date,'payment','Payment on '||v_invoice.invoice_number,p_amount,(select balance from public.customers where id=v_invoice.customer_id),p_invoice_id);
  end if;
  return (select jsonb_build_object('id',id,'invoice_number',invoice_number,'total',total,'paid',paid,'due',due,'status',status) from public.invoices where id=p_invoice_id);
end; $$;
