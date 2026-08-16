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

-- Atomic sale: invoice + items + stock deduction + payments + customer balance in ONE transaction.
-- Supports collecting a customer's previous due (non-revenue cash-in) and applying a customer's
-- advance (prepaid credit) against the bill.
create or replace function public.create_sale(
  p_customer_id uuid,
  p_invoice_date date,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_payments jsonb,
  p_items jsonb,
  p_previous_due numeric default 0,
  p_previous_due_method text default 'cash',
  p_advance_used numeric default 0
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
  v_cust_balance numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_previous_due < 0 or p_advance_used < 0 then
    raise exception 'Invalid due/advance amounts';
  end if;
  if p_previous_due_method not in ('cash', 'upi', 'card') then
    raise exception 'Invalid due collection method';
  end if;
  if (p_previous_due > 0 or p_advance_used > 0) and p_customer_id is null then
    raise exception 'Customer is required for due/advance adjustments';
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

  if v_paid + p_advance_used > p_total then
    raise exception 'Paid amount exceeds total';
  end if;

  v_due := p_total - v_paid - p_advance_used;

  update public.invoices
  set paid = v_paid + p_advance_used,
      due = v_due,
      status = case when v_due = 0 then 'paid' else 'partial' end
  where id = v_invoice_id;

  if p_customer_id is not null then
    select balance into v_cust_balance from public.customers where id = p_customer_id for update;
    if v_cust_balance is null then
      raise exception 'Customer not found';
    end if;

    if p_previous_due > 0 then
      if v_cust_balance < p_previous_due then
        raise exception 'Customer due is only %, cannot collect %', v_cust_balance, p_previous_due;
      end if;
      v_cust_balance := v_cust_balance - p_previous_due;
      update public.customers set balance = v_cust_balance, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, credit, balance_after, ref_id)
      values (p_customer_id, p_invoice_date, 'payment', 'Previous due collected with ' || v_invoice_number, p_previous_due, v_cust_balance, v_invoice_id);
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
      values (p_invoice_date, p_previous_due_method, 'in', p_previous_due, 'Previous due ' || v_invoice_number, 'invoice', v_invoice_id);
    end if;

    if p_advance_used > 0 then
      if v_cust_balance > -p_advance_used then
        raise exception 'Customer advance is only %, cannot apply %', abs(v_cust_balance), p_advance_used;
      end if;
      v_cust_balance := v_cust_balance + p_advance_used;
      update public.customers set balance = v_cust_balance, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, debit, balance_after, ref_id)
      values (p_customer_id, p_invoice_date, 'advance', 'Advance applied to ' || v_invoice_number, p_advance_used, v_cust_balance, v_invoice_id);
    end if;

    if v_due > 0 then
      v_cust_balance := v_cust_balance + v_due;
      update public.customers set balance = v_cust_balance, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, debit, balance_after, ref_id)
      values (p_customer_id, p_invoice_date, 'invoice', 'Invoice ' || v_invoice_number, v_due, v_cust_balance, v_invoice_id);
    end if;
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
      'invoice_date', invoice_date,
      'previous_due', p_previous_due,
      'advance_used', p_advance_used
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

