-- Run this in Supabase SQL Editor (idempotent).
-- AEPS / DMT / UPI module matching the previous application's structure.
-- Only SUCCESS transactions post a cash entry (reversed/deleted reverse it).

-- ---------- Master data ----------
create table if not exists public.aeps_banks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz default now()
);
create index if not exists aeps_banks_active_idx on public.aeps_banks (is_active);
alter table public.aeps_banks enable row level security;
create policy "aeps_banks all" on public.aeps_banks for all to authenticated using (true) with check (true);

create table if not exists public.aeps_portals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  remarks text,
  is_active boolean not null default true,
  created_at timestamptz default now()
);
create index if not exists aeps_portals_active_idx on public.aeps_portals (is_active);
alter table public.aeps_portals enable row level security;
create policy "aeps_portals all" on public.aeps_portals for all to authenticated using (true) with check (true);

create table if not exists public.upi_merchant_qrs (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  upi_id text not null,
  is_active boolean not null default true,
  created_at timestamptz default now()
);
create index if not exists upi_merchant_qrs_active_idx on public.upi_merchant_qrs (is_active);
alter table public.upi_merchant_qrs enable row level security;
create policy "upi_merchant_qrs all" on public.upi_merchant_qrs for all to authenticated using (true) with check (true);

-- ---------- Extend transactions to match the previous models ----------
alter table public.transactions add column if not exists customer_mobile text;
alter table public.transactions add column if not exists bank_id uuid references public.aeps_banks(id) on delete set null;
alter table public.transactions add column if not exists portal_id uuid references public.aeps_portals(id) on delete set null;
alter table public.transactions add column if not exists merchant_qr_id uuid references public.upi_merchant_qrs(id) on delete set null;
alter table public.transactions add column if not exists transfer_method text;
alter table public.transactions add column if not exists sender_name text;
alter table public.transactions add column if not exists sender_mobile text;
alter table public.transactions add column if not exists beneficiary_name text;
alter table public.transactions add column if not exists beneficiary_mobile text;
alter table public.transactions add column if not exists beneficiary_bank text;
alter table public.transactions add column if not exists beneficiary_ifsc text;
alter table public.transactions add column if not exists beneficiary_account text;
alter table public.transactions add column if not exists upi_id text;
alter table public.transactions add column if not exists service_fee numeric(15,2) not null default 0;
alter table public.transactions add column if not exists portal_commission numeric(15,2) not null default 0;
alter table public.transactions add column if not exists remarks text;
alter table public.transactions add column if not exists reversed_at timestamptz;
alter table public.transactions add column if not exists reversed_by uuid references auth.users(id) on delete set null;
alter table public.transactions add column if not exists deleted_at timestamptz;
alter table public.transactions add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table public.transactions add column if not exists updated_at timestamptz default now();

alter table public.transactions drop constraint if exists transactions_status_check;
alter table public.transactions add constraint transactions_status_check
  check (status in ('success', 'pending', 'failed', 'reversed', 'deleted'));
alter table public.transactions drop constraint if exists transactions_service_type_check;
alter table public.transactions add constraint transactions_service_type_check
  check (service_type in ('aeps', 'dmt', 'upi'));
alter table public.transactions add constraint transactions_transfer_method_check
  check (transfer_method is null or transfer_method in ('bank_account', 'upi'));

create index if not exists transactions_bank_idx on public.transactions (bank_id);
create index if not exists transactions_portal_idx on public.transactions (portal_id);

-- Per-service numbering like the previous app: AEP-0001 / DMT-0001 / UPI-0001
create sequence if not exists public.aeps_seq start 1;
create sequence if not exists public.dmt_seq start 1;
create sequence if not exists public.upi_seq start 1;

