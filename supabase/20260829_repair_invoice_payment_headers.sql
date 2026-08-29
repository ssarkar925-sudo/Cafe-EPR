-- Reconcile non-cancelled invoice paid/due/status fields to canonical payment rows.
-- Safe for historical data: payment rows are not modified.
do $$
declare r record; v_paid numeric; v_due numeric; v_status text;
begin
  for r in
    select i.id,i.total,coalesce(sum(p.amount),0) payment_sum
    from public.invoices i
    left join public.payments p on p.invoice_id=i.id
    where i.status <> 'cancelled'
    group by i.id
    having abs(i.paid-coalesce(sum(p.amount),0))>0.01
  loop
    v_paid := round(least(r.total,r.payment_sum),2);
    v_due := round(greatest(r.total-v_paid,0),2);
    v_status := case when v_paid >= r.total then 'paid' when v_paid > 0 then 'partial' else 'unpaid' end;
    update public.invoices set paid=v_paid,due=v_due,status=v_status where id=r.id;
  end loop;
end $$;
