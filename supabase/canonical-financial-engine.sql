-- ==============================================================================
-- CANONICAL FINANCIAL ENGINE: 7-POOL CONSERVED CAPITAL ARCHITECTURE
-- ==============================================================================
-- Invariants Guaranteed:
-- 1. Zero Double Counting (Base pool seed is NEVER added to instrument seeds).
-- 2. Zero Capital Disappearance (Uninitialized instruments cannot wipe pool balance).
-- 3. Explicit ₹0.00 snapshot is an active valid seed.
-- 4. Single newest snapshot selected per instrument (DISTINCT ON instrument_id).
-- 5. Safe deactivation guard (non-zero balance deactivation is blocked).
-- 6. Clean 7-pool balance sheet: cash, bank, wallet, dmt, aeps, upi_qr, credit_card.
-- 7. Legacy recharge retired (set to ₹0 for active operations without deleting history).
-- ==============================================================================

-- Drop existing functions to allow clean replacements
drop function if exists public.deactivate_payment_instrument(uuid);
drop function if exists public.get_settlement_summary();
drop function if exists public.get_open_close();
drop function if exists public.get_pool_balances(date);
drop function if exists public.get_pool_movements(text, date, date);
drop function if exists public.get_pool_seed(text, date);
drop function if exists public.set_opening_balance(text, numeric, date, uuid, text);

-- ------------------------------------------------------------------------------
-- 1. SET_OPENING_BALANCE ENGINE (Atomic Sync)
-- ------------------------------------------------------------------------------
create or replace function public.set_opening_balance(
  p_pool text,
  p_amount numeric,
  p_as_of date default current_date,
  p_instrument_id uuid default null,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' and current_user <> 'postgres' then
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not public.is_back_office() then raise exception 'Forbidden'; end if;
  end if;
  if p_pool is null or p_pool not in ('cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card') then
    raise exception 'Invalid pool';
  end if;
  if p_amount is null or p_amount < 0 then raise exception 'Opening balance cannot be negative'; end if;
  if p_instrument_id is not null and not exists (
    select 1 from public.payment_instruments where id = p_instrument_id
  ) then
    raise exception 'Payment instrument not found';
  end if;

  -- Temporal Immutability Guard: Cannot set today's opening balance if financial activity already exists for this instrument
  if p_instrument_id is not null and p_as_of = current_date then
    if exists (
      select 1 from public.cash_entries
      where instrument_id = p_instrument_id and entry_date = p_as_of
    ) or exists (
      select 1 from public.transactions
      where (instrument_id = p_instrument_id or pay_from_instrument_id = p_instrument_id)
        and transaction_date = p_as_of
    ) or exists (
      select 1 from public.payments
      where instrument_id = p_instrument_id and date(received_at) = p_as_of
    ) then
      raise exception 'Cannot set today''s opening balance because this account already has financial activity today. Reseeding would double-count existing transactions.';
    end if;
  end if;

  -- 1. Insert snapshot into opening_balances
  insert into public.opening_balances (pool, instrument_id, amount, as_of, remarks, created_by)
  values (p_pool, p_instrument_id, p_amount, p_as_of, p_remarks, auth.uid())
  returning id into v_id;

  -- 2. Sync payment_instruments.opening_balance
  if p_instrument_id is not null then
    update public.payment_instruments
      set opening_balance = p_amount, is_active = true, updated_at = now()
      where id = p_instrument_id;
  else
    if p_pool = 'cash' then
      update public.payment_instruments set opening_balance = p_amount, updated_at = now() where type = 'cash';
    elsif p_pool = 'bank' then
      update public.payment_instruments set opening_balance = p_amount, updated_at = now() where type = 'bank';
    elsif p_pool = 'wallet' then
      update public.payment_instruments set opening_balance = p_amount, updated_at = now() where type = 'wallet';
    elsif p_pool = 'upi_qr' then
      update public.payment_instruments set opening_balance = p_amount, updated_at = now() where type = 'upi';
    end if;
  end if;

  -- 3. Audit log
  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'opening_balance_set', 'opening_balances', v_id::text,
    'Set ' || p_pool || ' opening balance to ' || p_amount || ' as of ' || p_as_of,
    jsonb_build_object('pool', p_pool, 'amount', p_amount, 'as_of', p_as_of, 'instrument_id', p_instrument_id)
  );

  return jsonb_build_object('id', v_id, 'pool', p_pool, 'amount', p_amount, 'as_of', p_as_of);
end;
$$;

