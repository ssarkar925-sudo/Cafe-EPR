-- Run this in Supabase SQL Editor (idempotent).
-- Opening Balances + Day Close + Net Profit.
-- Pools: cash, bank, wallet, dmt, aeps, upi_qr, credit_card.
-- Each pool can have an opening balance seed (instrument_id NULL = pool base) and/or
-- per-account seeds (instrument_id set) so a bank account / credit card added later
-- adjusts automatically. Pool balance = seed(s) + movements dated AFTER the seed date.
-- A closed day seeds the next day's opening automatically from its final balances
-- (auditable chain: opening -> movements -> computed -> adjustment -> final).

create table if not exists public.opening_balances (
  id uuid primary key default gen_random_uuid(),
  pool text not null check (pool in ('cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card', 'recharge')),
  instrument_id uuid references public.payment_instruments (id) on delete set null,
  amount numeric(15,2) not null default 0 check (amount >= 0),
  as_of date not null default current_date,
  remarks text,
  is_auto boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists opening_balances_pool_idx on public.opening_balances (pool, as_of desc);
create index if not exists opening_balances_instrument_idx on public.opening_balances (instrument_id);
alter table public.opening_balances add column if not exists is_auto boolean not null default false;

alter table public.opening_balances enable row level security;
drop policy if exists "opening_balances select" on public.opening_balances;
create policy "opening_balances select" on public.opening_balances for select to authenticated using (public.is_back_office());
drop policy if exists "opening_balances insert" on public.opening_balances;
create policy "opening_balances insert" on public.opening_balances for insert to authenticated with check (public.is_back_office());
drop policy if exists "opening_balances update" on public.opening_balances;
create policy "opening_balances update" on public.opening_balances for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

create table if not exists public.closings (
  id uuid primary key default gen_random_uuid(),
  closing_number text not null unique,
  close_date date not null,
  status text not null default 'open' check (status in ('open', 'closed', 'reversed')),
  opened_by uuid references public.profiles (id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  net_profit numeric(15,2) not null default 0,
  owner_deposits numeric(15,2) not null default 0,
  owner_withdrawals numeric(15,2) not null default 0,
  balance_check numeric(15,2) not null default 0,
  remarks text,
  reversed_at timestamptz,
  reversed_by uuid references auth.users (id) on delete set null
);

create index if not exists closings_date_idx on public.closings (close_date desc);
create index if not exists closings_status_idx on public.closings (status);
-- One close per date; a reversed/cancelled close frees its date so the day can be closed again.
drop index if exists closings_close_date_unique;
create unique index if not exists closings_close_date_unique
  on public.closings (close_date) where status not in ('reversed', 'cancelled');

-- Track cancellation of an accidentally-opened close; allow the 'cancelled' status.
alter table public.closings
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users (id) on delete set null;
alter table public.closings drop constraint if exists closings_status_check;
alter table public.closings
  add constraint closings_status_check check (status in ('open', 'closed', 'reversed', 'cancelled'));

alter table public.closings enable row level security;
drop policy if exists "closings select" on public.closings;
create policy "closings select" on public.closings for select to authenticated using (public.is_back_office());
drop policy if exists "closings insert" on public.closings;
create policy "closings insert" on public.closings for insert to authenticated with check (public.is_back_office());
drop policy if exists "closings update" on public.closings;
create policy "closings update" on public.closings for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

create table if not exists public.closing_balances (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.closings (id) on delete cascade,
  pool text not null check (pool in ('cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card', 'recharge')),
  seed_date date,
  opening numeric(15,2) not null default 0,
  movements numeric(15,2) not null default 0,
  computed numeric(15,2) not null default 0,
  adjustment numeric(15,2) not null default 0,
  final numeric(15,2) not null default 0,
  remarks text,
  unique (closing_id, pool)
);

alter table public.closing_balances enable row level security;
drop policy if exists "closing_balances select" on public.closing_balances;
create policy "closing_balances select" on public.closing_balances for select to authenticated using (public.is_back_office());
drop policy if exists "closing_balances insert" on public.closing_balances;
create policy "closing_balances insert" on public.closing_balances for insert to authenticated with check (public.is_back_office());
drop policy if exists "closing_balances update" on public.closing_balances;
create policy "closing_balances update" on public.closing_balances for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

create sequence if not exists public.closing_seq start 1;

-- ---------- Pool seed: latest opening for a pool as of a date ----------
-- Pool-level seed (instrument NULL) is authoritative; per-account seeds dated after it
-- add on top (e.g. a bank account opened later with its own opening balance). When no
-- seed exists at all, opening = 0 and the cutoff is epoch so all movements count.
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

-- ---------- Pool movements (single source of truth, mirrors get_settlement_summary) ----------
-- The shop's OWN credit cards are used for money-out (expense). Those spends reduce
-- the credit_card pool (available limit), NOT the bank pool. Customer card-machine
-- receipts (method 'card') settle to BANK. Bank = bank + debit_card + card receipts.
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

  elsif p_pool = 'recharge' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'recharge'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'recharge'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'recharge'
        and transaction_date >= p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'recharge'
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

-- ---------- Set / update an opening balance seed (audited append-only) ----------
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
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_pool is null or p_pool not in ('cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card', 'recharge') then
    raise exception 'Invalid pool';
  end if;
  if p_amount is null or p_amount < 0 then raise exception 'Opening balance cannot be negative'; end if;
  if p_instrument_id is not null and not exists (
    select 1 from public.payment_instruments where id = p_instrument_id
  ) then
    raise exception 'Payment instrument not found';
  end if;

  insert into public.opening_balances (pool, instrument_id, amount, as_of, remarks, created_by)
  values (p_pool, p_instrument_id, p_amount, p_as_of, p_remarks, auth.uid())
  returning id into v_id;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'opening_balance_set', 'opening_balances', v_id::text,
    'Set ' || p_pool || ' opening balance to ' || p_amount || ' as of ' || p_as_of,
    jsonb_build_object('pool', p_pool, 'amount', p_amount, 'as_of', p_as_of, 'instrument_id', p_instrument_id)
  );

  return jsonb_build_object('id', v_id, 'pool', p_pool, 'amount', p_amount, 'as_of', p_as_of);
end;
$$;

-- ---------- Open a day close (one open close at a time, snapshot opening) ----------
create or replace function public.open_close(p_close_date date)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_num text;
  v_pool text;
  v_opening numeric;
  v_seed date;
  v_mov numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_close_date is null then raise exception 'Date is required'; end if;
  if exists (select 1 from public.closings where status = 'open') then
    raise exception 'An open day close already exists';
  end if;
  if exists (select 1 from public.closings where close_date = p_close_date and status not in ('reversed', 'cancelled')) then
    raise exception 'A day close already exists for this date';
  end if;

  v_num := 'CLS-' || lpad(nextval('public.closing_seq')::text, 4, '0');

  insert into public.closings (closing_number, close_date, status, opened_by)
  values (v_num, p_close_date, 'open', auth.uid())
  returning id into v_id;

  foreach v_pool in array array['cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card', 'recharge']
  loop
    select s.opening, s.seed_date into v_opening, v_seed
    from public.get_pool_seed(v_pool, p_close_date) s;
    v_mov := public.get_pool_movements(v_pool, v_seed, p_close_date);
    insert into public.closing_balances (closing_id, pool, seed_date, opening, movements, computed)
    values (v_id, v_pool, v_seed, v_opening, v_mov, v_opening + v_mov);
  end loop;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description)
  values (auth.uid(), null, 'day_close_opened', 'closings', v_id::text,
          'Opened day close ' || v_num || ' for ' || p_close_date);

  return jsonb_build_object('id', v_id, 'closing_number', v_num, 'close_date', p_close_date, 'status', 'open');
