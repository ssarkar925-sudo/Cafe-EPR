create extension if not exists pgcrypto;

-- Auth: one profile per auth user, auto-created on signup
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'staff' check (role in ('admin', 'manager', 'staff')),
  is_active boolean not null default true,
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
  sale_price numeric(15,2) not null default 0,
  cost_price numeric(15,2) not null default 0,
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

-- POS / Quick Sale additions
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  method text not null check (method in ('cash', 'upi', 'card')),
  amount numeric(15,2) not null default 0,
  received_at timestamptz not null default now()
);

create sequence if not exists public.invoice_number_seq;
create index if not exists idx_payments_invoice on public.payments (invoice_id);

alter table public.payments enable row level security;
create policy "payments all" on public.payments for all to authenticated using (true) with check (true);

-- Atomic sale: invoice + items + stock deduction + payments + customer balance in ONE transaction
create or replace function public.create_sale(
  p_customer_id uuid,
  p_invoice_date date,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_payments jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_invoice_number text;
  v_paid numeric := 0;
  v_due numeric;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_rate numeric;
  v_amount numeric;
  v_stock numeric;
  v_payment jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_invoice_number := 'INV-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');

  insert into public.invoices (invoice_number, customer_id, invoice_date, subtotal, discount, total, paid, due, status)
  values (v_invoice_number, p_customer_id, p_invoice_date, p_subtotal, p_discount, p_total, 0, 0, 'unpaid')
  returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := coalesce((v_item->>'qty')::numeric, 1);
    v_rate := coalesce((v_item->>'rate')::numeric, 0);
    v_amount := coalesce((v_item->>'amount')::numeric, 0);

    insert into public.invoice_items (invoice_id, product_id, service_id, description, qty, rate, amount)
    values (v_invoice_id, v_product_id, (v_item->>'service_id')::uuid, v_item->>'description', v_qty, v_rate, v_amount);

    if v_product_id is not null then
      select stock_qty into v_stock from public.products where id = v_product_id for update;
      if v_stock is null then
        raise exception 'Product not found';
      end if;
      if v_stock < v_qty then
        raise exception 'Insufficient stock (have %, need %)', v_stock, v_qty;
      end if;
      update public.products set stock_qty = stock_qty - v_qty, updated_at = now() where id = v_product_id;
    end if;
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    v_paid := v_paid + coalesce((v_payment->>'amount')::numeric, 0);
    insert into public.payments (invoice_id, method, amount)
    values (v_invoice_id, v_payment->>'method', coalesce((v_payment->>'amount')::numeric, 0));
  end loop;

  if v_paid > p_total then
    raise exception 'Paid amount exceeds total';
  end if;

  v_due := p_total - v_paid;

  update public.invoices
  set paid = v_paid,
      due = v_due,
      status = case when v_due = 0 then 'paid' else 'partial' end
  where id = v_invoice_id;

  if p_customer_id is not null and v_due > 0 then
    update public.customers
    set balance = balance + v_due, updated_at = now()
    where id = p_customer_id;
  end if;

  return (
    select jsonb_build_object(
      'id', id,
      'invoice_number', invoice_number,
      'customer_id', customer_id,
      'total', total,
      'paid', paid,
      'due', due,
      'status', status,
      'invoice_date', invoice_date
    )
    from public.invoices
    where id = v_invoice_id
  );
end;
$$;

grant usage, select on sequence public.invoice_number_seq to authenticated;

-- Invoices module
alter table public.invoices add column if not exists returned_at timestamptz;

create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_method text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invoice record;
  v_due numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_method not in ('cash', 'upi', 'card') then raise exception 'Invalid payment method'; end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'cancelled' then raise exception 'Cannot pay a returned invoice'; end if;

  v_due := v_invoice.total - v_invoice.paid;
  if p_amount > v_due then raise exception 'Payment exceeds outstanding due'; end if;

  insert into public.payments (invoice_id, method, amount)
  values (p_invoice_id, p_method, p_amount);

  update public.invoices
  set paid = paid + p_amount,
      due = due - p_amount,
      status = case when due - p_amount <= 0 then 'paid' else 'partial' end
  where id = p_invoice_id;

  if v_invoice.customer_id is not null then
    update public.customers
    set balance = balance - p_amount, updated_at = now()
    where id = v_invoice.customer_id;
  end if;

  return (
    select jsonb_build_object('id', id, 'invoice_number', invoice_number,
      'total', total, 'paid', paid, 'due', due, 'status', status)
    from public.invoices where id = p_invoice_id
  );
end;
$$;

create or replace function public.return_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invoice record;
  v_item record;
  v_due numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'cancelled' then raise exception 'Invoice already returned'; end if;

  v_due := v_invoice.total - v_invoice.paid;

  for v_item in
    select product_id, qty from public.invoice_items
    where invoice_id = p_invoice_id and product_id is not null
  loop
    update public.products
    set stock_qty = stock_qty + v_item.qty, updated_at = now()
    where id = v_item.product_id;
  end loop;

  if v_invoice.customer_id is not null and v_due > 0 then
    update public.customers
    set balance = balance - v_due, updated_at = now()
    where id = v_invoice.customer_id;
  end if;

  update public.invoices
  set status = 'cancelled',
      paid = 0,
      due = 0,
      returned_at = now()
  where id = p_invoice_id;

  return (
    select jsonb_build_object('id', id, 'invoice_number', invoice_number,
      'status', status, 'returned_at', returned_at)
    from public.invoices where id = p_invoice_id
  );
