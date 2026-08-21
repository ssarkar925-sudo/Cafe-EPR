-- Run this in Supabase SQL Editor (idempotent).
-- Recharge module (mobile / DTH): a dedicated 'recharge' float pool with
-- provider-wise commission slabs. One transaction atomically records:
--   cash_in  = customer pays the face amount in cash
--   pool_out = the recharge float is debited by the cost (amount - commission)
--   portal_commission = shop earnings, computed SERVER-SIDE from the slabs
-- The float is loaded from the bank via settlement type 'bank_to_recharge'.

-- ---------- 1. Provider + commission slab tables ----------
create table if not exists public.recharge_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.recharge_commission_slabs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.recharge_providers (id) on delete cascade,
  min_amount numeric(15,2) not null default 0 check (min_amount >= 0),
  max_amount numeric(15,2) not null default 999999 check (max_amount > min_amount),
  commission_percent numeric(6,2) not null default 0 check (commission_percent >= 0),
  created_at timestamptz not null default now(),
  constraint recharge_slab_range check (max_amount > min_amount)
);

create index if not exists recharge_slabs_provider_idx on public.recharge_commission_slabs (provider_id, min_amount);
create index if not exists recharge_providers_active_idx on public.recharge_providers (is_active, sort_order);

alter table public.recharge_providers enable row level security;
alter table public.recharge_commission_slabs enable row level security;

create policy "recharge providers select" on public.recharge_providers for select to authenticated using (true);
create policy "recharge providers insert" on public.recharge_providers for insert to authenticated with check (public.is_back_office());
create policy "recharge providers update" on public.recharge_providers for update to authenticated using (public.is_back_office()) with check (public.is_back_office());
create policy "recharge providers delete" on public.recharge_providers for delete to authenticated using (public.is_admin());

create policy "recharge slabs select" on public.recharge_commission_slabs for select to authenticated using (true);
create policy "recharge slabs insert" on public.recharge_commission_slabs for insert to authenticated with check (public.is_back_office());
create policy "recharge slabs update" on public.recharge_commission_slabs for update to authenticated using (public.is_back_office()) with check (public.is_back_office());
create policy "recharge slabs delete" on public.recharge_commission_slabs for delete to authenticated using (public.is_admin());

-- ---------- 2. Extend transactions with the provider + service type ----------
alter table public.transactions add column if not exists provider_id uuid references public.recharge_providers (id) on delete set null;

alter table public.transactions drop constraint if exists transactions_service_type_check;
alter table public.transactions add constraint transactions_service_type_check
  check (service_type in ('aeps', 'dmt', 'upi', 'recharge'));

create sequence if not exists public.recharge_seq start 1;
grant usage, select on sequence public.recharge_seq to authenticated;

-- ---------- 3. Server-side commission lookup ----------
create or replace function public.get_recharge_commission(p_provider_id uuid, p_amount numeric)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_percent numeric;
  v_commission numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  select s.commission_percent into v_percent
  from public.recharge_commission_slabs s
  where s.provider_id = p_provider_id
    and p_amount >= s.min_amount and p_amount <= s.max_amount
  order by s.min_amount
  limit 1;

  if v_percent is null then
    raise exception 'No commission slab covers this amount (%.2f) for this provider', p_amount;
  end if;

  v_commission := round(p_amount * v_percent / 100, 2);

  return jsonb_build_object(
    'percent', v_percent,
    'commission', v_commission,
    'cost', p_amount - v_commission
  );
end;
$$;
revoke all on function public.get_recharge_commission(uuid, numeric) from public, anon;
grant execute on function public.get_recharge_commission(uuid, numeric) to authenticated;

