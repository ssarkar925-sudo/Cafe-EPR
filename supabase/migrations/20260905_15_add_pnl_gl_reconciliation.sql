create or replace function public.get_pnl_gl_reconciliation(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := coalesce(p_from,date '1900-01-01');
  v_to date := coalesce(p_to,date '2999-12-31');
  v_pnl jsonb;
  v_revenue numeric := 0;
  v_returns numeric := 0;
  v_cogs numeric := 0;
  v_commission numeric := 0;
  v_gl_revenue numeric := 0;
  v_gl_returns numeric := 0;
  v_gl_cogs numeric := 0;
  v_gl_commission numeric := 0;
  v_expense_journals bigint := 0;
  v_orphan_invoice_journals bigint := 0;
  v_unbalanced bigint := 0;
begin
  if auth.role()<>'service_role' and current_user<>'postgres' then
    if auth.uid() is null or not public.is_back_office() then raise exception 'Back-office access required'; end if;
  end if;

  v_pnl := public.get_pnl_internal(v_from,v_to);
  v_revenue := coalesce((v_pnl->>'revenue')::numeric,0);
  v_returns := coalesce((v_pnl->>'returns')::numeric,0);
  v_cogs := coalesce((v_pnl->>'product_cogs')::numeric,0);
  v_commission := coalesce((v_pnl->>'commission')::numeric,0);

  select coalesce(sum(jl.credit-jl.debit),0) into v_gl_revenue
  from journal_entries je join journal_lines jl on jl.journal_entry_id=je.id join accounting_accounts aa on aa.id=jl.account_id
  where je.status='posted' and je.entry_date between v_from and v_to and aa.code in ('4000','4010','4020');

  select coalesce(sum(jl.debit-jl.credit),0) into v_gl_returns
  from journal_entries je join journal_lines jl on jl.journal_entry_id=je.id join accounting_accounts aa on aa.id=jl.account_id
  where je.status='posted' and je.entry_date between v_from and v_to and aa.code='5100';

  select coalesce(sum(jl.debit-jl.credit),0) into v_gl_cogs
  from journal_entries je join journal_lines jl on jl.journal_entry_id=je.id join accounting_accounts aa on aa.id=jl.account_id
  where je.status='posted' and je.entry_date between v_from and v_to and aa.code='5000';

  select coalesce(sum(jl.credit-jl.debit),0) into v_gl_commission
  from journal_entries je join journal_lines jl on jl.journal_entry_id=je.id join accounting_accounts aa on aa.id=jl.account_id
  where je.status='posted' and je.entry_date between v_from and v_to and aa.code='4030';

  select count(*) into v_expense_journals
  from journal_entries je
  where je.status='posted' and je.entry_date between v_from and v_to and je.source_type='expense';

  select count(*) into v_orphan_invoice_journals
  from journal_entries je
  where je.status='posted' and je.source_type='invoice'
    and not exists(select 1 from invoices i where i.id=je.source_id);

  select count(*) into v_unbalanced
  from (select je.id from journal_entries je join journal_lines jl on jl.journal_entry_id=je.id where je.status='posted' group by je.id having abs(sum(coalesce(jl.debit,0))-sum(coalesce(jl.credit,0)))>.01) x;

  return jsonb_build_object(
    'from',v_from,'to',v_to,
    'pnl',jsonb_build_object('revenue',v_revenue,'returns',v_returns,'product_cogs',v_cogs,'commission',v_commission),
    'posted_gl',jsonb_build_object('revenue',round(v_gl_revenue,2),'returns',round(v_gl_returns,2),'product_cogs',round(v_gl_cogs,2),'commission',round(v_gl_commission,2)),
    'variance',jsonb_build_object('revenue',round(v_revenue-v_gl_revenue,2),'returns',round(v_returns-v_gl_returns,2),'product_cogs',round(v_cogs-v_gl_cogs,2),'commission',round(v_commission-v_gl_commission,2)),
    'expense_journal_count',v_expense_journals,'orphan_invoice_journals',v_orphan_invoice_journals,'unbalanced_posted_journals',v_unbalanced,
    'status',case when abs(v_revenue-v_gl_revenue)<.01 and abs(v_returns-v_gl_returns)<.01 and abs(v_cogs-v_gl_cogs)<.01 and abs(v_commission-v_gl_commission)<.01 and v_orphan_invoice_journals=0 and v_unbalanced=0 then 'ok' else 'mismatch' end
  );
end;
$$;
grant execute on function public.get_pnl_gl_reconciliation(date,date) to authenticated;
