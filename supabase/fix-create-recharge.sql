-- =====================================================================
-- FIX: Create & Update Recharge Functions in Supabase
-- Run this in Supabase SQL Editor -> New Query -> Run
-- =====================================================================

-- 1. Ensure Recharge Providers & Slabs Tables Exist
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

drop policy if exists "recharge providers select" on public.recharge_providers;
create policy "recharge providers select" on public.recharge_providers for select to authenticated using (true);
drop policy if exists "recharge providers insert" on public.recharge_providers;
create policy "recharge providers insert" on public.recharge_providers for insert to authenticated with check (true);
drop policy if exists "recharge providers update" on public.recharge_providers;
create policy "recharge providers update" on public.recharge_providers for update to authenticated using (true) with check (true);
drop policy if exists "recharge providers delete" on public.recharge_providers;
create policy "recharge providers delete" on public.recharge_providers for delete to authenticated using (true);

drop policy if exists "recharge slabs select" on public.recharge_commission_slabs;
create policy "recharge slabs select" on public.recharge_commission_slabs for select to authenticated using (true);
drop policy if exists "recharge slabs insert" on public.recharge_commission_slabs;
create policy "recharge slabs insert" on public.recharge_commission_slabs for insert to authenticated with check (true);
drop policy if exists "recharge slabs update" on public.recharge_commission_slabs;
create policy "recharge slabs update" on public.recharge_commission_slabs for update to authenticated using (true) with check (true);
drop policy if exists "recharge slabs delete" on public.recharge_commission_slabs;
create policy "recharge slabs delete" on public.recharge_commission_slabs for delete to authenticated using (true);

-- 2. Extend transactions table
alter table public.transactions add column if not exists provider_id uuid references public.recharge_providers (id) on delete set null;

alter table public.transactions drop constraint if exists transactions_service_type_check;
alter table public.transactions add constraint transactions_service_type_check
  check (service_type in ('aeps', 'dmt', 'upi', 'recharge', 'recharge_due', 'due'));

create sequence if not exists public.recharge_seq start 1;
grant usage, select on sequence public.recharge_seq to authenticated;

-- 3. Server-side commission lookup function
create or replace function public.get_recharge_commission(p_provider_id uuid, p_amount numeric)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_percent numeric;
  v_commission numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  select s.commission_percent into v_percent
  from public.recharge_commission_slabs s
  where s.provider_id = p_provider_id
    and p_amount >= s.min_amount and p_amount <= s.max_amount
  order by s.min_amount
  limit 1;

  if v_percent is null then
    v_percent := 0;
  end if;

  v_commission := round(p_amount * v_percent / 100, 2);

  return jsonb_build_object(
    'percent', v_percent,
    'commission', v_commission,
    'cost', round(p_amount - v_commission, 2)
  );
end;
$$;
revoke all on function public.get_recharge_commission(uuid, numeric) from public, anon;
grant execute on function public.get_recharge_commission(uuid, numeric) to authenticated;

-- 4. Create recharge RPC
drop function if exists public.create_recharge(uuid, date, timestamptz, uuid, text, text, text, text, numeric);
drop function if exists public.create_recharge(uuid, date, timestamptz, uuid, text, text, text, text, numeric, text);