-- ---------- 4. Create recharge ----------
create or replace function public.create_recharge(
  p_provider_id uuid,
  p_transaction_date date,
  p_transaction_timestamp timestamptz,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_remarks text,
  p_status text default 'success',
  p_amount numeric default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_txn_id uuid;
  v_number text;
  v_commission numeric;
  v_cost numeric;
  v_provider_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_status not in ('success', 'pending', 'failed') then raise exception 'Invalid status'; end if;
  if p_provider_id is null then raise exception 'A recharge provider is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  select name into v_provider_name from public.recharge_providers
  where id = p_provider_id and is_active;
  if not found then raise exception 'The selected provider is not available'; end if;

  select (get_recharge_commission(p_provider_id, p_amount)->>'commission')::numeric,
         (get_recharge_commission(p_provider_id, p_amount)->>'cost')::numeric
  into v_commission, v_cost;

  v_number := 'RCH-' || lpad(nextval('public.recharge_seq')::text, 4, '0');

  insert into public.transactions (
    transaction_number, service_type, direction, transaction_date, transaction_timestamp,
    customer_id, customer_mobile, reference, remarks, status,
    provider_id, amount, service_fee, portal_commission, created_by,
    cash_out, cash_in, pool_out, pool_credit, pool_credit_type
  ) values (
    v_number, 'recharge', 'in', p_transaction_date,
    coalesce(p_transaction_timestamp, p_transaction_date::timestamptz),
    p_customer_id, p_customer_mobile, nullif(p_reference, ''), p_remarks, p_status,
    p_provider_id, p_amount, 0, v_commission, auth.uid(),
    0, p_amount, v_cost, v_cost, 'recharge'
  ) returning id into v_txn_id;

  if p_status = 'success' then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (p_transaction_date, 'cash', 'in', p_amount,
            'Recharge ' || v_number || ' received in cash', 'transaction', v_txn_id);
  end if;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'transaction_created', 'transactions', v_txn_id::text,
    'Created Recharge ' || v_number || ' (' || p_status || ') of ' || p_amount ||
    ' via ' || v_provider_name || ' | commission ' || v_commission,
    jsonb_build_object('service_type', 'recharge', 'provider', v_provider_name,
                       'amount', p_amount, 'commission', v_commission, 'cost', v_cost, 'status', p_status)
  );

  return (
    select jsonb_build_object('id', id, 'transaction_number', transaction_number,
      'service_type', service_type, 'direction', direction, 'status', status,
      'amount', amount, 'service_fee', service_fee, 'portal_commission', portal_commission,
      'cash_in', cash_in, 'pool_out', pool_out, 'pool_credit', pool_credit,
      'pool_credit_type', pool_credit_type)
    from public.transactions where id = v_txn_id
  );
end;
$$;
revoke all on function public.create_recharge(uuid, date, timestamptz, uuid, text, text, text, text, numeric) from public, anon;
grant execute on function public.create_recharge(uuid, date, timestamptz, uuid, text, text, text, text, numeric) to authenticated;

-- ---------- 5. Edit recharge (reverses old cash leg, recomputes commission) ----------
create or replace function public.update_recharge(
  p_txn_id uuid,
  p_provider_id uuid,
  p_transaction_date date,
  p_transaction_timestamp timestamptz,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_remarks text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_txn record;
  v_commission numeric;
  v_cost numeric;
  v_provider_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  select * into v_txn from public.transactions where id = p_txn_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_txn.status <> 'success' then raise exception 'Only successful transactions can be edited'; end if;
  if v_txn.service_type <> 'recharge' then raise exception 'Not a recharge transaction'; end if;

  select name into v_provider_name from public.recharge_providers
  where id = p_provider_id and is_active;
  if not found then raise exception 'The selected provider is not available'; end if;

  select (get_recharge_commission(p_provider_id, p_amount)->>'commission')::numeric,
         (get_recharge_commission(p_provider_id, p_amount)->>'cost')::numeric
  into v_commission, v_cost;

  -- Reverse old cash leg
  if v_txn.cash_in > 0 then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (current_date, 'cash', 'out', v_txn.cash_in,
            'Corrected Recharge ' || v_txn.transaction_number, 'transaction', p_txn_id);
  end if;

  update public.transactions set
    transaction_date = p_transaction_date,
    transaction_timestamp = coalesce(p_transaction_timestamp, p_transaction_date::timestamptz),
    customer_id = p_customer_id,
    customer_mobile = p_customer_mobile,
    reference = nullif(p_reference, ''),
    remarks = p_remarks,
    provider_id = p_provider_id,
    amount = p_amount,
    portal_commission = v_commission,
    cash_in = p_amount,
    pool_out = v_cost,
    pool_credit = v_cost,
    updated_at = now()
  where id = p_txn_id;

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
  values (p_transaction_date, 'cash', 'in', p_amount,
          'Recharge ' || v_txn.transaction_number || ' received in cash', 'transaction', p_txn_id);

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'transaction_updated', 'transactions', p_txn_id::text,
    'Edited ' || v_txn.transaction_number || ' to ' || p_amount ||
    ' via ' || v_provider_name || ' | commission ' || v_commission,
    jsonb_build_object('amount', p_amount, 'commission', v_commission, 'cost', v_cost)
  );

  return jsonb_build_object('id', p_txn_id, 'status', 'success');
