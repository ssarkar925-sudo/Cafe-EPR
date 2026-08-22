-- ============================================================
-- Run this in Supabase SQL Editor to fix:
-- 1. Double deduction of bank movements
-- 2. Deduplicate any historical duplicate cash_entries rows
-- ============================================================

create or replace function public.get_pool_movements(p_pool text, p_from date, p_to date)
returns numeric
language plpgsql
security definer set search_path = public
as $$
declare v numeric := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  if p_pool = 'cash' then
    select coalesce(sum(case when direction = 'in' then amount else -amount end), 0) into v
    from public.cash_entries
    where method = 'cash'
      and entry_date >= p_from
      and (p_to is null or entry_date <= p_to);

  elsif p_pool = 'bank' then
    select coalesce(sum(case when direction = 'in' then amount else -amount end), 0) into v
    from public.cash_entries
    where method in ('bank', 'debit_card', 'card')
      and entry_date >= p_from
      and (p_to is null or entry_date <= p_to);

  elsif p_pool = 'credit_card' then
    select coalesce(sum(case when direction = 'out' then -amount else amount end), 0) into v
    from public.cash_entries
    where method = 'credit_card'
      and entry_date >= p_from
      and (p_to is null or entry_date <= p_to);

  elsif p_pool = 'wallet' then
    select coalesce(sum(case when direction = 'in' then amount else -amount end), 0) into v
    from public.cash_entries
    where method = 'wallet'
      and entry_date >= p_from
      and (p_to is null or entry_date <= p_to);

  elsif p_pool = 'dmt' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements
        where status = 'success' and to_pool = 'dmt'
          and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements
        where status = 'success' and from_pool = 'dmt'
          and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -pool_out from public.transactions
        where status = 'success' and service_type = 'dmt'
          and paid_from = 'portal' and pool_out > 0
          and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
    ) t;

  elsif p_pool = 'aeps' then
    select coalesce(sum(x), 0) into v from (
      select pool_out as x from public.transactions
        where status = 'success' and service_type = 'aeps' and pool_out > 0
          and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -amount from public.settlements
        where status = 'success' and from_pool = 'aeps'
          and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
    ) t;

  elsif p_pool = 'upi_qr' then
    select coalesce(sum(x), 0) into v from (
      select pool_credit as x from public.transactions
        where status = 'success' and service_type = 'upi' and pool_credit > 0
          and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -amount from public.settlements
        where status = 'success' and from_pool = 'upi_qr'
          and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
    ) t;

  elsif p_pool = 'recharge' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements
        where status = 'success' and to_pool = 'recharge'
          and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements
        where status = 'success' and from_pool = 'recharge'
          and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -pool_out from public.transactions
        where status = 'success' and service_type = 'recharge' and pool_out > 0
          and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
    ) t;

  else
    v := 0;
  end if;

  return coalesce(v, 0);
end;
$$;

delete from public.cash_entries
where id in (
  select id from (
    select id,
           row_number() over (
             partition by ref_type, ref_id, direction
             order by created_at desc
           ) as rn
    from public.cash_entries
    where ref_type = 'transaction'
  ) t
  where t.rn > 1
);
