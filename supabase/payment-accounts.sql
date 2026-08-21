-- Run this in Supabase SQL Editor (idempotent).
-- Payment Accounts: adds a flexible detail payload (bank name, account reference,
-- IFSC, UPI ID, linked info, notes) and an opening balance for each till account.
-- Existing records are preserved; nothing is deleted.

alter table public.payment_instruments add column if not exists details jsonb not null default '{}';
alter table public.payment_instruments add column if not exists opening_balance numeric(15,2) not null default 0;