create or replace function public.create_recharge(
  p_provider_id uuid,
  p_transaction_date date,
  p_transaction_timestamp timestamptz,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_remarks text,
  p_status text default 'success',
  p_amount numeric default null,
  p_customer_pay_method text default 'cash'
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
  v_provider_name text := 'Recharge';
  v_cash_in numeric := 0;
  v_bank_in numeric := 0;
  v_pay_method text;
  v_prev_bal numeric := 0;
  v_new_bal numeric := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_status not in ('success', 'pending', 'failed') then raise exception 'Invalid status'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  v_pay_method := coalesce(p_customer_pay_method, 'cash');
  if v_pay_method not in ('cash', 'bank', 'due') then
    v_pay_method := 'cash';
  end if;

  if v_pay_method = 'due' and p_customer_id is null then
    raise exception 'Please select a customer to mark this recharge as Due (Credit).';
  end if;

  if p_provider_id is not null then
    select name into v_provider_name from public.recharge_providers where id = p_provider_id;
  end if;

  if p_provider_id is not null then
    select (get_recharge_commission(p_provider_id, p_amount)->>'commission')::numeric,
           (get_recharge_commission(p_provider_id, p_amount)->>'cost')::numeric
    into v_commission, v_cost;
  else
    v_commission := 0;
    v_cost := p_amount;
  end if;

  v_number := 'RCH-' || lpad(nextval('public.recharge_seq')::text, 4, '0');

  if v_pay_method = 'cash' then
    v_cash_in := p_amount;
  elsif v_pay_method = 'bank' then
    v_bank_in := p_amount;
  else
    v_cash_in := 0;
    v_bank_in := 0;
  end if;

  insert into public.transactions (
    transaction_number, service_type, direction, transaction_date, transaction_timestamp,
    customer_id, customer_mobile, reference, remarks, status,
    provider_id, amount, service_fee, portal_commission, created_by,
    cash_out, cash_in, bank_out, bank_in, pool_out, pool_credit, pool_credit_type,
    customer_pay_method
  ) values (
    v_number, 'recharge', 'in', p_transaction_date,
    coalesce(p_transaction_timestamp, p_transaction_date::timestamptz),
    p_customer_id, p_customer_mobile, nullif(p_reference, ''), p_remarks, p_status,
    p_provider_id, p_amount, 0, v_commission, auth.uid(),
    0, v_cash_in, 0, v_bank_in, v_cost, 0, 'recharge',
    v_pay_method
  ) returning id into v_txn_id;

  if p_status = 'success' then
    if v_pay_method = 'cash' then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
      values (p_transaction_date, 'cash', 'in', p_amount,
              'Recharge ' || v_number || ' received in cash', 'transaction', v_txn_id);
    elsif v_pay_method = 'bank' then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
      values (p_transaction_date, 'bank', 'in', p_amount,
              'Recharge ' || v_number || ' received via Bank/UPI', 'transaction', v_txn_id);
    elsif v_pay_method = 'due' and p_customer_id is not null then
      select coalesce(balance, 0) into v_prev_bal from public.customers where id = p_customer_id;
      v_new_bal := v_prev_bal + p_amount;
      update public.customers set balance = v_new_bal where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, debit, credit, balance_after, ref_type, ref_id)
      values (p_customer_id, p_transaction_date, 'recharge', 'Recharge ' || v_number || ' on credit', p_amount, 0, v_new_bal, 'transaction', v_txn_id);
    end if;
  end if;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'transaction_created', 'transactions', v_txn_id::text,
    'Created Recharge ' || v_number || ' (' || p_status || ') of ' || p_amount ||
    ' via ' || coalesce(v_provider_name, 'Recharge') || ' | payment: ' || v_pay_method || ' | commission ' || v_commission,
    jsonb_build_object('service_type', 'recharge', 'provider', v_provider_name,
                       'amount', p_amount, 'commission', v_commission, 'cost', v_cost, 'status', p_status, 'customer_pay_method', v_pay_method)
  );

  return (
    select jsonb_build_object('id', id, 'transaction_number', transaction_number,
      'service_type', service_type, 'direction', direction, 'status', status,
      'amount', amount, 'service_fee', service_fee, 'portal_commission', portal_commission,
      'cash_in', cash_in, 'bank_in', bank_in, 'pool_out', pool_out, 'pool_credit', pool_credit,
      'pool_credit_type', pool_credit_type, 'customer_pay_method', customer_pay_method)
    from public.transactions where id = v_txn_id
  );
end;
$$;

revoke all on function public.create_recharge(uuid, date, timestamptz, uuid, text, text, text, text, numeric, text) from public, anon;
grant execute on function public.create_recharge(uuid, date, timestamptz, uuid, text, text, text, text, numeric, text) to authenticated;

-- 5. Update recharge RPC
drop function if exists public.update_recharge(uuid, uuid, date, timestamptz, uuid, text, text, text, numeric);
drop function if exists public.update_recharge(uuid, uuid, date, timestamptz, uuid, text, text, text, numeric, text);

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
  v_commission numeric := 0;
  v_cost numeric;
  v_provider_name text := 'Recharge';
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  select * into v_txn from public.transactions where id = p_txn_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_txn.status <> 'success' then raise exception 'Only successful transactions can be edited'; end if;
  if v_txn.service_type <> 'recharge' then raise exception 'Not a recharge transaction'; end if;

  if p_provider_id is not null then
    select name into v_provider_name from public.recharge_providers where id = p_provider_id;
    select (get_recharge_commission(p_provider_id, p_amount)->>'commission')::numeric,
           (get_recharge_commission(p_provider_id, p_amount)->>'cost')::numeric
    into v_commission, v_cost;
  else
    v_commission := 0;
    v_cost := p_amount;
  end if;

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
    pool_credit = 0,
    pool_credit_type = 'recharge',
    updated_at = now()
  where id = p_txn_id;

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
  values (p_transaction_date, 'cash', 'in', p_amount,
          'Recharge ' || v_txn.transaction_number || ' received in cash', 'transaction', p_txn_id);

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'transaction_updated', 'transactions', p_txn_id::text,
    'Edited ' || v_txn.transaction_number || ' to ' || p_amount ||
    ' via ' || coalesce(v_provider_name, 'Recharge') || ' | commission ' || v_commission,
    jsonb_build_object('amount', p_amount, 'commission', v_commission, 'cost', v_cost)
  );

  return (
    select jsonb_build_object('id', id, 'transaction_number', transaction_number,
      'service_type', service_type, 'direction', direction, 'status', status,
      'amount', amount, 'service_fee', service_fee, 'portal_commission', portal_commission,
      'cash_in', cash_in, 'bank_in', bank_in, 'pool_out', pool_out, 'pool_credit', pool_credit,
      'pool_credit_type', pool_credit_type, 'customer_pay_method', customer_pay_method)
    from public.transactions where id = p_txn_id
  );
end;
$$;

revoke all on function public.update_recharge(uuid, uuid, date, timestamptz, uuid, text, text, text, numeric) from public, anon;
grant execute on function public.update_recharge(uuid, uuid, date, timestamptz, uuid, text, text, text, numeric) to authenticated;

-- Notify PostgREST schema cache to reload immediately
notify pgrst, 'reload schema';

