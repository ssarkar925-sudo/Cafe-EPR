-- ==============================================================================
-- FIX: Per-Account Opening Balances Synchronization & Pool Calculation
-- ==============================================================================
-- Ensures setting an opening balance on an individual instrument (e.g. Redepro Wallet, SBI Bank)
-- immediately updates both:
-- 1. payment_instruments.opening_balance (so Payment Accounts shows the exact live balance)
-- 2. public.get_pool_seed (so Opening Balances & Settlements include all active instrument seeds)
-- ==============================================================================

-- 1. Update set_opening_balance to sync payment_instruments
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
  if p_pool is null or p_pool not in ('cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card') then
    raise exception 'Invalid pool';
  end if;
  if p_amount is null or p_amount < 0 then raise exception 'Opening balance cannot be negative'; end if;
  if p_instrument_id is not null and not exists (
    select 1 from public.payment_instruments where id = p_instrument_id
  ) then
    raise exception 'Payment instrument not found';
  end if;

  -- Insert audit history record
  insert into public.opening_balances (pool, instrument_id, amount, as_of, remarks, created_by)
  values (p_pool, p_instrument_id, p_amount, p_as_of, p_remarks, auth.uid())
  returning id into v_id;

  -- Sync payment_instruments.opening_balance if instrument_id is provided
  if p_instrument_id is not null then
    update public.payment_instruments
      set opening_balance = p_amount, updated_at = now()
      where id = p_instrument_id;
  end if;

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


-- 2. Update get_pool_seed to accurately sum active instrument opening balances
create or replace function public.get_pool_seed(p_pool text, p_as_of date)
returns table (opening numeric, seed_date date)
language plpgsql
security definer set search_path = public
as $$
declare
  v_pool_amount numeric := 0;
  v_pool_date date;
  v_inst_total numeric := 0;
  v_inst_date date;
begin
  -- 1. Unassigned pool seed
  select amount, as_of into v_pool_amount, v_pool_date
    from public.opening_balances
    where pool = p_pool and instrument_id is null and as_of <= p_as_of
    order by as_of desc, is_auto desc, created_at desc
    limit 1;

  -- 2. Per-instrument latest opening balances
  select coalesce(sum(amount), 0), max(as_of) into v_inst_total, v_inst_date
  from (
    select distinct on (ob.instrument_id) ob.amount, ob.as_of
    from public.opening_balances ob
    join public.payment_instruments pi on pi.id = ob.instrument_id
    where ob.pool = p_pool and ob.instrument_id is not null and ob.as_of <= p_as_of and pi.is_active = true
    order by ob.instrument_id, ob.as_of desc, ob.created_at desc
  ) inst;

  -- 3. Fallback: check payment_instruments.opening_balance directly if no opening_balances rows exist
  if coalesce(v_inst_total, 0) = 0 then
    select coalesce(sum(opening_balance), 0) into v_inst_total
    from public.payment_instruments
    where (
      (p_pool = 'bank' and type in ('bank', 'debit_card')) or
      (p_pool = 'credit_card' and type = 'credit_card') or
      (p_pool = 'wallet' and type = 'wallet') or
      (p_pool = 'cash' and type = 'cash') or
      (p_pool = 'upi_qr' and type = 'upi')
    ) and is_active = true and opening_balance > 0;
  end if;

  return query
  select
    case
      when coalesce(v_inst_total, 0) > 0 then v_inst_total + coalesce(v_pool_amount, 0)
      else coalesce(v_pool_amount, 0)
    end as opening,
    case
      when v_inst_date is not null and (v_pool_date is null or v_inst_date >= v_pool_date) then v_inst_date
      when v_pool_date is not null then v_pool_date
      else '0001-01-01'::date
    end as seed_date;
end;
$$;

revoke all on function public.get_pool_seed(text, date) from public, anon;
grant execute on function public.get_pool_seed(text, date) to authenticated, service_role;
