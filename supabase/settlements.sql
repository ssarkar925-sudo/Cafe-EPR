-- Run this in Supabase SQL Editor (idempotent).
-- Settlements: internal fund-movement ledger between Cash / Bank / Wallet / DMT Float / AEPS Float / UPI QR pools.
-- Every settlement type is a distinct one-way transfer (no duplicates, no overlap with AEPS/DMT/UPI transactions).
-- Only physical-cash movements (bank withdrawal, cash to bank, cash adjustment) post a matching cash_entries row,
-- so the dashboard "Cash in Hand" and the cash book stay correct without double counting.

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  settlement_number text not null unique,
  settlement_type text not null check (settlement_type in (
    'aeps_to_bank', 'bank_to_dmt', 'wallet_to_dmt', 'upi_qr_to_wallet',
    'wallet_to_bank', 'bank_withdrawal', 'add_cash_to_bank', 'cash_adjustment'
  )),
  settlement_date date not null default current_date,
  from_pool text not null check (from_pool in ('cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr')),
  to_pool text not null check (to_pool in ('cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr')),
  direction text check (direction in ('in', 'out')),
  amount numeric(15,2) not null default 0 check (amount >= 0),
  reference text,
  remarks text,
  status text not null default 'success' check (status in ('success', 'reversed')),
  created_by uuid references public.profiles (id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists settlements_date_idx on public.settlements (settlement_date desc);
create index if not exists settlements_type_idx on public.settlements (settlement_type);
create index if not exists settlements_status_idx on public.settlements (status);

alter table public.settlements enable row level security;
create policy "settlements all" on public.settlements for all to authenticated using (true) with check (true);

create sequence if not exists public.settlement_seq start 1;

-- ---------- Create settlement (atomic: row + optional cash leg) ----------
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

  return jsonb_build_object('id', v_id, 'settlement_number', v_number, 'status', 'success');
end;
$$;

-- ---------- Reverse settlement (audited, journal never deleted) ----------
create or replace function public.reverse_settlement(p_settlement_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_settlement record;
  v_opposite text;
  v_label text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_settlement from public.settlements where id = p_settlement_id for update;
  if not found then raise exception 'Settlement not found'; end if;
  if v_settlement.status <> 'success' then raise exception 'This settlement is already closed'; end if;

  if v_settlement.direction is not null then
    v_opposite := case when v_settlement.direction = 'in' then 'out' else 'in' end;
    v_label := case
      when v_settlement.settlement_type = 'bank_withdrawal' then 'Bank Withdrawal Reversed'
      when v_settlement.settlement_type = 'add_cash_to_bank' then 'Cash to Bank Reversed'
      else case when v_opposite = 'in' then 'Cash Added (Reversed)' else 'Cash Removed (Reversed)' end
    end;
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (current_date, 'cash', v_opposite, v_settlement.amount,
            'Settlement: ' || v_label || ' (' || v_settlement.settlement_number || ')', 'settlement', p_settlement_id);
  end if;

  update public.settlements
  set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(),
      remarks = trim(coalesce(remarks, '') || E'\nReversed: ' || coalesce(p_reason, 'No reason provided.'))
  where id = p_settlement_id;

  return jsonb_build_object('id', p_settlement_id, 'status', 'reversed');
end;
$$;

-- ---------- Pool balances (single source of truth for KPI cards) ----------
-- Pools = external fund flows captured in the cash book (sales, quick sales, expenses,
-- refunds) PLUS internal transfers tracked in the settlements ledger PLUS business
-- module legs (AEPS/DMT/UPI) posted on the transactions row. This keeps the dashboard
-- Money Position consistent with the Cash Book for every account.
create or replace function public.get_settlement_summary()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_cash numeric;
  v_bank numeric;
  v_wallet numeric;
  v_dmt numeric;
  v_aeps numeric;
  v_upi_qr numeric;
  v_count bigint;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select coalesce(sum(case when direction = 'in' then amount else -amount end), 0) into v_cash
  from public.cash_entries where method = 'cash';

  select coalesce(sum(x), 0) into v_bank
  from (
    select amount as x from public.settlements where status = 'success' and to_pool = 'bank'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'bank'
    union all
    select case when direction = 'in' then amount else -amount end
    from public.cash_entries where method in ('bank', 'debit_card', 'credit_card')
    union all
    select bank_in from public.transactions where status = 'success' and bank_in > 0
    union all
    select -bank_out from public.transactions where status = 'success' and bank_out > 0
  ) t;

  select coalesce(sum(x), 0) into v_wallet
  from (
    select amount as x from public.settlements where status = 'success' and to_pool = 'wallet'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'wallet'
    union all
    select case when direction = 'in' then amount else -amount end
    from public.cash_entries where method = 'wallet'
  ) t;

  select coalesce(sum(x), 0) into v_dmt
  from (
    select amount as x from public.settlements where status = 'success' and to_pool = 'dmt'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'dmt'
    union all
    select case when direction = 'in' then amount else -amount end
    from public.cash_entries where method = 'dmt'
    union all
    select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'dmt'
    union all
    select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'dmt'
  ) t;

  select coalesce(sum(x), 0) into v_aeps
  from (
    select amount as x from public.settlements where status = 'success' and to_pool = 'aeps'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'aeps'
    union all
    select case when direction = 'in' then amount else -amount end
    from public.cash_entries where method = 'aeps'
    union all
    select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'aeps'
    union all
    select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'aeps'
  ) t;

  select coalesce(sum(x), 0) into v_upi_qr
  from (
    select amount as x from public.settlements where status = 'success' and to_pool = 'upi_qr'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'upi_qr'
    union all
    select case when direction = 'in' then amount else -amount end
    from public.cash_entries where method = 'upi'
    union all
    select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'upi_qr'
    union all
    select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'upi_qr'
  ) t;

  select count(*) into v_count from public.settlements where status = 'success';

  return jsonb_build_object(
    'cash', v_cash, 'bank', v_bank, 'wallet', v_wallet,
    'dmt', v_dmt, 'aeps', v_aeps, 'upi_qr', v_upi_qr, 'count', v_count
  );
end;
$$;

-- ---------- Realtime publish (idempotent) ----------
do $$
declare t text;
begin
  foreach t in array array['settlements']
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
