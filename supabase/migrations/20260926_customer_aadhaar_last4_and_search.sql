-- Migration: Add aadhaar_last4 to customers table and optimize lookup indexes
-- CafeERP: AEPS Universal Customer Search optimization

alter table public.customers
  add column if not exists aadhaar_last4 text;

create index if not exists customers_aadhaar_last4_idx
  on public.customers (aadhaar_last4)
  where aadhaar_last4 is not null;

create index if not exists transactions_aadhaar_last4_customer_idx
  on public.transactions (aadhaar_last4, customer_id)
  where aadhaar_last4 is not null and customer_id is not null;
