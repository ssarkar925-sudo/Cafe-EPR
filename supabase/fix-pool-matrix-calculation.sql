-- ==============================================================================
-- FIX: Unified Pool Calculation Matrix & Bank Balance Reconciliation
-- ==============================================================================
-- Resolves miscalculation in daily transaction movements and opening balance seeds:
-- 1. Eliminates double-counting in bank, dmt, aeps, upi_qr, wallet, recharge pools:
--    - Settlements (public.settlements) are the single source of truth for pool transfers.
--    - Transactions (public.transactions) are the single source of truth for banking service flows.
--    - Cash Entries (public.cash_entries) handles general expenses & POS card/bank payments,
--      excluding ref_type IN ('settlement', 'transaction') to prevent duplicate additions/subtractions.
-- 2. Recalculates pool seeds and movements accurately across day close, opening balances,
--    and settings account balances.
-- ==============================================================================

-- 1. POOL SEED FUNCTION (Authoritative Opening Balance for any pool as of date)
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

revoke all on function public.get_pool_seed(text, date) from public, anon;
grant execute on function public.get_pool_seed(text, date) to authenticated, service_role;


-- 2. POOL MOVEMENTS FUNCTION (Single Source of Truth without Double Counting)
create or replace function public.get_pool_movements(p_pool text, p_from date, p_to date)
returns numeric
language plpgsql
security definer set search_path = public
as $$
declare v numeric := 0;
begin
  if p_pool = 'cash' then
    select coalesce(sum(case when direction = 'in' then amount else -amount end), 0) into v
    from public.cash_entries
    where method = 'cash' and entry_date >= p_from and (p_to is null or entry_date <= p_to);

  elsif p_pool = 'bank' then
    select coalesce(sum(x), 0) into v from (
      -- A. Settlements received into Bank (+)
      select amount as x from public.settlements
      where status = 'success' and to_pool = 'bank'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)

      union all

      -- B. Settlements sent from Bank (-)
      select -amount as x from public.settlements
      where status = 'success' and from_pool = 'bank'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)

      union all

      -- C. General Bank Cash Entries (POS Card/Bank collections, Bank Expenses, Manual Entries)
      -- Exclude ref_type in ('settlement', 'transaction') to prevent double counting
      select case when direction = 'in' then amount else -amount end as x
      from public.cash_entries
      where method in ('bank', 'debit_card', 'card')
        and (ref_type is null or ref_type not in ('settlement', 'transaction'))
        and entry_date >= p_from and (p_to is null or entry_date <= p_to)

      union all

      -- D. Transactions received into Bank (+)
      select bank_in as x
      from public.transactions
      where status = 'success' and bank_in > 0
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)

      union all

      -- E. Transactions sent out of Bank (-)
      select -bank_out as x
      from public.transactions
      where status = 'success' and bank_out > 0
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
      from public.cash_entries
      where method = 'wallet'
        and (ref_type is null or ref_type not in ('settlement', 'transaction'))
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
      from public.cash_entries
      where method = 'dmt'
        and (ref_type is null or ref_type not in ('settlement', 'transaction'))
        and entry_date >= p_from and (p_to is null or entry_date <= p_to)
      union all
      select pool_credit from public.transactions
      where status = 'success' and pool_credit_type = 'dmt' and pool_credit > 0
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -pool_out from public.transactions
      where status = 'success' and pool_credit_type = 'dmt' and pool_out > 0
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
      from public.cash_entries
      where method = 'aeps'
        and (ref_type is null or ref_type not in ('settlement', 'transaction'))
        and entry_date >= p_from and (p_to is null or entry_date <= p_to)
      union all
      select pool_credit from public.transactions
      where status = 'success' and pool_credit_type = 'aeps' and pool_credit > 0
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -pool_out from public.transactions
      where status = 'success' and pool_credit_type = 'aeps' and pool_out > 0
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
      from public.cash_entries
      where method = 'upi'
        and (ref_type is null or ref_type not in ('settlement', 'transaction'))
        and entry_date >= p_from and (p_to is null or entry_date <= p_to)
      union all
      select pool_credit from public.transactions
      where status = 'success' and pool_credit_type = 'upi_qr' and pool_credit > 0
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -pool_out from public.transactions
      where status = 'success' and pool_credit_type = 'upi_qr' and pool_out > 0
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
      union all
      select upi_fee from public.transactions
      where status = 'success' and upi_fee > 0
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
    ) t;

  elsif p_pool = 'recharge' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'recharge'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'recharge'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select pool_credit from public.transactions
      where status = 'success' and pool_credit_type = 'recharge' and pool_credit > 0
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -pool_out from public.transactions
      where status = 'success' and pool_credit_type = 'recharge' and pool_out > 0
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
    ) t;

  else
    v := 0;
  end if;

  return v;
