-- Idempotent: Settings → Payment Methods, Business Setup support.
-- Run against the live DB (see apply script). Mirrored into schema.sql.

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  method text not null unique,
  label text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.payment_methods enable row level security;
drop policy if exists "payment_methods all" on public.payment_methods;
create policy "payment_methods all" on public.payment_methods for all to authenticated using (true) with check (true);

insert into public.payment_methods (method, label, sort_order)
values
  ('cash', 'Cash', 1),
  ('card', 'Card', 2),
  ('bank', 'Bank', 3),
  ('upi', 'UPI', 4),
  ('wallet', 'Wallet', 5),
  ('debit_card', 'Debit Card', 6),
  ('credit_card', 'Credit Card', 7)
on conflict (method) do update set label = excluded.label, sort_order = excluded.sort_order;

-- Customers: optional type badge used on the customer profile page.
alter table public.customers add column if not exists customer_type text not null default 'retail';

-- Settings: GST registration + default tax rate (printed on receipts when set).
alter table public.settings add column if not exists gstin text;
alter table public.settings add column if not exists tax_rate numeric(15,2) not null default 0;