end;
$$;

-- ---------- Current open close with live recomputed balances ----------
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
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

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

-- ---------- Adjust a pool on an open close ----------
create or replace function public.set_close_adjustment(
  p_closing_id uuid,
  p_pool text,
  p_amount numeric,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_row record;
  v_final numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_amount is null then raise exception 'Adjustment amount is required'; end if;
  if not exists (select 1 from public.closings where id = p_closing_id and status = 'open') then
    raise exception 'Day close not open';
  end if;

  select * into v_row from public.closing_balances
    where closing_id = p_closing_id and pool = p_pool for update;
  if not found then raise exception 'Pool not found in close'; end if;

  v_final := v_row.computed + p_amount;
  update public.closing_balances
    set adjustment = p_amount, final = v_final,
        remarks = coalesce(nullif(p_remarks, ''), remarks)
    where id = v_row.id;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'close_adjustment_set', 'closings', p_closing_id::text,
    'Adjusted ' || p_pool || ' by ' || p_amount || ' on day close',
    jsonb_build_object('pool', p_pool, 'amount', p_amount, 'remarks', p_remarks)
  );

  return jsonb_build_object('closing_id', p_closing_id, 'pool', p_pool, 'adjustment', p_amount, 'final', v_final);
end;
$$;

-- ---------- Close the day (net profit + balance check + auto next-day opening) ----------
create or replace function public.close_day(
  p_closing_id uuid,
  p_owner_deposits numeric default 0,
  p_owner_withdrawals numeric default 0,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_close record;
  v_pool text;
  v_open_total numeric := 0;
  v_final_total numeric := 0;
  v_net numeric;
  v_check numeric;
  v_row record;
  v_result jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if coalesce(p_owner_deposits, 0) < 0 or coalesce(p_owner_withdrawals, 0) < 0 then
    raise exception 'Owner deposit/withdrawal amounts cannot be negative';
  end if;

  select * into v_close from public.closings where id = p_closing_id for update;
  if not found then raise exception 'Day close not found'; end if;
  if v_close.status <> 'open' then raise exception 'Day close is not open'; end if;

  for v_row in
    select * from public.closing_balances where closing_id = p_closing_id
  loop
    if v_row.seed_date is not null then
      update public.closing_balances
        set movements = public.get_pool_movements(v_row.pool, v_row.seed_date, v_close.close_date),
            computed = v_row.opening + public.get_pool_movements(v_row.pool, v_row.seed_date, v_close.close_date),
            final = v_row.opening + public.get_pool_movements(v_row.pool, v_row.seed_date, v_close.close_date) + v_row.adjustment
        where id = v_row.id;
    end if;
  end loop;

  select coalesce(sum(opening), 0), coalesce(sum(final), 0)
    into v_open_total, v_final_total
  from public.closing_balances where closing_id = p_closing_id;

  v_net := coalesce((select (public.get_pnl(v_close.close_date, v_close.close_date)->>'net_profit')::numeric), 0);
  v_check := v_final_total - v_open_total - v_net - coalesce(p_owner_deposits, 0) + coalesce(p_owner_withdrawals, 0);

  update public.closings
    set status = 'closed', closed_by = auth.uid(), closed_at = now(),
        net_profit = v_net,
        owner_deposits = coalesce(p_owner_deposits, 0),
        owner_withdrawals = coalesce(p_owner_withdrawals, 0),
        balance_check = v_check,
        remarks = coalesce(nullif(p_remarks, ''), remarks)
    where id = p_closing_id;

  for v_row in
    select * from public.closing_balances where closing_id = p_closing_id
  loop
    insert into public.opening_balances (pool, instrument_id, amount, as_of, remarks, is_auto, created_by)
    values (v_row.pool, null, v_row.final, v_close.close_date + interval '1 day',
            'Auto from ' || v_close.closing_number, true, auth.uid());
    v_result := v_result || jsonb_build_object(
      v_row.pool, jsonb_build_object('opening', v_row.opening, 'movements', v_row.movements,
                                     'adjustment', v_row.adjustment, 'final', v_row.final)
    );
  end loop;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'day_close_completed', 'closings', p_closing_id::text,
    'Closed ' || v_close.closing_number || ' for ' || v_close.close_date ||
    ' | net profit ' || v_net || ' | balance check ' || v_check,
    jsonb_build_object('net_profit', v_net, 'balance_check', v_check,
                       'owner_deposits', p_owner_deposits, 'owner_withdrawals', p_owner_withdrawals)
  );

  return jsonb_build_object(
    'id', p_closing_id,
    'closing_number', v_close.closing_number,
    'close_date', v_close.close_date,
    'status', 'closed',
    'net_profit', v_net,
    'balance_check', v_check,
    'pools', v_result
  );
