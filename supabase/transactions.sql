-- Run this in Supabase SQL Editor (idempotent).
-- Required for the AEPS / DMT / UPI Transactions module.
-- Money movements are atomic: a transaction always writes its cash entry.
-- No hard deletes: cancellation only, audited via cancelled_at/cancelled_by.

create sequence if not exists public.transaction_number_seq start 1;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_number text not null unique,
  service_type text not null check (service_type in ('aeps', 'dmt', 'upi')),
  direction text not null check (direction in ('in', 'out')),
  transaction_date date not null default current_date,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  phone text,
  aadhaar_last4 text,
  bank_name text,
  account_last4 text,
  reference text,
  amount numeric(15,2) not null check (amount > 0),
  commission numeric(15,2) not null default 0 check (commission >= 0),
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists transactions_date_idx on public.transactions (transaction_date desc);
create index if not exists transactions_service_idx on public.transactions (service_type);
create index if not exists transactions_status_idx on public.transactions (status);
create unique index if not exists transactions_reference_uq on public.transactions (reference) where reference is not null;

alter table public.transactions enable row level security;

create policy "transactions all" on public.transactions
  for all to authenticated using (true) with check (true);

-- Cash effect helper: dmt (send) = cash in; aeps / upi (cash out) = cash out
create or replace function public.create_txn(
  p_service_type text,
  p_transaction_date date,
  p_customer_id uuid,
  p_customer_name text,
  p_phone text,
  p_aadhaar_last4 text,
  p_bank_name text,
  p_account_last4 text,
  p_reference text,
  p_amount numeric,
  p_commission numeric
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_txn_id uuid;
  v_txn_number text;
  v_direction text;
  v_cash numeric;
  v_service_label text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_service_type not in ('aeps', 'dmt', 'upi') then
    raise exception 'Invalid service type';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_commission is null or p_commission < 0 then raise exception 'Commission cannot be negative'; end if;

  if p_service_type = 'dmt' then
    v_direction := 'in';
    v_service_label := 'DMT';
    if p_reference is null or p_reference = '' then raise exception 'Reference (RRN) is required for DMT'; end if;
  elsif p_service_type = 'aeps' then
    v_direction := 'out';
    v_service_label := 'AEPS';
    if p_aadhaar_last4 is null or p_aadhaar_last4 !~ '^[0-9]{4}$' then
      raise exception 'Aadhaar last 4 digits required for AEPS';
    end if;
  else
    v_direction := 'out';
    v_service_label := 'UPI';
  end if;

  if p_customer_id is not null
     and not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Customer not found';
  end if;

  v_cash := case when v_direction = 'in' then p_amount + p_commission else p_amount end;
  v_txn_number := 'TXN-' || lpad(nextval('public.transaction_number_seq')::text, 4, '0');

  insert into public.transactions (
    transaction_number, service_type, direction, transaction_date, customer_id,
    customer_name, phone, aadhaar_last4, bank_name, account_last4, reference,
    amount, commission, status, created_by
  ) values (
    v_txn_number, p_service_type, v_direction, p_transaction_date, p_customer_id,
    coalesce(p_customer_name, 'Walk-in'), p_phone, p_aadhaar_last4, p_bank_name,
    p_account_last4, nullif(p_reference, ''), p_amount, p_commission, 'completed', auth.uid()
  ) returning id into v_txn_id;

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
  values (p_transaction_date, 'cash', v_direction, v_cash,
          v_service_label || ' ' || v_txn_number ||
            case when p_commission > 0 then ' (commission ' || p_commission || ')' else '' end,
          'transaction', v_txn_id);

  return (
    select jsonb_build_object(
      'id', id, 'transaction_number', transaction_number, 'service_type', service_type,
      'direction', direction, 'amount', amount, 'commission', commission,
      'cash', v_cash, 'status', status, 'transaction_date', transaction_date
    )
    from public.transactions where id = v_txn_id
  );
end;
$$;

-- Audited cancellation: reverses the cash entry, never deletes
create or replace function public.cancel_txn(p_txn_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_txn record;
  v_cash numeric;
  v_reverse text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_txn from public.transactions where id = p_txn_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_txn.status = 'cancelled' then raise exception 'Transaction already cancelled'; end if;

  v_cash := case when v_txn.direction = 'in' then v_txn.amount + v_txn.commission else v_txn.amount end;
  v_reverse := case when v_txn.direction = 'in' then 'out' else 'in' end;

  update public.transactions
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
  where id = p_txn_id;

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
  values (current_date, 'cash', v_reverse, v_cash,
          'Cancelled ' || upper(v_txn.service_type) || ' ' || v_txn.transaction_number,
          'transaction', p_txn_id);

  return jsonb_build_object('id', p_txn_id, 'status', 'cancelled');
end;
$$;

-- Publish to realtime (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and c.relname = 'transactions'
      and n.nspname = 'public'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;
end $$;