-- Sale now writes cash entries + customer ledger atomically.
-- Supports collecting a customer's previous due (non-revenue cash-in) and applying a customer's
-- advance (prepaid credit) against the bill.
create or replace function public.create_sale(
  p_customer_id uuid,
  p_invoice_date date,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_payments jsonb,
  p_items jsonb,
  p_previous_due numeric default 0,
  p_previous_due_method text default 'cash',
  p_advance_used numeric default 0
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
  v_cust_balance numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_previous_due < 0 or p_advance_used < 0 then
    raise exception 'Invalid due/advance amounts';
  end if;
  if p_previous_due_method not in ('cash', 'upi', 'card') then
    raise exception 'Invalid due collection method';
  end if;
  if (p_previous_due > 0 or p_advance_used > 0) and p_customer_id is null then
    raise exception 'Customer is required for due/advance adjustments';
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

  if v_paid + p_advance_used > p_total then
    raise exception 'Paid amount exceeds total';
  end if;

  v_due := p_total - v_paid - p_advance_used;

  update public.invoices
  set paid = v_paid + p_advance_used,
      due = v_due,
      status = case when v_due = 0 then 'paid' else 'partial' end
  where id = v_invoice_id;

  if p_customer_id is not null then
    select balance into v_cust_balance from public.customers where id = p_customer_id for update;
    if v_cust_balance is null then
      raise exception 'Customer not found';
    end if;

    if p_previous_due > 0 then
      if v_cust_balance < p_previous_due then
        raise exception 'Customer due is only %, cannot collect %', v_cust_balance, p_previous_due;
      end if;
      v_cust_balance := v_cust_balance - p_previous_due;
      update public.customers set balance = v_cust_balance, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, credit, balance_after, ref_id)
      values (p_customer_id, p_invoice_date, 'payment', 'Previous due collected with ' || v_invoice_number, p_previous_due, v_cust_balance, v_invoice_id);
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
      values (p_invoice_date, p_previous_due_method, 'in', p_previous_due, 'Previous due ' || v_invoice_number, 'invoice', v_invoice_id);
    end if;

    if p_advance_used > 0 then
      if v_cust_balance > -p_advance_used then
        raise exception 'Customer advance is only %, cannot apply %', abs(v_cust_balance), p_advance_used;
      end if;
      v_cust_balance := v_cust_balance + p_advance_used;
      update public.customers set balance = v_cust_balance, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, debit, balance_after, ref_id)
      values (p_customer_id, p_invoice_date, 'advance', 'Advance applied to ' || v_invoice_number, p_advance_used, v_cust_balance, v_invoice_id);
    end if;

    if v_due > 0 then
      v_cust_balance := v_cust_balance + v_due;
      update public.customers set balance = v_cust_balance, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, debit, balance_after, ref_id)
      values (p_customer_id, p_invoice_date, 'invoice', 'Invoice ' || v_invoice_number, v_due, v_cust_balance, v_invoice_id);
    end if;
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
      'invoice_date', invoice_date,
      'previous_due', p_previous_due,
      'advance_used', p_advance_used
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


-- ============================================================================
-- Returns & partial returns (see returns.sql)
-- ============================================================================

-- Returns & partial returns (audited, no hard deletes)
-- Adds: returns, return_items tables + process_return RPC
-- Supports full return, partial (line-level) return, and partial refund payment.

create sequence if not exists public.return_number_seq start 1;

create table if not exists public.returns (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  return_date date not null default current_date,
  reason text,
  subtotal numeric(15,2) not null default 0,
  refund numeric(15,2) not null default 0,
  refund_method text check (refund_method in ('cash','upi','card')),
  status text not null default 'completed' check (status in ('completed','cancelled')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null
);

create table if not exists public.return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns (id) on delete cascade,
  invoice_item_id uuid not null references public.invoice_items (id),
  product_id uuid references public.products (id) on delete set null,
  service_id uuid references public.services (id) on delete set null,
  qty numeric(15,3) not null,
  rate numeric(15,2) not null,
  amount numeric(15,2) not null
);

alter table public.invoices add column if not exists returned numeric(15,2) not null default 0;
alter table public.invoices add column if not exists refunded numeric(15,2) not null default 0;
alter table public.invoice_items add column if not exists returned_qty numeric(15,3) not null default 0;

create index if not exists returns_invoice_idx on public.returns (invoice_id);
create index if not exists returns_return_date_idx on public.returns (return_date);
create index if not exists return_items_return_idx on public.return_items (return_id);

alter table public.returns enable row level security;
alter table public.return_items enable row level security;
create policy "returns all" on public.returns for all to authenticated using (true) with check (true);
create policy "return_items all" on public.return_items for all to authenticated using (true) with check (true);

