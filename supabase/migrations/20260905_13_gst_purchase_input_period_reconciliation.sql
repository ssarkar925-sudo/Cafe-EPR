create or replace function public.get_gst_purchase_return_reconciliation(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := coalesce(p_from, date '1900-01-01');
  v_to date := coalesce(p_to, date '2999-12-31');
  v_purchase_tax numeric := 0;
  v_return_tax numeric := 0;
  v_return_ap_tax numeric := 0;
  v_return_control_tax numeric := 0;
  v_net_input numeric := 0;
  v_control_input numeric := 0;
  v_variance numeric := 0;
  v_return_journal_variance numeric := 0;
  v_purchase_count bigint := 0;
  v_return_count bigint := 0;
begin
  if auth.role() <> 'service_role' and current_user <> 'postgres' then
    if auth.uid() is null or not public.is_back_office() then raise exception 'Back-office access required'; end if;
  end if;

  select coalesce(sum(pi.tax_amount),0), count(distinct p.id)
    into v_purchase_tax, v_purchase_count
  from public.purchase_items pi
  join public.purchases p on p.id=pi.purchase_id
  where p.status <> 'cancelled'
    and p.purchase_date between v_from and v_to;

  select coalesce(sum(case when aa.code='2200' then jl.credit-jl.debit else 0 end),0),
         coalesce(sum(case when aa.code='2000' then jl.debit-jl.credit else 0 end),0),
         count(distinct je.id)
    into v_return_control_tax, v_return_ap_tax, v_return_count
  from public.journal_entries je
  join public.journal_lines jl on jl.journal_entry_id=je.id
  join public.accounting_accounts aa on aa.id=jl.account_id
  where je.source_type='purchase_return_tax'
    and je.status='posted'
    and je.entry_date between v_from and v_to
    and aa.code in ('2000','2200');

  v_return_tax := v_return_control_tax;
  v_net_input := round(v_purchase_tax-v_return_tax,2);
  v_control_input := round(v_purchase_tax-v_return_control_tax,2);
  v_variance := round(v_net_input-v_control_input,2);
  v_return_journal_variance := round(v_return_ap_tax-v_return_control_tax,2);

  return jsonb_build_object(
    'from',v_from,
    'to',v_to,
    'purchase_count',v_purchase_count,
    'purchase_input_gst',round(v_purchase_tax,2),
    'purchase_return_count',v_return_count,
    'purchase_return_gst_reversal',round(v_return_tax,2),
    'net_input_gst',v_net_input,
    'purchase_return_tax_journal',round(v_return_control_tax,2),
    'purchase_return_ap_tax_journal',round(v_return_ap_tax,2),
    'purchase_return_journal_variance',v_return_journal_variance,
    'input_control_position',v_control_input,
    'variance',v_variance,
    'status',case when abs(v_variance)<0.01 and abs(v_return_journal_variance)<0.01 then 'ok' else 'mismatch' end,
    'period_basis','purchase input GST by purchase_date; purchase-return GST reversal by posted purchase_return_tax journal entry_date'
  );
end;
$$;
grant execute on function public.get_gst_purchase_return_reconciliation(date,date) to authenticated;
