-- Sales-return accounting hardening
-- Canonical stock movement type is SALES_RETURN; RETURN is not a valid movement type.
-- Capture invoice-item cost on the return movement so COGS reversal is deterministic.

UPDATE public.stock_movements
SET movement_type = 'SALES_RETURN'
WHERE movement_type = 'RETURN';

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN (
    'OPENING_STOCK',
    'PURCHASE',
    'SALE',
    'SALES_RETURN',
    'PURCHASE_RETURN',
    'ADJUSTMENT'
  ));

CREATE OR REPLACE FUNCTION public.process_return(
  p_invoice_id uuid,
  p_items jsonb,
  p_refund numeric,
  p_refund_method text DEFAULT 'cash'::text,
  p_reason text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_invoice record; v_item record; v_ri jsonb; v_qty numeric; v_returned numeric:=0;
  v_old_due numeric; v_new_due numeric; v_delta numeric; v_return_id uuid; v_return_number text;
  v_full boolean:=true; v_bal numeric; v_paid_after_refund numeric; v_remaining_credit numeric;
  v_refunded_before numeric:=0; v_max_refund numeric:=0;
begin
  if auth.uid() is null and auth.role()<>'service_role' and current_user<>'postgres' then raise exception 'Not authenticated'; end if;
  if auth.role()<>'service_role' and current_user<>'postgres' and not public.is_back_office() then raise exception 'Forbidden'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status in ('cancelled','returned') then raise exception 'Invoice already returned'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'No items to return'; end if;
  if coalesce(p_refund,0)<0 then raise exception 'Invalid refund amount'; end if;
  if p_refund>0 and lower(coalesce(p_refund_method,'cash')) not in ('cash','upi','card','bank','wallet','debit_card','credit_card') then raise exception 'Invalid refund method'; end if;

  v_old_due:=greatest(0,coalesce(v_invoice.total,0)-coalesce(v_invoice.paid,0));
  select coalesce(sum(refund),0) into v_refunded_before from public.returns where invoice_id=p_invoice_id and coalesce(status,'')<>'CANCELLED';
  v_max_refund:=greatest(0,least(coalesce(v_invoice.paid,0)-v_refunded_before,coalesce(v_invoice.total,0)-coalesce(v_invoice.returned,0)));
  if p_refund>v_max_refund+0.005 then raise exception 'Refund exceeds remaining refundable amount'; end if;

  for v_ri in select * from jsonb_array_elements(p_items) loop
    v_qty:=nullif(v_ri->>'qty','')::numeric;
    if v_qty is null or v_qty<=0 then raise exception 'Invalid return quantity'; end if;
    select * into v_item from public.invoice_items where id=(v_ri->>'invoice_item_id')::uuid and invoice_id=p_invoice_id for update;
    if not found then raise exception 'Invoice item not found'; end if;
    if v_qty>(coalesce(v_item.qty,0)-coalesce(v_item.returned_qty,0)) then raise exception 'Cannot return more than quantity sold'; end if;
    v_returned:=v_returned+round((coalesce(v_item.amount,0)/greatest(coalesce(v_item.qty,1),1))*v_qty,2);
  end loop;
  if v_returned<=0 then raise exception 'Return value must be positive'; end if;
  if p_refund>least(coalesce(v_invoice.paid,0)-v_refunded_before,v_returned)+0.005 then raise exception 'Refund cannot exceed the amount collected for the returned items'; end if;

  v_paid_after_refund:=greatest(0,coalesce(v_invoice.paid,0)-coalesce(p_refund,0));
  v_new_due:=greatest(0,coalesce(v_invoice.total,0)-(coalesce(v_invoice.returned,0)+v_returned)-v_paid_after_refund);
  v_return_number:='RTN-'||lpad(nextval('public.return_number_seq')::text,4,'0');

  insert into public.returns(return_number,invoice_id,reason,subtotal,refund,refund_method,status,created_by)
  values(v_return_number,p_invoice_id,nullif(p_reason,''),v_returned,coalesce(p_refund,0),case when p_refund>0 then lower(p_refund_method) else null end,'completed',auth.uid()) returning id into v_return_id;

  for v_ri in select * from jsonb_array_elements(p_items) loop
    v_qty:=(v_ri->>'qty')::numeric;
    select * into v_item from public.invoice_items where id=(v_ri->>'invoice_item_id')::uuid for update;
    insert into public.return_items(return_id,invoice_item_id,product_id,service_id,qty,rate,amount)
    values(v_return_id,v_item.id,v_item.product_id,v_item.service_id,v_qty,v_item.rate,round((coalesce(v_item.amount,0)/greatest(coalesce(v_item.qty,1),1))*v_qty,2));
    update public.invoice_items set returned_qty=coalesce(returned_qty,0)+v_qty where id=v_item.id;
    if v_item.product_id is not null then
      perform set_config('erp.internal_stock_mutation_authorized','on',true);
      update public.products set stock_qty=coalesce(stock_qty,0)+v_qty,updated_at=now() where id=v_item.product_id;
      insert into public.stock_movements(product_id,movement_date,movement_type,qty_change,unit_cost,stock_after,ref_type,ref_id,remarks,created_by)
      select v_item.product_id,current_date,'SALES_RETURN',v_qty,coalesce(v_item.cost_price,0),p.stock_qty,'return',v_return_id,'Return '||v_return_number,auth.uid()
      from public.products p where p.id=v_item.product_id;
    end if;
  end loop;

  if p_refund>0 then
    declare v_leg record; v_remaining numeric:=p_refund; v_leg_refund numeric;
    begin
      for v_leg in select method,instrument_id,amount from public.payments where invoice_id=p_invoice_id and amount>0 order by amount desc loop
        exit when v_remaining<=0.005;
        v_leg_refund:=round(least(v_leg.amount,v_remaining),2);
        if v_leg_refund>0 then
          insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
          values(current_date,v_leg.method,'out',v_leg_refund,'Refund '||v_invoice.invoice_number||' ('||v_return_number||')','return',v_return_id,v_leg.instrument_id);
          v_remaining:=round(v_remaining-v_leg_refund,2);
        end if;
      end loop;
      if v_remaining>0.005 then raise exception 'Refund could not be matched to collected payments'; end if;
    end;
  end if;

  select coalesce(bool_and(coalesce(i.returned_qty,0)>=i.qty),false) into v_full from public.invoice_items i where i.invoice_id=p_invoice_id;
  v_remaining_credit:=greatest(0,v_paid_after_refund-(coalesce(v_invoice.total,0)-(coalesce(v_invoice.returned,0)+v_returned)));
  v_delta:=greatest(0,v_old_due-v_new_due);
  if v_invoice.customer_id is not null and (v_delta>0 or v_remaining_credit>0) then
    update public.customers set balance=balance-v_delta-v_remaining_credit,updated_at=now() where id=v_invoice.customer_id;
    select balance into v_bal from public.customers where id=v_invoice.customer_id;
    insert into public.customer_ledger(customer_id,entry_date,type,description,credit,balance_after,ref_id)
    values(v_invoice.customer_id,current_date,'return','Return '||v_return_number||' ('||v_invoice.invoice_number||')',v_delta+v_remaining_credit,v_bal,v_return_id);
  end if;
  update public.invoices set returned=coalesce(returned,0)+v_returned,refunded=coalesce(refunded,0)+coalesce(p_refund,0),paid=v_paid_after_refund,due=v_new_due,status=case when v_full then 'cancelled' when v_new_due<=0 then 'paid' when v_paid_after_refund>0 then 'partial' else 'unpaid' end,returned_at=case when v_full then now() else returned_at end where id=p_invoice_id;
  insert into public.audit_logs(user_id,user_name,action,entity,entity_id,description,details)
  values(auth.uid(),null,'return_processed','returns',v_return_id::text,'Return '||v_return_number||' on '||v_invoice.invoice_number,jsonb_build_object('invoice_number',v_invoice.invoice_number,'returned',v_returned,'refund',coalesce(p_refund,0),'full',v_full));
  return jsonb_build_object('ok',true,'return_id',v_return_id,'return_number',v_return_number,'returned',v_returned,'refund',coalesce(p_refund,0),'full',v_full,'paid',v_paid_after_refund,'due',v_new_due,'status',case when v_full then 'cancelled' when v_new_due<=0 then 'paid' when v_paid_after_refund>0 then 'partial' else 'unpaid' end);
end;
$function$;

-- Explicitly retain the canonical stock journal trigger.
DROP TRIGGER IF EXISTS stock_movement_journal ON public.stock_movements;
CREATE TRIGGER stock_movement_journal
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.trg_post_stock_journal();