-- Process a return atomically: restock products, write return + items,
-- post refund cash entry, adjust customer balance/ledger, update invoice.
create or replace function public.process_return(
  p_invoice_id uuid,
  p_items jsonb,
  p_refund numeric,
  p_refund_method text default 'cash',
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invoice record;
  v_item record;
  v_ri jsonb;
  v_qty numeric;
  v_returned numeric := 0;
  v_old_due numeric;
  v_new_due numeric;
  v_delta numeric;
  v_return_id uuid;
  v_return_number text;
  v_full boolean := true;
  v_bal numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'cancelled' then raise exception 'Invoice already returned'; end if;

  v_old_due := v_invoice.total - v_invoice.paid;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No items to return';
  end if;

  for v_ri in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_ri->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Invalid return quantity'; end if;

    select * into v_item from public.invoice_items
    where id = (v_ri->>'invoice_item_id')::uuid and invoice_id = p_invoice_id
    for update;
    if not found then raise exception 'Invoice item not found'; end if;

    if v_qty > (v_item.qty - coalesce(v_item.returned_qty, 0)) then
      raise exception 'Cannot return more than quantity sold';
    end if;

    v_returned := v_returned + round(v_qty * v_item.rate, 2);
  end loop;

  if v_returned <= 0 then raise exception 'Return value must be positive'; end if;
  if p_refund < 0 then raise exception 'Invalid refund amount'; end if;
  if p_refund > least(v_invoice.paid, v_returned) then
    raise exception 'Refund cannot exceed the amount collected on returned items';
  end if;
  if p_refund > 0 and p_refund_method not in ('cash','upi','card') then
    raise exception 'Invalid refund method';
  end if;

  v_return_number := 'RTN-' || lpad(nextval('public.return_number_seq')::text, 4, '0');

  insert into public.returns (return_number, invoice_id, reason, subtotal, refund, refund_method, status, created_by)
  values (v_return_number, p_invoice_id, nullif(p_reason, ''), v_returned, p_refund,
          case when p_refund > 0 then p_refund_method end, 'completed', auth.uid())
  returning id into v_return_id;

  for v_ri in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_ri->>'qty')::numeric;
    select * into v_item from public.invoice_items where id = (v_ri->>'invoice_item_id')::uuid for update;

    insert into public.return_items (return_id, invoice_item_id, product_id, service_id, qty, rate, amount)
    values (v_return_id, v_item.id, v_item.product_id, v_item.service_id, v_qty, v_item.rate, round(v_qty * v_item.rate, 2));

    update public.invoice_items
    set returned_qty = returned_qty + v_qty
    where id = v_item.id;

    if v_item.product_id is not null then
      update public.products set stock_qty = stock_qty + v_qty, updated_at = now()
      where id = v_item.product_id;
    end if;
  end loop;

  if p_refund > 0 then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (current_date, p_refund_method, 'out', p_refund, 'Refund ' || v_invoice.invoice_number || ' (' || v_return_number || ')', 'return', v_return_id);
  end if;

  select bool_and(coalesce(i.returned_qty, 0) >= i.qty) into v_full
  from public.invoice_items i where i.invoice_id = p_invoice_id;

  v_new_due := greatest(0, v_invoice.total - (coalesce(v_invoice.returned, 0) + v_returned) - (v_invoice.paid - p_refund));
  v_delta := v_old_due - v_new_due;

  if v_invoice.customer_id is not null and v_delta > 0 then
    update public.customers set balance = balance - v_delta, updated_at = now()
    where id = v_invoice.customer_id;
    select balance into v_bal from public.customers where id = v_invoice.customer_id;
    insert into public.customer_ledger (customer_id, entry_date, type, description, credit, balance_after, ref_id)
    values (v_invoice.customer_id, current_date, 'return', 'Return ' || v_return_number || ' (' || v_invoice.invoice_number || ')', v_delta, v_bal, v_return_id);
  end if;

  update public.invoices
  set returned = coalesce(returned, 0) + v_returned,
      refunded = coalesce(refunded, 0) + p_refund,
      paid = greatest(0, paid - p_refund),
      due = v_new_due,
      status = case when v_full then 'cancelled' else status end,
      returned_at = case when v_full then now() else returned_at end
  where id = p_invoice_id;

  return jsonb_build_object(
    'ok', true,
    'return_id', v_return_id,
    'return_number', v_return_number,
    'returned', v_returned,
    'refund', p_refund,
    'full', v_full,
    'paid', v_invoice.paid - p_refund,
    'due', v_new_due,
    'status', case when v_full then 'cancelled' else v_invoice.status end
  );
end;
$$;


-- ============================================================
-- P&L
-- ============================================================
-- Run this in Supabase SQL Editor (idempotent).
-- Profit & Loss calculation for the Finance module and Dashboard.
-- Computes revenue, COGS, gross profit, commission income, expenses and net profit
-- for a date range, plus monthly trend, expense-by-category and top products.

