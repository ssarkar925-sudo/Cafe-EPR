-- ==============================================================================
-- Add Credit Card Settlement Types to create_settlement
-- ==============================================================================

alter table public.settlements drop constraint if exists settlements_settlement_type_check;
alter table public.settlements drop constraint if exists settlements_from_pool_check;
alter table public.settlements drop constraint if exists settlements_to_pool_check;

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
  elsif p_settlement_type = 'upi_qr_to_bank' then
    v_from := 'upi_qr'; v_to := 'bank'; v_prefix := 'UQB'; v_cash_dir := null;
  elsif p_settlement_type = 'wallet_to_bank' then
    v_from := 'wallet'; v_to := 'bank'; v_prefix := 'WTB'; v_cash_dir := null;
  elsif p_settlement_type = 'bank_to_recharge' then
    v_from := 'bank'; v_to := 'recharge'; v_prefix := 'BTR'; v_cash_dir := null;
  elsif p_settlement_type = 'recharge_to_bank' then
    v_from := 'recharge'; v_to := 'bank'; v_prefix := 'RTB'; v_cash_dir := null;
  elsif p_settlement_type = 'recharge_to_wallet' then
    v_from := 'recharge'; v_to := 'wallet'; v_prefix := 'RTW'; v_cash_dir := null;
  elsif p_settlement_type = 'bank_to_credit_card' then
    v_from := 'bank'; v_to := 'credit_card'; v_prefix := 'BTC'; v_cash_dir := null;
  elsif p_settlement_type = 'cash_to_credit_card' then
    v_from := 'cash'; v_to := 'credit_card'; v_prefix := 'CTC'; v_cash_dir := 'out'; v_cash_label := 'Cash to Credit Card';
  elsif p_settlement_type = 'credit_card_to_bank' then
    v_from := 'credit_card'; v_to := 'bank'; v_prefix := 'CCB'; v_cash_dir := null;
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

-- ==============================================================================
-- Update get_pool_movements to include Credit Card settlements & bill payments
-- ==============================================================================

create or replace function public.get_pool_movements(
  p_pool text,
  p_from date,
  p_to date default null
)
returns numeric
language plpgsql
security definer set search_path = public
as $$
declare
  v numeric := 0;
begin
  if p_from is null then
    return 0;
  end if;

  if p_pool = 'cash' then
    select coalesce(sum(case when direction = 'in' then amount else -amount end), 0) into v
    from public.cash_entries
    where method = 'cash'
      and entry_date >= p_from and (p_to is null or entry_date <= p_to);

  elsif p_pool = 'bank' then
    select coalesce(sum(x), 0) into v from (
      -- A. Settlements received into Bank (+)
      select amount as x
      from public.settlements
      where status = 'success' and to_pool = 'bank'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)

      union all

      -- B. Settlements sent out of Bank (-)
      select -amount as x
      from public.settlements
      where status = 'success' and from_pool = 'bank'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)

      union all

      -- C. Cash entries on Bank method
      select case when direction = 'in' then amount else -amount end as x
      from public.cash_entries
      where method = 'bank'
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
    select coalesce(sum(x), 0) into v from (
      -- Settlements: CC Bill Payments (+)
      select amount as x from public.settlements where status = 'success' and to_pool = 'credit_card'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      -- Settlements: CC Cash Advance Out (-)
      select -amount from public.settlements where status = 'success' and from_pool = 'credit_card'
        and settlement_date >= p_from and (p_to is null or settlement_date <= p_to)
      union all
      -- Cash entries (bill payments/expenses)
      select case when direction = 'in' then amount else -amount end
      from public.cash_entries
      where method = 'credit_card'
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
