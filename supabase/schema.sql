create extension if not exists pgcrypto;

-- Auth: one profile per auth user, auto-created on signup
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'staff' check (role in ('admin', 'manager', 'staff')),
  created_at timestamptz not null default now()
);

-- Catalog
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  name text not null,
  code text unique,
  description text,
  unit text not null default 'pc',
  sale_price numeric(15,2) not null default 0,
  cost_price numeric(15,2) not null default 0,
  stock_qty numeric(15,3) not null default 0,
  reorder_level numeric(15,3) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  name text not null,
  description text,
  price numeric(15,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- CRM
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  phone text,
  email text,
  address text,
  opening_balance numeric(15,2) not null default 0,
  balance numeric(15,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Billing
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  customer_id uuid references public.customers (id) on delete set null,
  invoice_date date not null default current_date,
  subtotal numeric(15,2) not null default 0,
  discount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0,
  paid numeric(15,2) not null default 0,
  due numeric(15,2) not null default 0,
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  description text,
  qty numeric(15,3) not null default 1,
  rate numeric(15,2) not null default 0,
  amount numeric(15,2) not null default 0
);

-- Indexes
create index if not exists idx_products_category on public.products (category_id);
create index if not exists idx_invoices_customer on public.invoices (customer_id);
create index if not exists idx_invoices_date on public.invoices (invoice_date);
create index if not exists idx_invoice_items_invoice on public.invoice_items (invoice_id);

-- Row level security: any authenticated user can work with shop data
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.services enable row level security;
alter table public.customers enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

create policy "profiles select" on public.profiles for select to authenticated using (true);
create policy "profiles insert" on public.profiles for insert to authenticated with check (true);
create policy "profiles update" on public.profiles for update to authenticated using (true) with check (true);

create policy "categories all" on public.categories for all to authenticated using (true) with check (true);
create policy "products all" on public.products for all to authenticated using (true) with check (true);
create policy "services all" on public.services for all to authenticated using (true) with check (true);
create policy "customers all" on public.customers for all to authenticated using (true) with check (true);
create policy "invoices all" on public.invoices for all to authenticated using (true) with check (true);
create policy "invoice_items all" on public.invoice_items for all to authenticated using (true) with check (true);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Make yourself admin: run once after creating your account
-- update public.profiles set role = 'admin' where email = 'your-login-email@example.com';