create or replace function public.get_pnl(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revenue numeric(15,2) := 0;
  v_returns numeric(15,2) := 0;
  v_cogs numeric(15,2) := 0;
  v_commission numeric(15,2) := 0;
  v_expenses numeric(15,2) := 0;
  v_invoices int := 0;
  v_net_revenue numeric(15,2);
  v_gross numeric(15,2);
  v_net numeric(15,2);
  v_monthly jsonb;
  v_categories jsonb;
  v_top jsonb;
begin
  -- Revenue: non-cancelled invoices in range
  select coalesce(sum(total), 0), count(*)::int
    into v_revenue, v_invoices
    from public.invoices
    where status <> 'cancelled' and invoice_date between p_from and p_to;

-- Returns / refunds in range. Fully-returned invoices (status = 'cancelled') are already
  -- excluded from revenue, so only returns on still-active invoices reduce revenue here,
  -- otherwise a full return would be double counted. Uses the returned subtotal (goods value).
  select coalesce(sum(r.subtotal), 0) into v_returns
    from public.returns r
    join public.invoices i on i.id = r.invoice_id
    where r.status = 'completed' and i.status <> 'cancelled'
      and r.return_date between p_from and p_to;

  -- COGS: sold qty (minus returned) x current cost price (products/services)
  select coalesce(sum((ii.qty - coalesce(ii.returned_qty, 0)) * coalesce(p.cost_price, s.cost_price, 0)), 0)
    into v_cogs
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    left join public.products p on p.id = ii.product_id
    left join public.services s on s.id = ii.service_id
    where i.status <> 'cancelled' and i.invoice_date between p_from and p_to;

  -- Commission income: successful AEPS/DMT/UPI transactions in range
  select coalesce(sum(commission + service_fee), 0) into v_commission
    from public.transactions
    where status = 'success' and transaction_date between p_from and p_to;

  -- Active expenses in range
  select coalesce(sum(amount), 0) into v_expenses
    from public.expenses
    where status = 'active' and expense_date between p_from and p_to;

  v_net_revenue := v_revenue - v_returns;
  v_gross := v_net_revenue - v_cogs;
  v_net := v_gross + v_commission - v_expenses;

  -- Monthly trend within range
  select coalesce(jsonb_agg(to_jsonb(m) order by m.month), '[]'::jsonb) into v_monthly
  from (
    select to_char(d, 'YYYY-MM') as month,
      coalesce(sum(rev), 0) as revenue,
      coalesce(sum(cogs), 0) as cogs,
      coalesce(sum(exp), 0) as expenses,
      coalesce(sum(com), 0) as commission,
      coalesce(sum(rev - cogs + com - exp), 0) as net
    from (
      select i.invoice_date as d, i.total as rev, 0::numeric as cogs, 0::numeric as exp, 0::numeric as com
      from public.invoices i
      where i.status <> 'cancelled' and i.invoice_date between p_from and p_to
      union all
      select i.invoice_date, 0, (it.qty - coalesce(it.returned_qty, 0)) * coalesce(p.cost_price, s.cost_price, 0), 0, 0
      from public.invoice_items it
      join public.invoices i on i.id = it.invoice_id
      left join public.products p on p.id = it.product_id
      left join public.services s on s.id = it.service_id
      where i.status <> 'cancelled' and i.invoice_date between p_from and p_to
union all
      select expense_date, 0, 0, amount, 0
      from public.expenses
      where status = 'active' and expense_date between p_from and p_to
      union all
      select r.return_date, -r.subtotal, 0, 0, 0
      from public.returns r
      join public.invoices i on i.id = r.invoice_id
      where r.status = 'completed' and i.status <> 'cancelled'
        and r.return_date between p_from and p_to
      union all
      select transaction_date, 0, 0, 0, commission + service_fee
      from public.transactions
      where status = 'success' and transaction_date between p_from and p_to
    ) raw
    group by to_char(d, 'YYYY-MM')
  ) m;

  -- Expense breakdown by category
  select coalesce(jsonb_agg(to_jsonb(c) order by c.amount desc), '[]'::jsonb) into v_categories
  from (
    select category, sum(amount) as amount, count(*) as count
    from public.expenses
    where status = 'active' and expense_date between p_from and p_to
    group by category
  ) c;

  -- Top products by gross profit
  select coalesce(jsonb_agg(to_jsonb(t) order by t.profit desc), '[]'::jsonb) into v_top
  from (
    select coalesce(p.name, s.name) as name,
      sum((ii.qty - coalesce(ii.returned_qty, 0)) * ii.rate) as revenue,
      sum((ii.qty - coalesce(ii.returned_qty, 0)) * coalesce(p.cost_price, s.cost_price, 0)) as cogs,
      sum((ii.qty - coalesce(ii.returned_qty, 0)) * (ii.rate - coalesce(p.cost_price, s.cost_price, 0))) as profit,
      count(distinct i.id) as invoices
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    left join public.products p on p.id = ii.product_id
    left join public.services s on s.id = ii.service_id
    where i.status <> 'cancelled' and i.invoice_date between p_from and p_to
    group by coalesce(p.name, s.name)
    having sum((ii.qty - coalesce(ii.returned_qty, 0)) * (ii.rate - coalesce(p.cost_price, s.cost_price, 0))) <> 0
    order by profit desc
    limit 6
  ) t;

  return jsonb_build_object(
    'revenue', v_revenue,
    'returns', v_returns,
    'cogs', v_cogs,
    'commission_income', v_commission,
    'expenses', v_expenses,
    'net_revenue', v_net_revenue,
    'gross_profit', v_gross,
    'net_profit', v_net,
    'invoice_count', v_invoices,
    'monthly', v_monthly,
    'categories', v_categories,
    'top_products', v_top
  );
end;
$$;

revoke all on function public.get_pnl(date, date) from public;
grant execute on function public.get_pnl(date, date) to authenticated;


-- ============================================================
-- Avatar & Audit Log
-- ============================================================
-- Run this in Supabase SQL Editor (idempotent).
-- User avatar photos + global audit log for the Cafe ERP app.

-- ---------- Avatar column on profiles ----------
alter table public.profiles add column if not exists avatar_url text;

-- ---------- Storage bucket for user avatars ----------
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars insert" on storage.objects for insert to authenticated with check (bucket_id = 'avatars');
create policy "avatars update" on storage.objects for update to authenticated using (bucket_id = 'avatars');
create policy "avatars delete" on storage.objects for delete to authenticated using (bucket_id = 'avatars');

-- ---------- Audit log ----------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  action text not null,
  entity text not null,
  entity_id text,
  description text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity);