end;
$$;
revoke all on function public.update_recharge(uuid, uuid, date, timestamptz, uuid, text, text, text, numeric) from public, anon;
grant execute on function public.update_recharge(uuid, uuid, date, timestamptz, uuid, text, text, text, numeric) to authenticated;

-- ---------- 6. Settlements: allow the recharge pool + load/unload types ----------
alter table public.settlements drop constraint if exists settlements_settlement_type_check;
alter table public.settlements add constraint settlements_settlement_type_check
  check (settlement_type in (
    'aeps_to_bank', 'bank_to_dmt', 'wallet_to_dmt', 'upi_qr_to_wallet',
    'wallet_to_bank', 'bank_withdrawal', 'add_cash_to_bank', 'cash_adjustment',
    'bank_to_recharge', 'recharge_to_bank'
  ));
alter table public.settlements drop constraint if exists settlements_from_pool_check;
alter table public.settlements add constraint settlements_from_pool_check
  check (from_pool in ('cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'recharge'));
alter table public.settlements drop constraint if exists settlements_to_pool_check;
alter table public.settlements add constraint settlements_to_pool_check
  check (to_pool in ('cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'recharge'));

-- Opening/closing balances: allow the recharge pool
alter table public.opening_balances drop constraint if exists opening_balances_pool_check;
alter table public.opening_balances add constraint opening_balances_pool_check
  check (pool in ('cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card', 'recharge'));
alter table public.closing_balances drop constraint if exists closing_balances_pool_check;
alter table public.closing_balances add constraint closing_balances_pool_check
  check (pool in ('cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card', 'recharge'));

-- Opening balance setter: accept the recharge pool
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
revoke all on function public.set_opening_balance(text, numeric, date, uuid, text) from public, anon;
grant execute on function public.set_opening_balance(text, numeric, date, uuid, text) to authenticated;

create or replace function public.create_settlement(
  p_settlement_type text,
  p_settlement_date date,
  p_amount numeric,
  p_reference text,
  p_remarks text,
  p_direction text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_number text;
  v_from text;
  v_to text;
  v_prefix text;
  v_cash_dir text;
  v_cash_label text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_settlement_date is null then raise exception 'Date is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  if p_settlement_type = 'aeps_to_bank' then
    v_from := 'aeps'; v_to := 'bank'; v_prefix := 'ATB'; v_cash_dir := null;
  elsif p_settlement_type = 'bank_to_dmt' then
    v_from := 'bank'; v_to := 'dmt'; v_prefix := 'BTD'; v_cash_dir := null;
  elsif p_settlement_type = 'wallet_to_dmt' then
    v_from := 'wallet'; v_to := 'dmt'; v_prefix := 'WTD'; v_cash_dir := null;
  elsif p_settlement_type = 'upi_qr_to_wallet' then
    v_from := 'upi_qr'; v_to := 'wallet'; v_prefix := 'UQW'; v_cash_dir := null;
  elsif p_settlement_type = 'wallet_to_bank' then
    v_from := 'wallet'; v_to := 'bank'; v_prefix := 'WTB'; v_cash_dir := null;
  elsif p_settlement_type = 'bank_to_recharge' then
    v_from := 'bank'; v_to := 'recharge'; v_prefix := 'BTR'; v_cash_dir := null;
  elsif p_settlement_type = 'recharge_to_bank' then
    v_from := 'recharge'; v_to := 'bank'; v_prefix := 'RTB'; v_cash_dir := null;
  elsif p_settlement_type = 'bank_withdrawal' then
    v_from := 'bank'; v_to := 'cash'; v_prefix := 'BWD'; v_cash_dir := 'in'; v_cash_label := 'Bank Withdrawal';
  elsif p_settlement_type = 'add_cash_to_bank' then
    v_from := 'cash'; v_to := 'bank'; v_prefix := 'CTB'; v_cash_dir := 'out'; v_cash_label := 'Cash to Bank';
  elsif p_settlement_type = 'cash_adjustment' then
    if p_direction not in ('in', 'out') then raise exception 'Select Add Cash or Remove Cash'; end if;
    v_from := 'cash'; v_to := 'cash'; v_prefix := 'CAD';
    v_cash_dir := p_direction;
    v_cash_label := case when p_direction = 'in' then 'Cash Added' else 'Cash Removed' end;
  else
    raise exception 'Invalid settlement type';
  end if;

  v_number := v_prefix || '-' || lpad(nextval('public.settlement_seq')::text, 4, '0');

  insert into public.settlements (
    settlement_number, settlement_type, settlement_date, from_pool, to_pool,
    direction, amount, reference, remarks, status, created_by
  ) values (
    v_number, p_settlement_type, p_settlement_date, v_from, v_to,
    v_cash_dir, p_amount, nullif(p_reference, ''), p_remarks, 'success', auth.uid()
  ) returning id into v_id;

  if v_cash_dir is not null then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (p_settlement_date, 'cash', v_cash_dir, p_amount,
            'Settlement: ' || v_cash_label || ' (' || v_number || ')', 'settlement', v_id);
  end if;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'settlement_created', 'settlements', v_id::text,
    'Settlement ' || v_number || ' ' || v_from || ' -> ' || v_to || ' of ' || p_amount,
    jsonb_build_object('type', p_settlement_type, 'amount', p_amount, 'reference', p_reference)
  );

  return jsonb_build_object('id', v_id, 'settlement_number', v_number, 'status', 'success');
end;
$$;
revoke all on function public.create_settlement(text, date, numeric, text, text, text) from public, anon;
grant execute on function public.create_settlement(text, date, numeric, text, text, text) to authenticated;

-- ---------- 7. Pool movements: add the recharge branch ----------
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
revoke all on function public.get_pool_movements(text, date, date) from public, anon;
grant execute on function public.get_pool_movements(text, date, date) to authenticated;

-- ---------- 8. Pool balances / settlement summary / open-close: add 'recharge' ----------
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
revoke all on function public.get_pool_balances(date) from public, anon;
grant execute on function public.get_pool_balances(date) to authenticated;

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
revoke all on function public.get_settlement_summary() from public, anon;
grant execute on function public.get_settlement_summary() to authenticated;

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
revoke all on function public.open_close(date) from public, anon;
grant execute on function public.open_close(date) to authenticated;

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
revoke all on function public.get_open_close() from public, anon;
grant execute on function public.get_open_close() to authenticated;

-- ---------- 9. Realtime publish (idempotent) ----------
do $$
declare t text;
begin
  foreach t in array array['transactions', 'settlements', 'recharge_providers', 'recharge_commission_slabs']
  loop
    if not exists (
      select 1 from pg_publication_rel pr
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_publication p on p.oid = pr.prpubid
      where p.pubname = 'supabase_realtime' and c.relname = t and n.nspname = 'public'
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;