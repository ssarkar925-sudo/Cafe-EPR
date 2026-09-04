-- Fix atomic customer payment to match the live payments schema.
-- The payments table has no `note` column; retain the payment description in the
-- customer ledger/cash entry and use only supported payment columns here.

create or replace function public.record_customer_payment_atomic(
  p_customer_id uuid,
  p_entry_date date,
  p_amount numeric,
  p_method text default 'cash',
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric := round(coalesce(p_amount,0),2);
  v_method text := lower(coalesce(nullif(trim(p_method),''),'cash'));
  v_prev numeric;
  v_new numeric;
  v_name text;
  v_ledger uuid;
  v_remaining numeric := v_amount;
  v_allocated numeric := 0;
  v_invoice_count integer := 0;
  v_inv record;
  v_due numeric;
  v_applied numeric;
  v_new_paid numeric;
  v_new_due numeric;
begin
  if auth.uid() is null and auth.role() <> 'service_role' and current_user <> 'postgres' then raise exception 'Not authenticated'; end if;
  if current_user <> 'postgres' and auth.role() <> 'service_role' and not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_customer_id is null or v_amount <= 0 then raise exception 'Customer and positive amount are required'; end if;
  if v_method not in ('cash','upi','card','bank','wallet','debit_card','credit_card') then raise exception 'Invalid payment method'; end if;

  for v_inv in
    select id, invoice_number, total, paid, due, status
    from public.invoices
    where customer_id=p_customer_id and status <> 'cancelled'
      and greatest(0,coalesce(total,0)-coalesce(paid,0)) > 0.005
    order by invoice_date asc, created_at asc, id asc
    for update
  loop
    exit when v_remaining <= 0;
    v_due := greatest(0, round(coalesce(v_inv.total,0)-coalesce(v_inv.paid,0),2));
    v_applied := least(v_remaining, v_due);
    if v_applied <= 0 then continue; end if;
    v_new_paid := round(coalesce(v_inv.paid,0)+v_applied,2);
    v_new_due := greatest(0, round(coalesce(v_inv.total,0)-v_new_paid,2));

    insert into public.payments(invoice_id, amount, method, received_at)
    values (v_inv.id, v_applied, v_method, coalesce(p_entry_date,current_date)::timestamp with time zone);

    update public.invoices
    set paid=v_new_paid, due=v_new_due,
        status=case when v_new_due <= 0.005 then 'paid' else 'partial' end,
        updated_at=now()
    where id=v_inv.id;

    v_remaining := round(v_remaining-v_applied,2);
    v_allocated := round(v_allocated+v_applied,2);
    v_invoice_count := v_invoice_count+1;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended('erp:customer:'||p_customer_id::text,0));
  select coalesce(balance,0), name into v_prev, v_name
  from public.customers where id=p_customer_id for update;
  if not found then raise exception 'Customer not found'; end if;

  v_new := round(v_prev-v_amount,2);
  update public.customers set balance=v_new, updated_at=now() where id=p_customer_id;

  insert into public.customer_ledger(customer_id,entry_date,type,description,debit,credit,balance_after)
  values (
    p_customer_id,
    coalesce(p_entry_date,current_date),
    case when v_remaining > 0.005 then 'advance' else 'payment' end,
    coalesce(p_description,'Payment received') || case when v_remaining > 0.005 then ' (unallocated advance)' else '' end,
    0,v_amount,v_new
  ) returning id into v_ledger;

  insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id)
  values (coalesce(p_entry_date,current_date),v_method,'in',v_amount,'Customer payment - '||v_name,'customer_payment',v_ledger);

  return jsonb_build_object('ok',true,'customer_id',p_customer_id,'balance',v_new,'ledger_id',v_ledger,
    'allocated_amount',v_allocated,'advance_amount',greatest(0,v_remaining),'invoice_count',v_invoice_count);
end;
$$;