create index if not exists audit_logs_user_idx on public.audit_logs (user_id);

alter table public.audit_logs enable row level security;

create policy "audit_logs all" on public.audit_logs
  for all to authenticated using (true) with check (true);

-- ================= SETTLEMENTS =================

-- Run this in Supabase SQL Editor (idempotent).
-- Settlements: internal fund-movement ledger between Cash / Bank / Wallet / DMT Float / AEPS Float / UPI QR pools.
-- Every settlement type is a distinct one-way transfer (no duplicates, no overlap with AEPS/DMT/UPI transactions).
-- Only physical-cash movements (bank withdrawal, cash to bank, cash adjustment) post a matching cash_entries row,
-- so the dashboard "Cash in Hand" and the cash book stay correct without double counting.

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  settlement_number text not null unique,
  settlement_type text not null check (settlement_type in (
    'aeps_to_bank', 'bank_to_dmt', 'wallet_to_dmt', 'upi_qr_to_wallet',
    'wallet_to_bank', 'bank_withdrawal', 'add_cash_to_bank', 'cash_adjustment'
  )),
  settlement_date date not null default current_date,
  from_pool text not null check (from_pool in ('cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr')),
  to_pool text not null check (to_pool in ('cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr')),
  direction text check (direction in ('in', 'out')),
  amount numeric(15,2) not null default 0 check (amount >= 0),
  reference text,
  remarks text,