end;
$$;

revoke all on function public.get_pool_movements(text, date, date) from public, anon;
grant execute on function public.get_pool_movements(text, date, date) to authenticated, service_role;


-- 3. GET_POOL_BALANCES (Unified Pool State Function)
create or replace function public.get_pool_balances(p_as_of date default current_date)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_pool text;
  v_opening numeric;
  v_seed date;
  v_mov numeric;
  v_res jsonb := '{}'::jsonb;
  v_total numeric := 0;
begin
  foreach v_pool in array array['cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'recharge', 'credit_card']
  loop
    select s.opening, s.seed_date into v_opening, v_seed
    from public.get_pool_seed(v_pool, p_as_of) s;

    v_mov := public.get_pool_movements(v_pool, v_seed, p_as_of);

    v_res := v_res || jsonb_build_object(
      v_pool, jsonb_build_object(
        'opening', v_opening,
        'seed_date', v_seed,
        'movements', v_mov,
        'current', v_opening + v_mov
      )
    );

    -- credit_card is a liability/credit limit, not a cash asset
    if v_pool <> 'credit_card' then
      v_total := v_total + (v_opening + v_mov);
    end if;
  end loop;

  v_res := v_res || jsonb_build_object('total', v_total);
  return v_res;
end;
$$;

revoke all on function public.get_pool_balances(date) from public, anon;
grant execute on function public.get_pool_balances(date) to authenticated, service_role;


-- 4. GET_OPEN_CLOSE (Day Close Matrix with Corrected Movement Math)
create or replace function public.get_open_close()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_close record;
  v_rows jsonb;
  v_pool text;
  v_opening numeric;
  v_seed date;
  v_mov numeric;
  v_computed numeric;
  v_adjust numeric;
begin
  select * into v_close from public.closings where status = 'open' order by opened_at desc limit 1;
  if not found then return '{}'::jsonb; end if;

  v_rows := '[]'::jsonb;
  foreach v_pool in array array['cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card', 'recharge']
  loop
    select coalesce(opening, 0), coalesce(seed_date, '0001-01-01'::date), coalesce(adjustment, 0)
      into v_opening, v_seed, v_adjust
    from public.closing_balances
    where closing_id = v_close.id and pool = v_pool;

    v_mov := public.get_pool_movements(v_pool, v_seed, v_close.close_date);
    v_computed := v_opening + v_mov;

    update public.closing_balances
      set movements = v_mov,
          computed = v_computed,
          final = v_computed + coalesce(v_adjust, 0)
      where closing_id = v_close.id and pool = v_pool;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'pool', v_pool,
      'seed_date', v_seed,
      'opening', v_opening,
      'movements', v_mov,
      'computed', v_computed,
      'adjustment', v_adjust,
      'final', v_computed + v_adjust
    ));
  end loop;

  return jsonb_build_object(
    'id', v_close.id,
    'closing_number', v_close.closing_number,
    'close_date', v_close.close_date,
    'status', v_close.status,
    'opened_at', v_close.opened_at,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.get_open_close() from public, anon;
grant execute on function public.get_open_close() to authenticated, service_role;


-- 5. GET_SETTLEMENT_SUMMARY (Pool Balances Summary for Settlements Desk)
create or replace function public.get_settlement_summary()
returns table (
  pool text,
  available_balance numeric,
  pending_in numeric,
  pending_out numeric,
  today_settled numeric
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_pool text;
  v_opening numeric;
  v_seed date;
  v_mov numeric;
  v_today date := current_date;
begin
  for v_pool in select unnest(array['aeps', 'upi_qr', 'dmt', 'wallet', 'bank', 'cash', 'recharge'])
  loop
    select s.opening, s.seed_date into v_opening, v_seed
    from public.get_pool_seed(v_pool, v_today) s;

    v_mov := public.get_pool_movements(v_pool, v_seed, v_today);

    pool := v_pool;
    available_balance := coalesce(v_opening, 0) + coalesce(v_mov, 0);

    select coalesce(sum(amount), 0) into pending_in
    from public.settlements
    where status = 'pending' and to_pool = v_pool;

    select coalesce(sum(amount), 0) into pending_out
    from public.settlements
    where status = 'pending' and from_pool = v_pool;

    select coalesce(sum(amount), 0) into today_settled
    from public.settlements
    where status = 'success'
      and (from_pool = v_pool or to_pool = v_pool)
      and settlement_date = v_today;

    return next;
  end loop;
end;
$$;

revoke all on function public.get_settlement_summary() from public, anon;
grant execute on function public.get_settlement_summary() to authenticated, service_role;
