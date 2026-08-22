-- Run this in Supabase SQL Editor (optional / idempotent).
-- 1. Ensure transactions table supports instrument_id for exact payment account linkage
alter table public.transactions add column if not exists instrument_id uuid references public.payment_instruments(id) on delete set null;

-- 2. Backfill missing bank outflow cash_entries for DMT transactions where paid_from = 'bank' or remarks contain [Account: ...]
insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
select
  t.transaction_date,
  'bank',
  'out',
  t.amount,
  'DMT ' || t.transaction_number || ' transfer sent from ' || coalesce(i.name, 'Bank Account'),
  'transaction',
  t.id,
  coalesce(t.instrument_id, i.id)
from public.transactions t
left join public.payment_instruments i on (
  t.remarks like '%[Account: ' || i.name || ']%'
  or (i.type in ('bank', 'debit_card') and i.is_active = true)
)
where t.service_type = 'dmt'
  and t.status = 'success'
  and coalesce(t.paid_from, 'bank') = 'bank'
  and not exists (
    select 1 from public.cash_entries ce
    where ce.ref_type = 'transaction'
      and ce.ref_id = t.id
      and ce.direction = 'out'
  );
