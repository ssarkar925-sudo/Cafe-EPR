-- Run this in Supabase SQL Editor (idempotent).
-- Brand and Unit reference lists for the Catalog module. These are master-data
-- records used to tag catalogue items; they are never referenced by invoices,
-- so they can be safely deleted (hard) or disabled.

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.brands enable row level security;
alter table public.units enable row level security;

drop policy if exists "brands all" on public.brands;
create policy "brands all" on public.brands for all to authenticated using (true) with check (true);

drop policy if exists "units all" on public.units;
create policy "units all" on public.units for all to authenticated using (true) with check (true);