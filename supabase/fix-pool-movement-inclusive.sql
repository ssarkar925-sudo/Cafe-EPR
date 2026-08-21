-- Run this in Supabase SQL Editor (idempotent). Fixes settlement balances.
--
-- ROOT CAUSE: get_pool_movements used `settlement_date > p_from` (strict) where p_from is
-- the opening-balance seed date. A settlement recorded ON the same date as the opening
-- balance was therefore excluded, so AEPS->Bank (or any same-day transfer) never moved the
-- pool balances shown on the dashboard / day close. This hit every pool, not just AEPS.
--
-- FIX:
--   1. Make the seed-date boundary inclusive (>= p_from) so same-day movements count.
--   2. The auto day-close seed is stamped as_of close_date + 1 day, so the inclusive
--      boundary does NOT double-count the closed day's movements (they are already inside
--      the seeded final balance).

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

-- ---------- close_day: auto next-day opening seed stamped as_of close_date + 1 ----------
-- (keeps the inclusive boundary above from double-counting the closed day's movements)
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

-- Re-grant close_day (signature unchanged).
revoke all on function public.close_day(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.close_day(uuid, numeric, numeric, text) to authenticated;
