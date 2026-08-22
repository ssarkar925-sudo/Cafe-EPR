-- Run this in Supabase SQL Editor (optional / idempotent).
-- Fixes foreign key constraint on public.transactions so that bank_id does not conflict with payment_instruments.

alter table public.transactions drop constraint if exists transactions_bank_id_fkey;
alter table public.transactions add column if not exists instrument_id uuid references public.payment_instruments(id) on delete set null;
