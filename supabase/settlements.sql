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
    'upi_qr_to_bank', 'wallet_to_bank', 'bank_withdrawal', 'add_cash_to_bank', 'cash_adjustment'
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
create index if not exists settlements_pool_idx on public.settlements (from_pool, to_pool);

alter table public.settlements enable row level security;
drop policy if exists "settlements select" on public.settlements;
create policy "settlements select" on public.settlements for select to authenticated using (public.is_back_office());
drop policy if exists "settlements insert" on public.settlements;
create policy "settlements insert" on public.settlements for insert to authenticated with check (public.is_back_office());
drop policy if exists "settlements update" on public.settlements;
create policy "settlements update" on public.settlements for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

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
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

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

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'settlement_reversed', 'settlements', p_settlement_id::text,
    'Reversed settlement ' || v_settlement.settlement_number || ' of ' || v_settlement.amount,
    jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object('id', p_settlement_id, 'status', 'reversed');
end;
$$;

-- ---------- Pool balances (single source of truth for KPI cards) ----------
-- Pools = external fund flows captured in the cash book (sales, quick sales, expenses,
-- refunds) PLUS internal transfers tracked in the settlements ledger PLUS business
-- module legs (AEPS/DMT/UPI) posted on the transactions row. This keeps the dashboard
-- Money Position consistent with the Cash Book for every account.
-- The shop's OWN credit cards are used for money-out (expense): spends reduce the
-- credit_card pool (available limit), NOT the bank pool. Customer card-machine
-- receipts (method 'card') settle to BANK.
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
$$
revoke all on function public.get_settlement_summary() from public, anon;
grant execute on function public.get_settlement_summary() to authenticated;

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
