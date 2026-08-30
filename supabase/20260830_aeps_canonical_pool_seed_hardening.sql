-- ==============================================================================
-- AEPS & MULTI-PROVIDER CANONICAL POOL SEED HARDENING
-- ==============================================================================
-- Fixes AEPS & DMT provider accounts (e.g. Digipay, Ezeepay, Airtel DMT, Payworld)
-- so their instrument-specific opening balances flow authoritatively into:
-- 1. get_pool_seed('aeps') and get_pool_seed('dmt')
-- 2. get_pool_balances()
-- 3. Financial Reconciliation (/finance/reconciliation)
-- 4. AEPS & DMT Workspaces (/business/aeps & /business/dmt)
-- ==============================================================================

-- 1. POOL SEED ENGINE (Tri-State Mutex Calculation with AEPS & DMT Multi-Provider Support)
create or replace function public.get_pool_seed(p_pool text, p_as_of date)
returns table (opening numeric, seed_date date)
language plpgsql
security definer set search_path = public
as $$
declare
  v_base_amount numeric := 0;
  v_base_date date := null;
  v_active_count int := 0;
  v_init_count int := 0;
  v_inst_total numeric := 0;
  v_inst_date date := null;
begin
  -- 1. Fetch latest base pool-level seed (manual or Day Close auto-seed)
  select amount, as_of into v_base_amount, v_base_date
  from public.opening_balances
  where pool = p_pool and instrument_id is null and as_of <= p_as_of
  order by as_of desc, is_auto desc, created_at desc
  limit 1;

  -- 2. Count active instruments in this pool
  select count(*) into v_active_count
  from public.payment_instruments pi
  where (
    (p_pool = 'bank' and pi.type in ('bank', 'debit_card')) or
    (p_pool = 'credit_card' and pi.type = 'credit_card') or
    (p_pool = 'wallet' and pi.type = 'wallet') or
    (p_pool = 'cash' and pi.type = 'cash') or
    (p_pool = 'upi_qr' and pi.type = 'upi') or
    (p_pool = 'aeps' and pi.type in ('aeps_portal', 'aeps')) or
    (p_pool = 'dmt' and pi.type in ('dmt_portal', 'dmt'))
  ) and pi.is_active = true;

  -- 3. If active instruments exist, audit their snapshots in opening_balances
  if v_active_count > 0 then
    select
      coalesce(sum(sub.amount), 0),
      count(*),
      max(sub.as_of)
    into v_inst_total, v_init_count, v_inst_date
    from (
      select distinct on (ob.instrument_id)
        ob.amount,
        ob.as_of
      from public.opening_balances ob
      join public.payment_instruments pi on pi.id = ob.instrument_id
      where (
        ob.pool = p_pool or
        (p_pool = 'aeps' and ob.pool in ('aeps_portal', 'aeps')) or
        (p_pool = 'dmt' and ob.pool in ('dmt_portal', 'dmt')) or
        (p_pool = 'upi_qr' and ob.pool in ('upi_qr', 'upi')) or
        (p_pool = 'bank' and ob.pool in ('bank', 'debit_card'))
      )
        and ob.instrument_id is not null
        and ob.as_of <= p_as_of
        and pi.is_active = true
      order by ob.instrument_id, ob.as_of desc, ob.created_at desc
    ) sub;

    -- COMPLETE INSTRUMENT MODE: All active instruments have valid snapshots
    if v_init_count = v_active_count then
      -- Period-Anchor Accounting Rule:
      -- 1. If Day Close auto-seed is newer than the instrument snapshots (v_base_date > v_inst_date),
      --    the Day Close rollover is the authoritative opening position for period p_as_of.
      if v_base_date is not null and v_base_date > v_inst_date then
        return query select coalesce(v_base_amount, 0), v_base_date;
        return;
      elsif v_inst_date is not null and (v_base_date is null or v_inst_date >= v_base_date) then
        return query select v_inst_total, v_inst_date;
        return;
      else
        -- Same-date anchor (v_inst_date = v_base_date):
        if v_inst_total > 0 then
          return query select v_inst_total, v_inst_date;
          return;
        else
          return query select coalesce(v_base_amount, 0), coalesce(v_base_date, v_inst_date);
          return;
        end if;
      end if;
    end if;

    -- PARTIAL INCOMPLETE MODE: Preserves pool base seed to prevent capital loss
    if v_base_date is not null and v_base_amount > 0 then
      return query select coalesce(v_base_amount, 0), v_base_date;
      return;
    else
      -- Fallback to partial summation if no base seed exists or base seed is 0
      return query select v_inst_total, coalesce(v_inst_date, '0001-01-01'::date);
      return;
    end if;
  end if;

  -- 4. POOL MODE (Cash Drawer, AEPS, DMT, UPI QR)
  return query select coalesce(v_base_amount, 0), coalesce(v_base_date, '0001-01-01'::date);