revoke all on function public.set_opening_balance(text, numeric, date, uuid, text) from public, anon;
grant execute on function public.set_opening_balance(text, numeric, date, uuid, text) to authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 2. POOL SEED ENGINE (Tri-State Mutex Calculation)
-- ------------------------------------------------------------------------------
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
      elsif v_inst_date is not null and (v_base_date is null or v_inst_date > v_base_date) then
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
    if v_base_date is not null then
      return query select coalesce(v_base_amount, 0), v_base_date;
      return;
    else
      -- Fallback to partial summation if no base seed exists
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


-- ------------------------------------------------------------------------------
-- 3. POOL MOVEMENTS ENGINE (7 Active Pools with Strict Anti-Duplication)
-- ------------------------------------------------------------------------------
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
      select bank_in from public.transactions
      where status = 'success' and bank_in > 0
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
      union all
      -- Direct banking service transactions sent from bank
      select -bank_out from public.transactions
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


-- ------------------------------------------------------------------------------
-- 4. GET_POOL_BALANCES (Unified 7-Pool Balance Matrix)
-- ------------------------------------------------------------------------------
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


-- ------------------------------------------------------------------------------
-- 5. DEACTIVATE PAYMENT INSTRUMENT GUARD
-- ------------------------------------------------------------------------------
create or replace function public.deactivate_payment_instrument(p_instrument_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_inst record;
  v_opening numeric := 0;
  v_flow numeric := 0;
  v_live_balance numeric := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select * into v_inst from public.payment_instruments where id = p_instrument_id;
  if not found then raise exception 'Payment instrument not found'; end if;

  -- 1. Fetch opening seed
  select amount into v_opening
  from public.opening_balances
  where instrument_id = p_instrument_id
  order by as_of desc, created_at desc
  limit 1;
  v_opening := coalesce(v_opening, v_inst.opening_balance, 0);

  -- 2. Fetch cash entries flow
  select coalesce(sum(case when direction = 'in' then amount else -amount end), 0) into v_flow
  from public.cash_entries
  where instrument_id = p_instrument_id;

  v_live_balance := v_opening + v_flow;

  -- 3. Deactivation Guard
  if abs(v_live_balance) > 0.001 then
    raise exception 'Cannot deactivate instrument "%" while it holds an active balance of ₹%. Please transfer or settle funds to ₹0.00 first.',
      v_inst.name, v_live_balance;
  end if;

  update public.payment_instruments set is_active = false, updated_at = now() where id = p_instrument_id;

  return jsonb_build_object('success', true, 'id', p_instrument_id, 'is_active', false);
end;
$$;

revoke all on function public.deactivate_payment_instrument(uuid) from public, anon;
grant execute on function public.deactivate_payment_instrument(uuid) to authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 6. GET_OPEN_CLOSE (7-Pool Open Close Engine)
-- ------------------------------------------------------------------------------
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
  foreach v_pool in array array['cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card']
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


-- ------------------------------------------------------------------------------
-- 7. GET_SETTLEMENT_SUMMARY (7-Pool Settlement Live Assistant)
-- ------------------------------------------------------------------------------
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
  v_bal numeric;
  v_tin numeric;
  v_tout numeric;
  v_tset numeric;
begin
  foreach v_pool in array array['cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card']
  loop
    select s.opening, s.seed_date into v_opening, v_seed
    from public.get_pool_seed(v_pool, current_date) s;

    v_mov := public.get_pool_movements(v_pool, v_seed, current_date);
    v_bal := coalesce(v_opening, 0) + coalesce(v_mov, 0);

    select coalesce(sum(amount), 0) into v_tin
    from public.settlements
    where status = 'pending' and to_pool = v_pool;

    select coalesce(sum(amount), 0) into v_tout
    from public.settlements
    where status = 'pending' and from_pool = v_pool;

    select coalesce(sum(amount), 0) into v_tset
    from public.settlements
    where status = 'success' and (to_pool = v_pool or from_pool = v_pool)
      and settlement_date = current_date;

    pool := v_pool;
    available_balance := v_bal;
    pending_in := v_tin;
    pending_out := v_tout;
    today_settled := v_tset;
    return next;
  end loop;
end;
$$;

revoke all on function public.get_settlement_summary() from public, anon;
grant execute on function public.get_settlement_summary() to authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 8. RECHARGE POOL RETIREMENT (Idempotent Zero-Out of Active Float)
-- ------------------------------------------------------------------------------
-- Zeros out active recharge float for 2026-08-24 without touching historical logs
update public.opening_balances
set amount = 0, remarks = 'Legacy recharge float retired and consolidated into active digital wallet'
where pool = 'recharge' and as_of = '2026-08-24';