end;
$$;

-- Run this in Supabase SQL Editor (idempotent).
-- Required for the Finance module: cash book, expenses, customer ledger.

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null default 'general',
  amount numeric(15,2) not null default 0 check (amount >= 0),
  note text,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create table if not exists public.cash_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  method text not null check (method in ('cash', 'upi', 'card')),
  direction text not null check (direction in ('in', 'out')),
  amount numeric(15,2) not null default 0 check (amount >= 0),
  description text,
  ref_type text,
  ref_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  entry_date date not null default current_date,
  type text not null check (type in ('invoice', 'payment', 'return', 'opening')),
  description text,
  debit numeric(15,2) not null default 0,
  credit numeric(15,2) not null default 0,
  balance_after numeric(15,2) not null default 0,
  ref_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_expenses_date on public.expenses (expense_date);
create index if not exists idx_cash_entries_date on public.cash_entries (entry_date);
create index if not exists idx_customer_ledger_customer on public.customer_ledger (customer_id);

alter table public.expenses enable row level security;
alter table public.cash_entries enable row level security;
alter table public.customer_ledger enable row level security;

create policy "expenses all" on public.expenses for all to authenticated using (true) with check (true);
create policy "cash_entries all" on public.cash_entries for all to authenticated using (true) with check (true);
create policy "customer_ledger all" on public.customer_ledger for all to authenticated using (true) with check (true);

-- Sale now writes cash entries + customer ledger atomically
create or replace function public.create_sale(
  p_customer_id uuid,
  p_invoice_date date,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_payments jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_invoice_number text;
  v_paid numeric := 0;
  v_due numeric;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_rate numeric;
  v_amount numeric;
  v_stock numeric;
  v_payment jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_invoice_number := 'INV-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');

  insert into public.invoices (invoice_number, customer_id, invoice_date, subtotal, discount, total, paid, due, status)
  values (v_invoice_number, p_customer_id, p_invoice_date, p_subtotal, p_discount, p_total, 0, 0, 'unpaid')
  returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := coalesce((v_item->>'qty')::numeric, 1);
    v_rate := coalesce((v_item->>'rate')::numeric, 0);
    v_amount := coalesce((v_item->>'amount')::numeric, 0);

    insert into public.invoice_items (invoice_id, product_id, service_id, description, qty, rate, amount)
    values (v_invoice_id, v_product_id, (v_item->>'service_id')::uuid, v_item->>'description', v_qty, v_rate, v_amount);

    if v_product_id is not null then
      select stock_qty into v_stock from public.products where id = v_product_id for update;
      if v_stock is null then
        raise exception 'Product not found';
      end if;
      if v_stock < v_qty then
        raise exception 'Insufficient stock (have %, need %)', v_stock, v_qty;
      end if;
      update public.products set stock_qty = stock_qty - v_qty, updated_at = now() where id = v_product_id;
    end if;
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    v_paid := v_paid + coalesce((v_payment->>'amount')::numeric, 0);
    insert into public.payments (invoice_id, method, amount)
    values (v_invoice_id, v_payment->>'method', coalesce((v_payment->>'amount')::numeric, 0));

    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (p_invoice_date, v_payment->>'method', 'in', coalesce((v_payment->>'amount')::numeric, 0), 'Sale ' || v_invoice_number, 'invoice', v_invoice_id);
  end loop;

  if v_paid > p_total then
    raise exception 'Paid amount exceeds total';
  end if;

  v_due := p_total - v_paid;

  update public.invoices
  set paid = v_paid,
      due = v_due,
      status = case when v_due = 0 then 'paid' else 'partial' end
  where id = v_invoice_id;

  if p_customer_id is not null and v_due > 0 then
    update public.customers
    set balance = balance + v_due, updated_at = now()
    where id = p_customer_id;

    insert into public.customer_ledger (customer_id, entry_date, type, description, debit, balance_after, ref_id)
    values (p_customer_id, p_invoice_date, 'invoice', 'Invoice ' || v_invoice_number, v_due,
            (select balance from public.customers where id = p_customer_id), v_invoice_id);
  end if;

  return (
    select jsonb_build_object(
      'id', id,
      'invoice_number', invoice_number,
      'customer_id', customer_id,
      'total', total,
      'paid', paid,
      'due', due,
      'status', status,
      'invoice_date', invoice_date
    )
    from public.invoices
    where id = v_invoice_id
  );
end;
$$;