end;
$$;

revoke all on function public.get_pool_seed(text, date) from public, anon;
grant execute on function public.get_pool_seed(text, date) to authenticated, service_role;


-- 2. POOL MOVEMENTS ENGINE (AEPS, DMT, and 7 Active Pools)
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
      -- Settlements received into Bank (+)
      select amount as x from public.settlements
      where status = 'success' and to_pool = 'bank'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      -- Settlements sent out of Bank (-)
      select -amount as x from public.settlements
      where status = 'success' and from_pool = 'bank'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      -- Direct Bank Cash Entries (POS Card/Bank collections, Expenses, Recharges paid via bank)
      select case when direction = 'in' then amount else -amount end as x
      from public.cash_entries
      where method in ('bank', 'debit_card', 'card')
        and (ref_type is null or ref_type not in ('settlement', 'transaction'))
        and entry_date >= p_from and (p_to is null or entry_date <= p_to)
      union all
      -- Direct banking service transactions deposited to bank
      select bank_in as x
      from public.transactions
      where status = 'success' and bank_in > 0
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
      union all
      -- Direct banking service transactions paid out of bank
      select -bank_out as x
      from public.transactions
      where status = 'success' and bank_out > 0
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
    ) t;

  elsif p_pool = 'credit_card' then
    select coalesce(sum(x), 0) into v from (
      -- Bill Payments (+) restore available credit limit
      select amount as x from public.settlements
      where status = 'success' and to_pool = 'credit_card'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      -- Cash Advances / Payouts (-)
      select -amount as x from public.settlements
      where status = 'success' and from_pool = 'credit_card'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      -- Outflows paid from Credit Card (-)
      select -amount as x from public.cash_entries
      where direction = 'out' and method = 'credit_card'
        and (ref_type is null or ref_type not in ('settlement', 'transaction'))
        and entry_date >= p_from and (p_to is null or entry_date <= p_to)
    ) t;

  elsif p_pool = 'wallet' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'wallet'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'wallet'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select case when direction = 'in' then amount else -amount end as x
      from public.cash_entries
      where method = 'wallet' and (ref_type is null or ref_type not in ('settlement', 'transaction'))
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
      union all
      -- POS invoice & Quick sale UPI payments, refunds, and non-transaction UPI cash entries
      select case when direction = 'in' then amount else -amount end as x
      from public.cash_entries
      where method in ('upi', 'upi_qr', 'qr')
        and (ref_type is null or ref_type not in ('settlement', 'transaction'))
        and entry_date >= p_from and (p_to is null or entry_date <= p_to)
    ) t;

  else
    v := 0;
  end if;

  return v;
end;
$$;

revoke all on function public.get_pool_movements(text, date, date) from public, anon;
grant execute on function public.get_pool_movements(text, date, date) to authenticated, service_role;


-- 3. GET_POOL_BALANCES (Unified 7-Pool Balance Matrix)
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
  foreach v_pool in array array['cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card']
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
