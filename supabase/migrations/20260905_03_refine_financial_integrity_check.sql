create or replace function public.get_financial_integrity_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_customer_mismatch bigint;
  v_customer_unseeded bigint;
  v_unbalanced_journals bigint;
  v_settlement_cash_duplicates bigint;
  v_pool jsonb;
begin
  if auth.role() <> 'service_role' and current_user <> 'postgres' then
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not public.is_back_office() then raise exception 'Forbidden'; end if;
  end if;

  select count(*) filter (where status='mismatch'),
         count(*) filter (where status='unseeded' and abs(stored_balance) > 0.01)
  into v_customer_mismatch, v_customer_unseeded
  from public.get_customer_ledger_reconciliation(null);

  select count(*) into v_unbalanced_journals
  from (
    select je.id
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id=je.id
    where je.status='posted'
    group by je.id
    having abs(sum(coalesce(jl.debit,0))-sum(coalesce(jl.credit,0))) > 0.01
  ) x;

  select count(*) into v_settlement_cash_duplicates
  from (
    select ref_id, method, direction, count(*) as n
    from public.cash_entries
    where ref_type='settlement'
    group by ref_id, method, direction
    having count(*) > 1
  ) x;

  select public.get_pool_balances(current_date) into v_pool;

  return jsonb_build_object(
    'customers', jsonb_build_object('mismatches',v_customer_mismatch,'unseeded_nonzero',v_customer_unseeded),
    'journals', jsonb_build_object('unbalanced_posted',v_unbalanced_journals),
    'settlements', jsonb_build_object('duplicate_cash_legs',v_settlement_cash_duplicates),
    'pool_balances',v_pool,
    'healthy', (v_customer_mismatch=0 and v_customer_unseeded=0 and v_unbalanced_journals=0 and v_settlement_cash_duplicates=0)
  );
end;
$$;