create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_method text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invoice record;
  v_due numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_method not in ('cash', 'upi', 'card') then raise exception 'Invalid payment method'; end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'cancelled' then raise exception 'Cannot pay a returned invoice'; end if;

  v_due := v_invoice.total - v_invoice.paid;
  if p_amount > v_due then raise exception 'Payment exceeds outstanding due'; end if;

  insert into public.payments (invoice_id, method, amount)
  values (p_invoice_id, p_method, p_amount);

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
  values (current_date, p_method, 'in', p_amount, 'Payment ' || v_invoice.invoice_number, 'invoice', p_invoice_id);

  update public.invoices
  set paid = paid + p_amount,
      due = due - p_amount,
      status = case when due - p_amount <= 0 then 'paid' else 'partial' end
  where id = p_invoice_id;

  if v_invoice.customer_id is not null then
    update public.customers
    set balance = balance - p_amount, updated_at = now()
    where id = v_invoice.customer_id;

    insert into public.customer_ledger (customer_id, entry_date, type, description, credit, balance_after, ref_id)
    values (v_invoice.customer_id, current_date, 'payment', 'Payment on ' || v_invoice.invoice_number, p_amount,
            (select balance from public.customers where id = v_invoice.customer_id), p_invoice_id);
  end if;

  return (
    select jsonb_build_object('id', id, 'invoice_number', invoice_number,
      'total', total, 'paid', paid, 'due', due, 'status', status)
    from public.invoices where id = p_invoice_id
  );
end;
$$;

create or replace function public.return_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invoice record;
  v_item record;
  v_due numeric;
  v_refund numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'cancelled' then raise exception 'Invoice already returned'; end if;

  v_due := v_invoice.total - v_invoice.paid;
  v_refund := v_invoice.paid;

  for v_item in
    select product_id, qty from public.invoice_items
    where invoice_id = p_invoice_id and product_id is not null
  loop
    update public.products
    set stock_qty = stock_qty + v_item.qty, updated_at = now()
    where id = v_item.product_id;
  end loop;

  if v_refund > 0 then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (current_date, 'cash', 'out', v_refund, 'Refund ' || v_invoice.invoice_number, 'invoice', p_invoice_id);
  end if;

  if v_invoice.customer_id is not null and v_due > 0 then
    update public.customers
    set balance = balance - v_due, updated_at = now()
    where id = v_invoice.customer_id;

    insert into public.customer_ledger (customer_id, entry_date, type, description, credit, balance_after, ref_id)
    values (v_invoice.customer_id, current_date, 'return', 'Return of ' || v_invoice.invoice_number, v_due,
            (select balance from public.customers where id = v_invoice.customer_id), p_invoice_id);
  end if;

  update public.invoices
  set status = 'cancelled',
      paid = 0,
      due = 0,
      returned_at = now()
  where id = p_invoice_id;

  return (
    select jsonb_build_object('id', id, 'invoice_number', invoice_number,
      'status', status, 'returned_at', returned_at)
    from public.invoices where id = p_invoice_id
  );
end;
$$;

-- Add an expense + cash book entry atomically
create or replace function public.add_expense(
  p_expense_date date,
  p_category text,
  p_amount numeric,
  p_note text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_expense_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_category is null or p_category = '' then raise exception 'Category is required'; end if;

  insert into public.expenses (expense_date, category, amount, note, created_by)
  values (p_expense_date, p_category, p_amount, p_note, auth.uid())
  returning id into v_expense_id;

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
  values (p_expense_date, 'cash', 'out', p_amount, 'Expense: ' || p_category, 'expense', v_expense_id);

  return jsonb_build_object('id', v_expense_id);
end;
$$;

-- Cancel an expense (audited, no delete): reverses the cash entry
create or replace function public.cancel_expense(p_expense_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_expense record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_expense from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if v_expense.status = 'cancelled' then raise exception 'Expense already cancelled'; end if;

  update public.expenses
  set status = 'cancelled', cancelled_at = now()
  where id = p_expense_id;

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
  values (current_date, 'cash', 'in', v_expense.amount, 'Expense cancelled: ' || v_expense.category, 'expense', p_expense_id);

  return jsonb_build_object('id', p_expense_id, 'status', 'cancelled');
end;
$$;


-- Run this in Supabase SQL Editor (idempotent).
-- Required for the Settings module (shop name, logo, receipt details).

create table if not exists public.settings (
  id smallint primary key default 1 check (id = 1),
  shop_name text not null default 'SCC OMM Cafe',
  phone text,
  address text,
  receipt_footer text,
  currency_symbol text not null default '₹',
  logo_url text,
  updated_at timestamptz default now()
);

insert into public.settings (id, shop_name) values (1, 'SCC OMM Cafe')
on conflict (id) do nothing;

alter table public.settings enable row level security;
create policy "settings all" on public.settings for all to authenticated using (true) with check (true);

-- Storage bucket for the shop logo
insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy "logos read" on storage.objects for select using (bucket_id = 'logos');
create policy "logos insert" on storage.objects for insert to authenticated with check (bucket_id = 'logos');
create policy "logos update" on storage.objects for update to authenticated using (bucket_id = 'logos');
create policy "logos delete" on storage.objects for delete to authenticated using (bucket_id = 'logos');