-- ---------- Create ----------
create or replace function public.create_business_txn(
  p_service_type text,
  p_transaction_date date,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_remarks text,
  p_status text,
  p_bank_id uuid,
  p_portal_id uuid,
  p_merchant_qr_id uuid,
  p_aadhaar_last4 text,
  p_transfer_method text,
  p_sender_name text,
  p_sender_mobile text,
  p_beneficiary_name text,
  p_beneficiary_mobile text,
  p_beneficiary_bank text,
  p_beneficiary_ifsc text,
  p_beneficiary_account text,
  p_upi_id text,
  p_amount numeric,
  p_service_fee numeric,
  p_portal_commission numeric
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_txn_id uuid;
  v_number text;
  v_direction text;
  v_cash numeric;
  v_seq text;
  v_prefix text;
  v_label text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_service_type not in ('aeps', 'dmt', 'upi') then raise exception 'Invalid service type'; end if;
  if p_status not in ('success', 'pending', 'failed') then raise exception 'Invalid status'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_service_fee is null or p_service_fee < 0 then raise exception 'Service fee cannot be negative'; end if;
  if p_portal_commission is null or p_portal_commission < 0 then raise exception 'Portal commission cannot be negative'; end if;

  if p_service_type = 'aeps' then
    if p_bank_id is null then raise exception 'An AEPS bank is required'; end if;
    if p_portal_id is null then raise exception 'An AEPS portal is required'; end if;
    if p_aadhaar_last4 is null or p_aadhaar_last4 !~ '^[0-9]{4}$' then
      raise exception 'Aadhaar last 4 digits are required';
    end if;
    if not exists (select 1 from public.aeps_banks where id = p_bank_id and is_active) then
      raise exception 'The selected bank is not available';
    end if;
    if not exists (select 1 from public.aeps_portals where id = p_portal_id and is_active) then
      raise exception 'The selected portal is not available';
    end if;
    v_direction := 'out'; v_prefix := 'AEP'; v_seq := 'public.aeps_seq'; v_label := 'AEPS';
  elsif p_service_type = 'dmt' then
    if p_transfer_method not in ('bank_account', 'upi') then raise exception 'Select a transfer method'; end if;
    if p_transfer_method = 'bank_account' and (p_beneficiary_account is null or p_beneficiary_account = '') then
      raise exception 'Beneficiary account number is required';
    end if;
    v_direction := 'in'; v_prefix := 'DMT'; v_seq := 'public.dmt_seq'; v_label := 'DMT';
  else
    v_direction := 'out'; v_prefix := 'UPI'; v_seq := 'public.upi_seq'; v_label := 'UPI';
  end if;

  v_number := v_prefix || '-' || lpad(nextval(v_seq)::text, 4, '0');

  if p_service_type = 'dmt' then
    v_cash := p_amount + coalesce(p_service_fee, 0);
  else
    v_cash := p_amount;
  end if;

  insert into public.transactions (
    transaction_number, service_type, direction, transaction_date, customer_id,
    customer_mobile, reference, remarks, status,
    bank_id, portal_id, merchant_qr_id, aadhaar_last4, transfer_method,
    sender_name, sender_mobile, beneficiary_name, beneficiary_mobile,
    beneficiary_bank, beneficiary_ifsc, beneficiary_account, upi_id,
    amount, service_fee, portal_commission, created_by
  ) values (
    v_number, p_service_type, v_direction, p_transaction_date, p_customer_id,
    p_customer_mobile, nullif(p_reference, ''), p_remarks, p_status,
    p_bank_id, p_portal_id, p_merchant_qr_id, p_aadhaar_last4, p_transfer_method,
    p_sender_name, p_sender_mobile, p_beneficiary_name, p_beneficiary_mobile,
    p_beneficiary_bank, p_beneficiary_ifsc, p_beneficiary_account, p_upi_id,
    p_amount, coalesce(p_service_fee, 0), coalesce(p_portal_commission, 0), auth.uid()
  ) returning id into v_txn_id;

  if p_status = 'success' then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (p_transaction_date, 'cash', v_direction, v_cash, v_label || ' ' || v_number, 'transaction', v_txn_id);
  end if;

  return (
    select jsonb_build_object('id', id, 'transaction_number', transaction_number,
      'service_type', service_type, 'direction', direction, 'status', status,
      'amount', amount, 'service_fee', service_fee, 'portal_commission', portal_commission)
    from public.transactions where id = v_txn_id
  );
end;
$$;

-- ---------- Edit (reverses old cash entry + re-posts when amounts change) ----------
create or replace function public.update_business_txn(
  p_txn_id uuid,
  p_transaction_date date,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_remarks text,
  p_bank_id uuid,
  p_portal_id uuid,
  p_merchant_qr_id uuid,
  p_aadhaar_last4 text,
  p_transfer_method text,
  p_sender_name text,
  p_sender_mobile text,
  p_beneficiary_name text,
  p_beneficiary_mobile text,
  p_beneficiary_bank text,
  p_beneficiary_ifsc text,
  p_beneficiary_account text,
  p_upi_id text,
  p_amount numeric,
  p_service_fee numeric,
  p_portal_commission numeric
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_txn record;
  v_old_cash numeric;
  v_new_cash numeric;
  v_direction text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_txn from public.transactions where id = p_txn_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_txn.status <> 'success' then raise exception 'Only successful transactions can be edited'; end if;

  v_old_cash := case when v_txn.direction = 'in' then v_txn.amount + v_txn.service_fee else v_txn.amount end;
  v_new_cash := case when v_txn.direction = 'in' then p_amount + coalesce(p_service_fee, 0) else p_amount end;
  v_direction := v_txn.direction;

  update public.transactions set
    transaction_date = p_transaction_date,
    customer_id = p_customer_id,
    customer_mobile = p_customer_mobile,
    reference = nullif(p_reference, ''),
    remarks = p_remarks,
    bank_id = p_bank_id,
    portal_id = p_portal_id,
    merchant_qr_id = p_merchant_qr_id,
    aadhaar_last4 = p_aadhaar_last4,
    transfer_method = p_transfer_method,
    sender_name = p_sender_name,
    sender_mobile = p_sender_mobile,
    beneficiary_name = p_beneficiary_name,
    beneficiary_mobile = p_beneficiary_mobile,
    beneficiary_bank = p_beneficiary_bank,
    beneficiary_ifsc = p_beneficiary_ifsc,
    beneficiary_account = p_beneficiary_account,
    upi_id = p_upi_id,
    amount = p_amount,
    service_fee = coalesce(p_service_fee, 0),
    portal_commission = coalesce(p_portal_commission, 0),
    updated_at = now()
  where id = p_txn_id;

  if abs(v_old_cash - v_new_cash) > 0.009 then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (current_date, 'cash', case when v_direction = 'in' then 'out' else 'in' end,
            v_old_cash, 'Corrected ' || upper(v_txn.service_type) || ' ' || v_txn.transaction_number, 'transaction', p_txn_id);
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (p_transaction_date, 'cash', v_direction, v_new_cash,
            upper(v_txn.service_type) || ' ' || v_txn.transaction_number, 'transaction', p_txn_id);
  end if;

  return jsonb_build_object('id', p_txn_id, 'status', 'success');
end;
$$;

-- ---------- Reverse (audited, journal never deleted) ----------
create or replace function public.reverse_business_txn(p_txn_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_txn record;
  v_cash numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_txn from public.transactions where id = p_txn_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_txn.status <> 'success' then raise exception 'Only successful transactions can be reversed'; end if;

  v_cash := case when v_txn.direction = 'in' then v_txn.amount + v_txn.service_fee else v_txn.amount end;

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
  values (current_date, 'cash', case when v_txn.direction = 'in' then 'out' else 'in' end, v_cash,
          'Reversed ' || upper(v_txn.service_type) || ' ' || v_txn.transaction_number, 'transaction', p_txn_id);

  update public.transactions
  set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(),
      remarks = trim(coalesce(remarks, '') || E'\nReversed: ' || coalesce(p_reason, 'No reason provided.'))
  where id = p_txn_id;

  return jsonb_build_object('id', p_txn_id, 'status', 'reversed');
end;
$$;

-- ---------- Delete (admin soft delete, journal reversed) ----------
create or replace function public.delete_business_txn(p_txn_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_txn record;
  v_cash numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_txn from public.transactions where id = p_txn_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_txn.status in ('reversed', 'deleted') then raise exception 'This transaction is already closed'; end if;

  if v_txn.status = 'success' then
    v_cash := case when v_txn.direction = 'in' then v_txn.amount + v_txn.service_fee else v_txn.amount end;
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (current_date, 'cash', case when v_txn.direction = 'in' then 'out' else 'in' end, v_cash,
            'Deleted ' || upper(v_txn.service_type) || ' ' || v_txn.transaction_number, 'transaction', p_txn_id);
  end if;

  update public.transactions
  set status = 'deleted', deleted_at = now(), deleted_by = auth.uid(),
      remarks = trim(coalesce(remarks, '') || E'\nDeleted: ' || coalesce(p_reason, 'No reason provided.'))
  where id = p_txn_id;

  return jsonb_build_object('id', p_txn_id, 'status', 'deleted');
end;
$$;

-- ---------- Realtime publish (idempotent) ----------
do $$
declare t text;
begin
  foreach t in array array['transactions', 'aeps_banks', 'aeps_portals', 'upi_merchant_qrs']
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