status text not null default 'success' check (status in ('success', 'reversed')),
  created_by uuid references public.profiles (id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists settlements_date_idx on public.settlements (settlement_date desc);
create index if not exists settlements_type_idx on public.settlements (settlement_type);
create index if not exists settlements_status_idx on public.settlements (status);

alter table public.settlements enable row level security;
create policy "settlements all" on public.settlements for all to authenticated using (true) with check (true);

create sequence if not exists public.settlement_seq start 1;

-- ---------- Create settlement (atomic: row + optional cash leg) ----------
create or replace function public.create_settlement(
  p_settlement_type text,
  p_settlement_date date,
  p_amount numeric,
  p_reference text,
  p_remarks text,
  p_direction text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_number text;
  v_from text;
  v_to text;
  v_prefix text;
  v_cash_dir text;
  v_cash_label text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_settlement_date is null then raise exception 'Date is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  if p_settlement_type = 'aeps_to_bank' then
    v_from := 'aeps'; v_to := 'bank'; v_prefix := 'ATB'; v_cash_dir := null;
  elsif p_settlement_type = 'bank_to_dmt' then
    v_from := 'bank'; v_to := 'dmt'; v_prefix := 'BTD'; v_cash_dir := null;
  elsif p_settlement_type = 'wallet_to_dmt' then
    v_from := 'wallet'; v_to := 'dmt'; v_prefix := 'WTD'; v_cash_dir := null;
  elsif p_settlement_type = 'upi_qr_to_wallet' then
    v_from := 'upi_qr'; v_to := 'wallet'; v_prefix := 'UQW'; v_cash_dir := null;
  elsif p_settlement_type = 'wallet_to_bank' then
    v_from := 'wallet'; v_to := 'bank'; v_prefix := 'WTB'; v_cash_dir := null;
  elsif p_settlement_type = 'bank_withdrawal' then
    v_from := 'bank'; v_to := 'cash'; v_prefix := 'BWD'; v_cash_dir := 'in'; v_cash_label := 'Bank Withdrawal';
  elsif p_settlement_type = 'add_cash_to_bank' then
    v_from := 'cash'; v_to := 'bank'; v_prefix := 'CTB'; v_cash_dir := 'out'; v_cash_label := 'Cash to Bank';
  elsif p_settlement_type = 'cash_adjustment' then
    if p_direction not in ('in', 'out') then raise exception 'Select Add Cash or Remove Cash'; end if;
    v_from := 'cash'; v_to := 'cash'; v_prefix := 'CAD';
    v_cash_dir := p_direction;
    v_cash_label := case when p_direction = 'in' then 'Cash Added' else 'Cash Removed' end;
  else
    raise exception 'Invalid settlement type';
  end if;

  v_number := v_prefix || '-' || lpad(nextval('public.settlement_seq')::text, 4, '0');

  insert into public.settlements (
    settlement_number, settlement_type, settlement_date, from_pool, to_pool,
    direction, amount, reference, remarks, status, created_by
  ) values (
    v_number, p_settlement_type, p_settlement_date, v_from, v_to,
    v_cash_dir, p_amount, nullif(p_reference, ''), p_remarks, 'success', auth.uid()
  ) returning id into v_id;

  if v_cash_dir is not null then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (p_settlement_date, 'cash', v_cash_dir, p_amount,
            'Settlement: ' || v_cash_label || ' (' || v_number || ')', 'settlement', v_id);
  end if;

  return jsonb_build_object('id', v_id, 'settlement_number', v_number, 'status', 'success');
end;
$$;

-- ---------- Reverse settlement (audited, journal never deleted) ----------
create or replace function public.reverse_settlement(p_settlement_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_settlement record;
  v_opposite text;
  v_label text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_settlement from public.settlements where id = p_settlement_id for update;
  if not found then raise exception 'Settlement not found'; end if;
  if v_settlement.status <> 'success' then raise exception 'This settlement is already closed'; end if;

  if v_settlement.direction is not null then
    v_opposite := case when v_settlement.direction = 'in' then 'out' else 'in' end;
    v_label := case
      when v_settlement.settlement_type = 'bank_withdrawal' then 'Bank Withdrawal Reversed'
      when v_settlement.settlement_type = 'add_cash_to_bank' then 'Cash to Bank Reversed'
      else case when v_opposite = 'in' then 'Cash Added (Reversed)' else 'Cash Removed (Reversed)' end
    end;
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (current_date, 'cash', v_opposite, v_settlement.amount,
            'Settlement: ' || v_label || ' (' || v_settlement.settlement_number || ')', 'settlement', p_settlement_id);
  end if;

  update public.settlements
  set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(),
      remarks = trim(coalesce(remarks, '') || E'\nReversed: ' || coalesce(p_reason, 'No reason provided.'))
  where id = p_settlement_id;

  return jsonb_build_object('id', p_settlement_id, 'status', 'reversed');
end;
$$;

-- ---------- Pool balances (single source of truth for KPI cards) ----------
create or replace function public.get_settlement_summary()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_cash numeric;
  v_bank numeric;
  v_wallet numeric;
  v_dmt numeric;
  v_aeps numeric;
  v_upi_qr numeric;
  v_count bigint;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select coalesce(sum(case when direction = 'in' then amount else -amount end), 0) into v_cash
  from public.cash_entries where method = 'cash';

  select coalesce(sum(amount), 0) into v_bank
  from (
    select amount from public.settlements where status = 'success' and to_pool = 'bank'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'bank'
  ) t;

  select coalesce(sum(amount), 0) into v_wallet
  from (
    select amount from public.settlements where status = 'success' and to_pool = 'wallet'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'wallet'
  ) t;

  select coalesce(sum(amount), 0) into v_dmt
  from (
    select amount from public.settlements where status = 'success' and to_pool = 'dmt'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'dmt'
  ) t;

  select coalesce(sum(amount), 0) into v_aeps
  from (
    select amount from public.settlements where status = 'success' and to_pool = 'aeps'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'aeps'
  ) t;

  select coalesce(sum(amount), 0) into v_upi_qr
  from (
    select amount from public.settlements where status = 'success' and to_pool = 'upi_qr'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'upi_qr'
  ) t;

  select count(*) into v_count from public.settlements where status = 'success';

  return jsonb_build_object(
    'cash', v_cash, 'bank', v_bank, 'wallet', v_wallet,
    'dmt', v_dmt, 'aeps', v_aeps, 'upi_qr', v_upi_qr, 'count', v_count
  );
end;
$$;

-- ---------- Realtime publish (idempotent) ----------
do $$
declare t text;
begin
  foreach t in array array['settlements']
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


-- ================= CUSTOMER PHOTOS =================

-- Run this in Supabase SQL Editor (idempotent).
-- Customer profile photos: column + public storage bucket + policies.

alter table public.customers add column if not exists avatar_url text;

insert into storage.buckets (id, name, public) values ('customer-photos', 'customer-photos', true)
on conflict (id) do nothing;

create policy "customer-photos read" on storage.objects for select using (bucket_id = 'customer-photos');
create policy "customer-photos insert" on storage.objects for insert to authenticated with check (bucket_id = 'customer-photos');
create policy "customer-photos update" on storage.objects for update to authenticated using (bucket_id = 'customer-photos');
create policy "customer-photos delete" on storage.objects for delete to authenticated using (bucket_id = 'customer-photos');

-- ================= CUSTOMER ADVANCE =================

-- Allow 'advance' entries in the customer ledger
alter table public.customer_ledger drop constraint if exists customer_ledger_type_check;
alter table public.customer_ledger
  add constraint customer_ledger_type_check
  check (type in ('invoice', 'payment', 'return', 'opening', 'advance'));

-- Record an advance received from a customer (cash in; reduces their balance -> advance).
-- Atomically updates customers.balance + customer_ledger + cash_entries.
create or replace function public.record_advance(
  p_customer_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_note text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance numeric;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_customer_id is null then
    raise exception 'Customer is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  select balance, name into v_balance, v_name
    from public.customers
   where id = p_customer_id
   for update;

  if v_name is null then
    raise exception 'Customer not found';
  end if;

  update public.customers
     set balance = balance - p_amount,
         updated_at = now()
   where id = p_customer_id;

  v_balance := v_balance - p_amount;

  insert into public.customer_ledger (customer_id, entry_date, type, description, debit, credit, balance_after)
  values (p_customer_id, p_entry_date, 'advance', coalesce(p_note, 'Advance received'), 0, p_amount, v_balance);

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
  values (p_entry_date, 'cash', 'in', p_amount, 'Advance received from ' || v_name, 'customer_advance', p_customer_id);

  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

-- Return an advance to a customer (cash out; increases their balance).
-- Atomically updates customers.balance + customer_ledger + cash_entries.
create or replace function public.return_advance(
  p_customer_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_note text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance numeric;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_customer_id is null then
    raise exception 'Customer is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  select balance, name into v_balance, v_name
    from public.customers
   where id = p_customer_id
   for update;

  if v_name is null then
    raise exception 'Customer not found';
  end if;

  if v_balance + p_amount > 0 then
    raise exception 'Cannot return more than the available advance of %', abs(v_balance);
  end if;

  update public.customers
     set balance = balance + p_amount,
         updated_at = now()
   where id = p_customer_id;

  v_balance := v_balance + p_amount;

  insert into public.customer_ledger (customer_id, entry_date, type, description, debit, credit, balance_after)
  values (p_customer_id, p_entry_date, 'advance', coalesce(p_note, 'Advance returned'), p_amount, 0, v_balance);

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
  values (p_entry_date, 'cash', 'out', p_amount, 'Advance returned to ' || v_name, 'customer_advance', p_customer_id);

  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