end;
$$;

-- ---------- Close history ----------
create or replace function public.get_closings(p_limit int default 30)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_list jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.close_date desc), '[]'::jsonb) into v_list
  from (
    select cl.id, cl.closing_number, cl.close_date, cl.status, cl.net_profit,
           cl.owner_deposits, cl.owner_withdrawals, cl.balance_check,
           cl.opened_at, cl.closed_at, cl.remarks,
           (select coalesce(jsonb_agg(to_jsonb(cb) order by cb.pool), '[]'::jsonb)
            from public.closing_balances cb where cb.closing_id = cl.id) as balances
    from public.closings cl
    order by cl.close_date desc
    limit greatest(1, p_limit)
  ) c;

  return jsonb_build_object('closings', v_list);
end;
$$;

-- ---------- Reverse a closed day (audited, journal never deleted) ----------
-- Also removes the auto next-day opening seeds this close posted, so a reversal
-- fully undoes the day (the seeds are re-created when the day is closed again).
create or replace function public.reverse_close(p_closing_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_close record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select * into v_close from public.closings where id = p_closing_id for update;
  if not found then raise exception 'Day close not found'; end if;
  if v_close.status <> 'closed' then raise exception 'Only a closed day close can be reversed'; end if;

  update public.closings
    set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(),
        remarks = trim(coalesce(remarks, '') || E'\nReversed: ' || coalesce(p_reason, 'No reason provided.'))
    where id = p_closing_id;

  -- Undo the auto opening seeds this close posted (audited via the reversal row below).
  delete from public.opening_balances
  where remarks = 'Auto from ' || v_close.closing_number;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'day_close_reversed', 'closings', p_closing_id::text,
    'Reversed ' || v_close.closing_number || ' for ' || v_close.close_date,
    jsonb_build_object('reason', p_reason, 'net_profit', v_close.net_profit)
  );

  return jsonb_build_object('id', p_closing_id, 'status', 'reversed');
