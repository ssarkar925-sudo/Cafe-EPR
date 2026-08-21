-- Fix: opening balances were only visible on the Opening Balances page.
-- The pool functions below (from opening-close.sql) plus a seed-aware
-- get_settlement_summary() make opening balances flow into the Settlements
-- module, the dashboard Money Position, and day close.
--
-- Also here: a BACKFILL that connects Settings > Payment Accounts to the
-- pools. Any active account that has an "opening balance" on the instrument
-- (payment_instruments.opening_balance) but no opening_balances seed yet gets
-- one, so adding a credit card / bank / UPI / wallet with an opening balance
-- in Settings adjusts the pool opening. New accounts created after the
-- frontend update auto-seed themselves via set_opening_balance.
--
-- Pool math: a pool-level seed (incl. day-close auto seeds) is the
-- authoritative base; per-account seeds dated AFTER it add on top.
-- Run in the Supabase SQL editor of project tvxehxnvuwojjbhysajp (idempotent).

-- ---------- Pool seed: opening amount + seed date for a pool as of a date ----------
create or replace function public.get_pool_seed(p_pool text, p_as_of date)
returns table (opening numeric, seed_date date)
language plpgsql
security definer set search_path = public
as $$
declare
  v_pool_amount numeric;
  v_pool_date date;
  v_inst_total numeric;
  v_inst_date date;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select amount, as_of into v_pool_amount, v_pool_date
    from public.opening_balances
    where pool = p_pool and instrument_id is null and as_of <= p_as_of
    order by as_of desc, is_auto desc, created_at desc
    limit 1;

  select coalesce(sum(amount), 0), max(as_of) into v_inst_total, v_inst_date
  from (
    select distinct on (instrument_id) amount, as_of
    from public.opening_balances
    where pool = p_pool and instrument_id is not null and as_of <= p_as_of
    order by instrument_id, as_of desc, created_at desc
  ) inst
  where as_of > coalesce(v_pool_date, '0001-01-01'::date);

  return query
  select
    coalesce(v_pool_amount, 0) + coalesce(v_inst_total, 0) as opening,
    case
      when v_pool_date is not null then v_pool_date
      when v_inst_date is not null then v_inst_date
      else '0001-01-01'::date
    end as seed_date;
end;
$$;

-- ---------- Pool movements (single source of truth) ----------
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
    where method = 'cash' and entry_date >= p_from and (p_to is null or entry_date <= p_to);

  elsif p_pool = 'bank' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'bank'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'bank'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select case when direction = 'in' then amount else -amount end
      from public.cash_entries where method in ('bank', 'debit_card', 'card')
        and entry_date >= p_from and (p_to is null or entry_date <= p_to)
      union all
      select bank_in from public.transactions where status = 'success' and bank_in > 0
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -bank_out from public.transactions where status = 'success' and bank_out > 0
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
    ) t;

  elsif p_pool = 'credit_card' then
    select coalesce(sum(case when direction = 'out' then -amount else amount end), 0) into v
    from public.cash_entries
    where method = 'credit_card' and entry_date >= p_from and (p_to is null or entry_date <= p_to);

  elsif p_pool = 'wallet' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'wallet'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'wallet'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select case when direction = 'in' then amount else -amount end
      from public.cash_entries where method = 'wallet'
        and entry_date >= p_from and (p_to is null or entry_date <= p_to)
    ) t;

  elsif p_pool = 'dmt' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'dmt'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'dmt'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select case when direction = 'in' then amount else -amount end
      from public.cash_entries where method = 'dmt'
        and entry_date >= p_from and (p_to is null or entry_date <= p_to)
      union all
      select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'dmt'
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'dmt'
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
    ) t;

  elsif p_pool = 'aeps' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'aeps'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'aeps'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select case when direction = 'out' then amount else -amount end
      from public.cash_entries where method = 'aeps'
        and entry_date >= p_from and (p_to is null or entry_date <= p_to)
      union all
      select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'aeps'
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'aeps'
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
    ) t;

  elsif p_pool = 'upi_qr' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'upi_qr'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'upi_qr'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select case when direction = 'in' then amount else -amount end
      from public.cash_entries where method = 'upi'
        and entry_date >= p_from and (p_to is null or entry_date <= p_to)
      union all
      select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'upi_qr'
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'upi_qr'
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
      union all
      select upi_fee from public.transactions where status = 'success' and upi_fee > 0
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
    ) t;

  else
    v := 0;
  end if;

  return v;