end;
$$;

-- ---------- Cancel an open day close (e.g. opened by mistake) ----------
-- Audited and never deleted: the close + snapshot balances stay as a cancelled
-- record. An open close has no financial entries yet, so nothing else reverses.
create or replace function public.cancel_open_close(p_closing_id uuid, p_reason text default '')
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_close record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select * into v_close from public.closings where id = p_closing_id for update;
  if not found then raise exception 'Day close not found'; end if;
  if v_close.status <> 'open' then raise exception 'Only an open day close can be cancelled'; end if;

  update public.closings
    set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
        remarks = trim(coalesce(remarks, '') || E'\nCancelled: ' || coalesce(p_reason, 'No reason provided.'))
    where id = p_closing_id;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'day_close_cancelled', 'closings', p_closing_id::text,
    'Cancelled open day close ' || v_close.closing_number || ' for ' || v_close.close_date,
    jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object('id', p_closing_id, 'closing_number', v_close.closing_number, 'status', 'cancelled');
end;
$$;

-- Read RPCs: only authenticated may execute (these are security definer).
revoke all on function public.get_pool_seed(text, date) from public, anon;
revoke all on function public.get_pool_movements(text, date, date) from public, anon;
revoke all on function public.get_pool_balances(date) from public, anon;
revoke all on function public.get_open_close() from public, anon;
revoke all on function public.get_closings(integer) from public, anon;
revoke all on function public.cancel_open_close(uuid, text) from public, anon;
grant execute on function public.get_pool_seed(text, date) to authenticated;
grant execute on function public.get_pool_movements(text, date, date) to authenticated;
grant execute on function public.get_pool_balances(date) to authenticated;
grant execute on function public.get_open_close() to authenticated;
grant execute on function public.get_closings(integer) to authenticated;
grant execute on function public.cancel_open_close(uuid, text) to authenticated;