end;
$$;

-- ---------- Pool balances for KPI cards (opening seed + post-seed movements) ----------
create or replace function public.get_pool_balances(p_as_of date default current_date)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_pool text;
  v_opening numeric;
  v_seed date;
  v_mov numeric;
  v_total numeric := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  foreach v_pool in array array['cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card', 'recharge']
  loop
    select s.opening, s.seed_date into v_opening, v_seed
    from public.get_pool_seed(v_pool, p_as_of) s;

    v_mov := public.get_pool_movements(v_pool, v_seed, null);

    v_total := v_total + v_opening + v_mov;
    v_result := v_result || jsonb_build_object(
      v_pool, jsonb_build_object(
        'opening', v_opening,
        'seed_date', v_seed,
        'movements', v_mov,
        'current', v_opening + v_mov
      )
    );
  end loop;

  return v_result || jsonb_build_object('total', v_total);
end;
$$;

-- ---------- Settlement summary: seed-aware pool positions ----------
-- Was: movement-only totals. Now each pool = opening seed + movements after the
-- seed date, matching get_pool_balances, so the Settlements cards and the
-- dashboard Money Position (which falls back to this) include opening balances.
create or replace function public.get_settlement_summary()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_pool text;
  v_opening numeric;
  v_seed date;
  v_mov numeric;
  v_count bigint;
  v_result jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  foreach v_pool in array array['cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card', 'recharge']
  loop
    select s.opening, s.seed_date into v_opening, v_seed
    from public.get_pool_seed(v_pool, current_date) s;
    v_mov := public.get_pool_movements(v_pool, v_seed, null);
    v_result := v_result || jsonb_build_object(v_pool, v_opening + v_mov);
  end loop;

  select count(*) into v_count from public.settlements where status = 'success';

  return v_result || jsonb_build_object('count', v_count);
end;
$$;

revoke all on function public.get_pool_seed(text, date) from public, anon;
revoke all on function public.get_pool_movements(text, date, date) from public, anon;
revoke all on function public.get_pool_balances(date) from public, anon;
revoke all on function public.get_settlement_summary() from public, anon;
grant execute on function public.get_pool_seed(text, date) to authenticated;
grant execute on function public.get_pool_movements(text, date, date) to authenticated;
grant execute on function public.get_pool_balances(date) to authenticated;
grant execute on function public.get_settlement_summary() to authenticated;

-- ---------- Backfill: connect existing Payment Accounts to the pools ----------
-- Any active account with an opening_balance on the instrument but no seed yet
-- gets an opening_balances row dated today (idempotent; skips already-seeded
-- accounts so re-running does not duplicate).
insert into public.opening_balances (pool, instrument_id, amount, as_of, remarks, created_by)
select
  case i.type
    when 'cash' then 'cash'
    when 'bank' then 'bank'
    when 'debit_card' then 'bank'
    when 'credit_card' then 'credit_card'
    when 'upi' then 'upi_qr'
    when 'wallet' then 'wallet'
  end,
  i.id,
  i.opening_balance,
  current_date,
  'Opening balance from Payment Accounts setup',
  i.created_by
from public.payment_instruments i
where i.is_active = true
  and i.opening_balance > 0
  and not exists (
    select 1 from public.opening_balances ob where ob.instrument_id = i.id
  );
