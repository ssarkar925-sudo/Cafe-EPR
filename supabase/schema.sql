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
  customer_type text not null default 'retail',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Till payment methods (Settings -> Payment Methods); POS/Quick Sale offer enabled ones.
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  method text not null unique,
  label text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

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

alter table public.payment_methods enable row level security;
create policy "payment_methods all" on public.payment_methods for all to authenticated using (true) with check (true);

-- Catalog master lists (Brands / Units). Reference data only; never referenced by invoices.
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
create policy "brands all" on public.brands for all to authenticated using (true) with check (true);

alter table public.units enable row level security;
create policy "units all" on public.units for all to authenticated using (true) with check (true);

-- Payment accounts (Settings -> Payment Accounts): flexible detail payload + opening balance.
alter table public.payment_instruments add column if not exists details jsonb not null default '{}';
alter table public.payment_instruments add column if not exists opening_balance numeric(15,2) not null default 0;

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
  service_id uuid references public.services (id) on delete set null,
  description text,
  qty numeric(15,3) not null default 1,
  rate numeric(15,2) not null default 0,
  amount numeric(15,2) not null default 0,
  cost_price numeric(15,2) not null default 0
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

-- Auto-create profile on signup. The first-ever user becomes admin automatically;
-- all later signups default to staff.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles) then
    insert into public.profiles (id, email, role)
    values (new.id, new.email, 'admin')
    on conflict (id) do nothing;
  else
    insert into public.profiles (id, email)
    values (new.id, new.email)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Promote a user to admin (e.g. after creating one manually):
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
  p_previous_due_instrument_id uuid default null,
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
  v_cost_line numeric;
  v_stock numeric;
  v_payment jsonb;
  v_method text;
  v_instrument_id uuid;
  v_cust_balance numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_previous_due < 0 or p_advance_used < 0 then
    raise exception 'Invalid due/advance amounts';
  end if;
  if p_previous_due_instrument_id is null and p_previous_due_method not in ('cash', 'upi', 'card', 'bank', 'wallet', 'debit_card', 'credit_card') then
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
    -- Custom items may carry an optional cost for accurate income; catalog cost stays server-side.
    v_cost_line := case
      when v_product_id is null and (v_item->>'service_id')::uuid is null
        then greatest(coalesce((v_item->>'cost_price')::numeric, 0), 0)
      else 0
    end;

    insert into public.invoice_items (invoice_id, product_id, service_id, description, qty, rate, amount, cost_price)
    values (v_invoice_id, v_product_id, (v_item->>'service_id')::uuid, v_item->>'description', v_qty, v_rate, v_amount, v_cost_line);

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
    v_method := coalesce(v_payment->>'method', 'cash');
    v_instrument_id := nullif(v_payment->>'instrument_id', '')::uuid;
    if v_instrument_id is not null then
      select type into v_method from public.payment_instruments where id = v_instrument_id and is_active = true;
      if v_method is null then
        raise exception 'Unknown payment instrument';
      end if;
    end if;
    insert into public.payments (invoice_id, method, amount, instrument_id)
    values (v_invoice_id, v_method, coalesce((v_payment->>'amount')::numeric, 0), v_instrument_id);

    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (p_invoice_date, v_method, 'in', coalesce((v_payment->>'amount')::numeric, 0), 'Sale ' || v_invoice_number, 'invoice', v_invoice_id, v_instrument_id);
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

      v_method := p_previous_due_method;
      v_instrument_id := nullif(p_previous_due_instrument_id, NULL::uuid);
      if v_instrument_id is not null then
        select type into v_method from public.payment_instruments where id = v_instrument_id and is_active = true;
        if v_method is null then
          raise exception 'Unknown payment instrument';
        end if;
      end if;
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (p_invoice_date, v_method, 'in', p_previous_due, 'Previous due ' || v_invoice_number, 'invoice', v_invoice_id, v_instrument_id);
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
      'created_at', created_at,
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
  p_previous_due_instrument_id uuid default null,
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
  v_cost_line numeric;
  v_stock numeric;
  v_payment jsonb;
  v_method text;
  v_instrument_id uuid;
  v_cust_balance numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_previous_due < 0 or p_advance_used < 0 then
    raise exception 'Invalid due/advance amounts';
  end if;
  if p_previous_due_instrument_id is null and p_previous_due_method not in ('cash', 'upi', 'card', 'bank', 'wallet', 'debit_card', 'credit_card') then
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
    -- Custom items may carry an optional cost for accurate income; catalog cost stays server-side.
    v_cost_line := case
      when v_product_id is null and (v_item->>'service_id')::uuid is null
        then greatest(coalesce((v_item->>'cost_price')::numeric, 0), 0)
      else 0
    end;

    insert into public.invoice_items (invoice_id, product_id, service_id, description, qty, rate, amount, cost_price)
    values (v_invoice_id, v_product_id, (v_item->>'service_id')::uuid, v_item->>'description', v_qty, v_rate, v_amount, v_cost_line);

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
    v_method := coalesce(v_payment->>'method', 'cash');
    v_instrument_id := nullif(v_payment->>'instrument_id', '')::uuid;
    if v_instrument_id is not null then
      select type into v_method from public.payment_instruments where id = v_instrument_id and is_active = true;
      if v_method is null then
        raise exception 'Unknown payment instrument';
      end if;
    end if;
    insert into public.payments (invoice_id, method, amount, instrument_id)
    values (v_invoice_id, v_method, coalesce((v_payment->>'amount')::numeric, 0), v_instrument_id);

    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (p_invoice_date, v_method, 'in', coalesce((v_payment->>'amount')::numeric, 0), 'Sale ' || v_invoice_number, 'invoice', v_invoice_id, v_instrument_id);
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

      v_method := p_previous_due_method;
      v_instrument_id := nullif(p_previous_due_instrument_id, NULL::uuid);
      if v_instrument_id is not null then
        select type into v_method from public.payment_instruments where id = v_instrument_id and is_active = true;
        if v_method is null then
          raise exception 'Unknown payment instrument';
        end if;
      end if;
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (p_invoice_date, v_method, 'in', p_previous_due, 'Previous due ' || v_invoice_number, 'invoice', v_invoice_id, v_instrument_id);
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
      'created_at', created_at,
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
  p_note text,
  p_instrument_id uuid default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_expense_id uuid;
  v_method text := 'cash';
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_category is null or p_category = '' then raise exception 'Category is required'; end if;
  if p_instrument_id is not null then
    select type into v_method from public.payment_instruments where id = p_instrument_id and is_active = true;
    if v_method is null then raise exception 'Unknown payment instrument'; end if;
  end if;

  insert into public.expenses (expense_date, category, amount, note, created_by)
  values (p_expense_date, p_category, p_amount, p_note, auth.uid())
  returning id into v_expense_id;

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
  values (p_expense_date, v_method, 'out', p_amount, 'Expense: ' || p_category, 'expense', v_expense_id, p_instrument_id);

  return jsonb_build_object('id', v_expense_id);
end;
$$;

-- ============================================================================
-- Opening Balances + Day Close + Net Profit
-- Pools: cash, bank, wallet, dmt, aeps, upi_qr, credit_card.
-- Each pool can have an opening balance seed (instrument_id NULL = pool base) and/or
-- per-account seeds (instrument_id set) so a bank account / credit card added later
-- adjusts automatically. Pool balance = seed(s) + movements dated AFTER the seed date.
-- A closed day seeds the next day's opening automatically from its final balances.
-- ============================================================================

create table if not exists public.opening_balances (
  id uuid primary key default gen_random_uuid(),
  pool text not null check (pool in ('cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card')),
  instrument_id uuid references public.payment_instruments (id) on delete cascade,
  amount numeric(15,2) not null default 0 check (amount >= 0),
  as_of date not null default current_date,
  remarks text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists opening_balances_pool_idx on public.opening_balances (pool, as_of desc);
create index if not exists opening_balances_instrument_idx on public.opening_balances (instrument_id);

alter table public.opening_balances enable row level security;
create policy "opening_balances all" on public.opening_balances for all to authenticated using (true) with check (true);

create table if not exists public.closings (
  id uuid primary key default gen_random_uuid(),
  closing_number text not null unique,
  close_date date not null unique,
  status text not null default 'open' check (status in ('open', 'closed', 'reversed')),
  opened_by uuid references public.profiles (id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  net_profit numeric(15,2) not null default 0,
  owner_deposits numeric(15,2) not null default 0,
  owner_withdrawals numeric(15,2) not null default 0,
  balance_check numeric(15,2) not null default 0,
  remarks text,
  reversed_at timestamptz,
  reversed_by uuid references auth.users (id) on delete set null
);

create index if not exists closings_date_idx on public.closings (close_date desc);
create index if not exists closings_status_idx on public.closings (status);

alter table public.closings enable row level security;
create policy "closings all" on public.closings for all to authenticated using (true) with check (true);

create table if not exists public.closing_balances (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.closings (id) on delete cascade,
  pool text not null check (pool in ('cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card')),
  seed_date date,
  opening numeric(15,2) not null default 0,
  movements numeric(15,2) not null default 0,
  computed numeric(15,2) not null default 0,
  adjustment numeric(15,2) not null default 0,
  final numeric(15,2) not null default 0,
  remarks text,
  unique (closing_id, pool)
);

alter table public.closing_balances enable row level security;
create policy "closing_balances all" on public.closing_balances for all to authenticated using (true) with check (true);

create sequence if not exists public.closing_seq start 1;

-- ---------- Pool seed: latest opening for a pool as of a date ----------
-- Pool-level seed (instrument NULL) is authoritative; per-account seeds dated after it
-- add on top (e.g. a bank account opened later with its own opening balance). When no
-- seed exists at all, opening = 0 and the cutoff is epoch so all movements count.
create or replace function public.get_pool_seed(p_pool text, p_as_of date)
returns table (opening numeric, seed_date date)
language plpgsql
security definer set search_path = public
as $$
declare
  v_pool_amount numeric;
  v_pool_date date;
  v_inst_total numeric;
  v_inst_date date;
begin
  select amount, as_of into v_pool_amount, v_pool_date
    from public.opening_balances
    where pool = p_pool and instrument_id is null and as_of <= p_as_of
    order by as_of desc, created_at desc
    limit 1;

  select coalesce(sum(amount), 0), max(as_of) into v_inst_total, v_inst_date
  from (
    select distinct on (instrument_id) amount, as_of
    from public.opening_balances
    where pool = p_pool and instrument_id is not null and as_of <= p_as_of
    order by instrument_id, as_of desc, created_at desc
  ) inst
  where as_of > coalesce(v_pool_date, '0001-01-01'::date);

  return query
  select
    coalesce(v_pool_amount, 0) + coalesce(v_inst_total, 0) as opening,
    case
      when v_pool_date is not null then v_pool_date
      when v_inst_date is not null then v_inst_date
      else '0001-01-01'::date
    end as seed_date;
end;
$$;

-- ---------- Pool movements (single source of truth, mirrors get_settlement_summary) ----------
create or replace function public.get_pool_movements(p_pool text, p_from date, p_to date)
returns numeric
language plpgsql
security definer set search_path = public
as $$
declare v numeric := 0;
begin
  if p_pool = 'cash' then
    select coalesce(sum(case when direction = 'in' then amount else -amount end), 0) into v
    from public.cash_entries
    where method = 'cash' and entry_date > p_from and (p_to is null or entry_date <= p_to);

  elsif p_pool = 'bank' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'bank'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'bank'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select case when direction = 'in' then amount else -amount end
      from public.cash_entries where method in ('bank', 'debit_card', 'credit_card')
        and entry_date > p_from and (p_to is null or entry_date <= p_to)
      union all
      select bank_in from public.transactions where status = 'success' and bank_in > 0
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -bank_out from public.transactions where status = 'success' and bank_out > 0
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
    ) t;

  elsif p_pool = 'wallet' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'wallet'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'wallet'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select case when direction = 'in' then amount else -amount end
      from public.cash_entries where method = 'wallet'
        and entry_date > p_from and (p_to is null or entry_date <= p_to)
    ) t;

  elsif p_pool = 'dmt' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'dmt'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'dmt'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select case when direction = 'in' then amount else -amount end
      from public.cash_entries where method = 'dmt'
        and entry_date > p_from and (p_to is null or entry_date <= p_to)
      union all
      select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'dmt'
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'dmt'
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
    ) t;

  elsif p_pool = 'aeps' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'aeps'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'aeps'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select case when direction = 'out' then amount else -amount end
      from public.cash_entries where method = 'aeps'
        and entry_date > p_from and (p_to is null or entry_date <= p_to)
      union all
      select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'aeps'
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'aeps'
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
    ) t;

  elsif p_pool = 'upi_qr' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'upi_qr'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'upi_qr'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select case when direction = 'in' then amount else -amount end
      from public.cash_entries where method = 'upi'
        and entry_date > p_from and (p_to is null or entry_date <= p_to)
      union all
      select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'upi_qr'
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'upi_qr'
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
      union all
      select upi_fee from public.transactions where status = 'success' and upi_fee > 0
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
    ) t;

  else
    v := 0;
  end if;

  return v;
end;
$$;

-- ---------- Pool balances for KPI cards (opening seed + post-seed movements) ----------
create or replace function public.get_pool_balances(p_as_of date default current_date)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_pool text;
  v_opening numeric;
  v_seed date;
  v_mov numeric;
  v_total numeric := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  foreach v_pool in array array['cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card']
  loop
    select s.opening, s.seed_date into v_opening, v_seed
    from public.get_pool_seed(v_pool, p_as_of) s;

    v_mov := public.get_pool_movements(v_pool, v_seed, null);

    v_total := v_total + v_opening + v_mov;
    v_result := v_result || jsonb_build_object(
      v_pool, jsonb_build_object(
        'opening', v_opening,
        'seed_date', v_seed,
        'movements', v_mov,
        'current', v_opening + v_mov
      )
    );
  end loop;

  return v_result || jsonb_build_object('total', v_total);
end;
$$;

-- ---------- Set / update an opening balance seed (audited append-only) ----------
create or replace function public.set_opening_balance(
  p_pool text,
  p_amount numeric,
  p_as_of date default current_date,
  p_instrument_id uuid default null,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_pool is null or p_pool not in ('cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card') then
    raise exception 'Invalid pool';
  end if;
  if p_amount is null or p_amount < 0 then raise exception 'Opening balance cannot be negative'; end if;
  if p_instrument_id is not null and not exists (
    select 1 from public.payment_instruments where id = p_instrument_id
  ) then
    raise exception 'Payment instrument not found';
  end if;

  insert into public.opening_balances (pool, instrument_id, amount, as_of, remarks, created_by)
  values (p_pool, p_instrument_id, p_amount, p_as_of, p_remarks, auth.uid())
  returning id into v_id;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'opening_balance_set', 'opening_balances', v_id::text,
    'Set ' || p_pool || ' opening balance to ' || p_amount || ' as of ' || p_as_of,
    jsonb_build_object('pool', p_pool, 'amount', p_amount, 'as_of', p_as_of, 'instrument_id', p_instrument_id)
  );

  return jsonb_build_object('id', v_id, 'pool', p_pool, 'amount', p_amount, 'as_of', p_as_of);
end;
$$;

-- ---------- Open a day close (one open close at a time, snapshot opening) ----------
create or replace function public.open_close(p_close_date date)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_num text;
  v_pool text;
  v_opening numeric;
  v_seed date;
  v_mov numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_close_date is null then raise exception 'Date is required'; end if;
  if exists (select 1 from public.closings where status = 'open') then
    raise exception 'An open day close already exists';
  end if;
  if exists (select 1 from public.closings where close_date = p_close_date and status <> 'reversed') then
    raise exception 'A day close already exists for this date';
  end if;

  v_num := 'CLS-' || lpad(nextval('public.closing_seq')::text, 4, '0');

  insert into public.closings (closing_number, close_date, status, opened_by)
  values (v_num, p_close_date, 'open', auth.uid())
  returning id into v_id;

  foreach v_pool in array array['cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card']
  loop
    select s.opening, s.seed_date into v_opening, v_seed
    from public.get_pool_seed(v_pool, p_close_date) s;
    if v_seed = '0001-01-01'::date then
      v_mov := 0;
    else
      v_mov := public.get_pool_movements(v_pool, v_seed, p_close_date);
    end if;
    insert into public.closing_balances (closing_id, pool, seed_date, opening, movements, computed)
    values (v_id, v_pool, v_seed, v_opening, v_mov, v_opening + v_mov);
  end loop;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description)
  values (auth.uid(), null, 'day_close_opened', 'closings', v_id::text,
          'Opened day close ' || v_num || ' for ' || p_close_date);

  return jsonb_build_object('id', v_id, 'closing_number', v_num, 'close_date', p_close_date, 'status', 'open');
end;
$$;

-- ---------- Current open close with live recomputed balances ----------
create or replace function public.get_open_close()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_close record;
  v_rows jsonb;
  v_pool text;
  v_opening numeric;
  v_seed date;
  v_mov numeric;
  v_computed numeric;
  v_adjust numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_close from public.closings where status = 'open' order by opened_at desc limit 1;
  if not found then return '{}'::jsonb; end if;

  v_rows := '[]'::jsonb;
  foreach v_pool in array array['cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card']
  loop
    select coalesce(opening, 0), coalesce(seed_date, '0001-01-01'::date), coalesce(adjustment, 0)
      into v_opening, v_seed, v_adjust
    from public.closing_balances
    where closing_id = v_close.id and pool = v_pool;

    if v_seed = '0001-01-01'::date then
      v_mov := 0;
    else
      v_mov := public.get_pool_movements(v_pool, v_seed, v_close.close_date);
    end if;
    v_computed := v_opening + v_mov;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'pool', v_pool,
      'seed_date', v_seed,
      'opening', v_opening,
      'movements', v_mov,
      'computed', v_computed,
      'adjustment', v_adjust,
      'final', v_computed + v_adjust
    ));
  end loop;

  return jsonb_build_object(
    'id', v_close.id,
    'closing_number', v_close.closing_number,
    'close_date', v_close.close_date,
    'status', v_close.status,
    'opened_at', v_close.opened_at,
    'rows', v_rows
  );
end;
$$;

-- ---------- Adjust a pool on an open close ----------
create or replace function public.set_close_adjustment(
  p_closing_id uuid,
  p_pool text,
  p_amount numeric,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_row record;
  v_final numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.closings where id = p_closing_id and status = 'open') then
    raise exception 'Day close not open';
  end if;

  select * into v_row from public.closing_balances
    where closing_id = p_closing_id and pool = p_pool for update;
  if not found then raise exception 'Pool not found in close'; end if;

  v_final := v_row.computed + p_amount;
  update public.closing_balances
    set adjustment = p_amount, final = v_final,
        remarks = coalesce(nullif(p_remarks, ''), remarks)
    where id = v_row.id;

  return jsonb_build_object('closing_id', p_closing_id, 'pool', p_pool, 'adjustment', p_amount, 'final', v_final);
end;
$$;

-- ---------- Close the day (net profit + balance check + auto next-day opening) ----------
create or replace function public.close_day(
  p_closing_id uuid,
  p_owner_deposits numeric default 0,
  p_owner_withdrawals numeric default 0,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_close record;
  v_pool text;
  v_open_total numeric := 0;
  v_final_total numeric := 0;
  v_net numeric;
  v_check numeric;
  v_row record;
  v_result jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_close from public.closings where id = p_closing_id for update;
  if not found then raise exception 'Day close not found'; end if;
  if v_close.status <> 'open' then raise exception 'Day close is not open'; end if;

  for v_row in
    select * from public.closing_balances where closing_id = p_closing_id
  loop
    if v_row.seed_date is not null and v_row.seed_date <> '0001-01-01'::date then
      update public.closing_balances
        set movements = public.get_pool_movements(v_row.pool, v_row.seed_date, v_close.close_date),
            computed = v_row.opening + public.get_pool_movements(v_row.pool, v_row.seed_date, v_close.close_date),
            final = v_row.opening + public.get_pool_movements(v_row.pool, v_row.seed_date, v_close.close_date) + v_row.adjustment
        where id = v_row.id;
    end if;
  end loop;

  select coalesce(sum(opening), 0), coalesce(sum(final), 0)
    into v_open_total, v_final_total
  from public.closing_balances where closing_id = p_closing_id;

  v_net := coalesce((select (public.get_pnl(v_close.close_date, v_close.close_date)->>'net_profit')::numeric), 0);
  v_check := v_final_total - v_open_total - v_net - coalesce(p_owner_deposits, 0) + coalesce(p_owner_withdrawals, 0);

  update public.closings
    set status = 'closed', closed_by = auth.uid(), closed_at = now(),
        net_profit = v_net,
        owner_deposits = coalesce(p_owner_deposits, 0),
        owner_withdrawals = coalesce(p_owner_withdrawals, 0),
        balance_check = v_check,
        remarks = coalesce(nullif(p_remarks, ''), remarks)
    where id = p_closing_id;

  for v_row in
    select * from public.closing_balances where closing_id = p_closing_id
  loop
    insert into public.opening_balances (pool, instrument_id, amount, as_of, remarks, created_by)
    values (v_row.pool, null, v_row.final, v_close.close_date,
            'Auto from ' || v_close.closing_number, auth.uid());
    v_result := v_result || jsonb_build_object(
      v_row.pool, jsonb_build_object('opening', v_row.opening, 'movements', v_row.movements,
                                     'adjustment', v_row.adjustment, 'final', v_row.final)
    );
  end loop;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'day_close_completed', 'closings', p_closing_id::text,
    'Closed ' || v_close.closing_number || ' for ' || v_close.close_date ||
    ' | net profit ' || v_net || ' | balance check ' || v_check,
    jsonb_build_object('net_profit', v_net, 'balance_check', v_check,
                       'owner_deposits', p_owner_deposits, 'owner_withdrawals', p_owner_withdrawals)
  );

  return jsonb_build_object(
    'id', p_closing_id,
    'closing_number', v_close.closing_number,
    'close_date', v_close.close_date,
    'status', 'closed',
    'net_profit', v_net,
    'balance_check', v_check,
    'pools', v_result
  );
end;
$$;

-- ---------- Close history ----------
create or replace function public.get_closings(p_limit int default 30)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_list jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.close_date desc), '[]'::jsonb) into v_list
  from (
    select cl.id, cl.closing_number, cl.close_date, cl.status, cl.net_profit,
           cl.owner_deposits, cl.owner_withdrawals, cl.balance_check,
           cl.opened_at, cl.closed_at, cl.remarks,
           (select coalesce(jsonb_agg(to_jsonb(cb) order by cb.pool), '[]'::jsonb)
            from public.closing_balances cb where cb.closing_id = cl.id) as balances
    from public.closings cl
    order by cl.close_date desc
    limit greatest(1, p_limit)
  ) c;

  return jsonb_build_object('closings', v_list);
end;
$$;

-- ---------- Reverse a closed day (audited, journal never deleted) ----------
create or replace function public.reverse_close(p_closing_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_close record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_close from public.closings where id = p_closing_id for update;
  if not found then raise exception 'Day close not found'; end if;
  if v_close.status <> 'closed' then raise exception 'Only a closed day close can be reversed'; end if;

  update public.closings
    set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(),
        remarks = trim(coalesce(remarks, '') || E'\nReversed: ' || coalesce(p_reason, 'No reason provided.'))
    where id = p_closing_id;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'day_close_reversed', 'closings', p_closing_id::text,
    'Reversed ' || v_close.closing_number || ' for ' || v_close.close_date,
    jsonb_build_object('reason', p_reason, 'net_profit', v_close.net_profit)
  );

  return jsonb_build_object('id', p_closing_id, 'status', 'reversed');
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
    gstin text,
    tax_rate numeric(15,2) not null default 0,
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
alter table public.invoice_items add column if not exists cost_price numeric(15,2) not null default 0;

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

  -- Quick sales revenue in range (active sales only)
  v_revenue := v_revenue + coalesce((select sum(amount) from public.quick_sales
    where status = 'active' and sale_date between p_from and p_to), 0);

-- Returns / refunds in range. Fully-returned invoices (status = 'cancelled') are already
  -- excluded from revenue, so only returns on still-active invoices reduce revenue here,
  -- otherwise a full return would be double counted. Uses the returned subtotal (goods value).
  select coalesce(sum(r.subtotal), 0) into v_returns
    from public.returns r
    join public.invoices i on i.id = r.invoice_id
    where r.status = 'completed' and i.status <> 'cancelled'
      and r.return_date between p_from and p_to;

-- COGS: sold qty (minus returned) x cost price (line-level custom cost first, then catalog)
  select coalesce(sum((ii.qty - coalesce(ii.returned_qty, 0)) * coalesce(ii.cost_price, p.cost_price, s.cost_price, 0)), 0)
    into v_cogs
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    left join public.products p on p.id = ii.product_id
    left join public.services s on s.id = ii.service_id
    where i.status <> 'cancelled' and i.invoice_date between p_from and p_to;

  -- Quick sale COGS in range
  v_cogs := v_cogs + coalesce((select sum(cost) from public.quick_sales
    where status = 'active' and sale_date between p_from and p_to), 0);

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
      select i.invoice_date, 0, (it.qty - coalesce(it.returned_qty, 0)) * coalesce(it.cost_price, p.cost_price, s.cost_price, 0), 0, 0
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
      union all
      select sale_date, amount, 0, 0, 0
      from public.quick_sales
      where status = 'active' and sale_date between p_from and p_to
      union all
      select sale_date, 0, cost, 0, 0
      from public.quick_sales
      where status = 'active' and sale_date between p_from and p_to
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
select coalesce(p.name, s.name, ii.description) as name,
      sum((ii.qty - coalesce(ii.returned_qty, 0)) * ii.rate) as revenue,
      sum((ii.qty - coalesce(ii.returned_qty, 0)) * coalesce(ii.cost_price, p.cost_price, s.cost_price, 0)) as cogs,
      sum((ii.qty - coalesce(ii.returned_qty, 0)) * (ii.rate - coalesce(ii.cost_price, p.cost_price, s.cost_price, 0))) as profit,
      count(distinct i.id) as invoices
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    left join public.products p on p.id = ii.product_id
    left join public.services s on s.id = ii.service_id
    where i.status <> 'cancelled' and i.invoice_date between p_from and p_to
    group by coalesce(p.name, s.name, ii.description)
    having sum((ii.qty - coalesce(ii.returned_qty, 0)) * (ii.rate - coalesce(ii.cost_price, p.cost_price, s.cost_price, 0))) <> 0
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
-- Pools = external fund flows captured in the cash book (sales, quick sales, expenses,
-- refunds) PLUS internal transfers tracked in the settlements ledger PLUS business
-- module legs (AEPS/DMT/UPI) posted on the transactions row. This keeps the dashboard
-- Money Position consistent with the Cash Book for every account.
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
    union all
    select case when direction = 'in' then amount else -amount end
    from public.cash_entries where method in ('bank', 'debit_card', 'credit_card')
    union all
    select bank_in from public.transactions where status = 'success' and bank_in > 0
    union all
    select -bank_out from public.transactions where status = 'success' and bank_out > 0
  ) t;

  select coalesce(sum(amount), 0) into v_wallet
  from (
    select amount from public.settlements where status = 'success' and to_pool = 'wallet'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'wallet'
    union all
    select case when direction = 'in' then amount else -amount end
    from public.cash_entries where method = 'wallet'
  ) t;

  select coalesce(sum(amount), 0) into v_dmt
  from (
    select amount from public.settlements where status = 'success' and to_pool = 'dmt'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'dmt'
    union all
    select case when direction = 'in' then amount else -amount end
    from public.cash_entries where method = 'dmt'
    union all
    select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'dmt'
    union all
    select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'dmt'
  ) t;

  select coalesce(sum(amount), 0) into v_aeps
  from (
    select amount from public.settlements where status = 'success' and to_pool = 'aeps'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'aeps'
    union all
    select case when direction = 'out' then amount else -amount end
    from public.cash_entries where method = 'aeps'
    union all
    select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'aeps'
    union all
    select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'aeps'
  ) t;

  select coalesce(sum(amount), 0) into v_upi_qr
  from (
    select amount from public.settlements where status = 'success' and to_pool = 'upi_qr'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'upi_qr'
    union all
    select case when direction = 'in' then amount else -amount end
    from public.cash_entries where method = 'upi'
    union all
    select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'upi_qr'
    union all
    select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'upi_qr'
    union all
    select upi_fee from public.transactions where status = 'success' and upi_fee > 0
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

-- Run this in Supabase SQL Editor (idempotent).
-- Quick Sale: fast cash-register style sales for walk-in/local customers — no full invoice.
-- A sale is one or more items (service/product/custom) + named payment instrument.
-- Cost comes from the catalog cost_price for catalog items; custom items may carry an
-- optional cost_price so income stays accurate. Catalog cost is never sent by cashiers.
-- Every payment writes a cash_entries 'in' row tagged with the instrument.

create table if not exists public.quick_sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text not null unique,
  sale_date date not null default current_date,
  customer_id uuid references public.customers (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  service_id uuid references public.services (id) on delete set null,
  item_name text,
  amount numeric(15,2) not null check (amount >= 0),
  cost numeric(15,2) not null default 0 check (cost >= 0),
  tendered numeric(15,2),
  change_due numeric(15,2) not null default 0,
  payments jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create sequence if not exists public.quick_sale_number_seq;
create index if not exists idx_quick_sales_date on public.quick_sales (sale_date);
create index if not exists idx_quick_sales_customer on public.quick_sales (customer_id);
create index if not exists idx_quick_sales_product on public.quick_sales (product_id);

alter table public.quick_sales enable row level security;
drop policy if exists "quick_sales all" on public.quick_sales;
create policy "quick_sales all" on public.quick_sales for all to authenticated using (true) with check (true);

create table if not exists public.quick_sale_items (
  id uuid primary key default gen_random_uuid(),
  quick_sale_id uuid not null references public.quick_sales (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  service_id uuid references public.services (id) on delete set null,
  item_name text,
  qty numeric(15,3) not null default 1 check (qty > 0),
  rate numeric(15,2) not null default 0 check (rate >= 0),
  amount numeric(15,2) not null default 0 check (amount >= 0),
  cost numeric(15,2) not null default 0 check (cost >= 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_quick_sale_items_sale on public.quick_sale_items (quick_sale_id);
alter table public.quick_sale_items add column if not exists created_at timestamptz not null default now();

alter table public.quick_sale_items enable row level security;
drop policy if exists "quick_sale_items all" on public.quick_sale_items;
create policy "quick_sale_items all" on public.quick_sale_items for all to authenticated using (true) with check (true);

-- Services: allow admin to mark "Popular Services" for the Quick Sale screen.
alter table public.services add column if not exists is_quick_favorite boolean not null default false;
alter table public.services add column if not exists quick_sort integer not null default 0;
create index if not exists idx_services_quick_favorite on public.services (is_quick_favorite, quick_sort);

-- Record a quick sale atomically:
--  * p_items (array of {product_id, service_id, item_name, qty, rate}) derives amount and
--    cost server-side from catalog cost_price, writes quick_sale_items and deducts stock.
--  * legacy single-line path (p_amount/p_cost) is preserved for existing callers.
--  * one cash_entries 'in' row per payment, tagged with its named instrument.
drop function if exists public.record_quick_sale(date, numeric);
drop function if exists public.record_quick_sale(date, numeric, numeric);
drop function if exists public.record_quick_sale(date, numeric, numeric, uuid);
drop function if exists public.record_quick_sale(date, numeric, numeric, uuid, uuid);
drop function if exists public.record_quick_sale(date, numeric, numeric, uuid, uuid, uuid);
drop function if exists public.record_quick_sale(date, numeric, numeric, uuid, uuid, uuid, text);
drop function if exists public.record_quick_sale(date, numeric, numeric, uuid, uuid, uuid, text, numeric);
drop function if exists public.record_quick_sale(date, numeric, numeric, uuid, uuid, uuid, text, numeric, jsonb);
create or replace function public.record_quick_sale(
  p_sale_date date,
  p_amount numeric,
  p_cost numeric default 0,
  p_customer_id uuid default null,
  p_product_id uuid default null,
  p_service_id uuid default null,
  p_item_name text default null,
  p_tendered numeric default null,
  p_payments jsonb default '[]'::jsonb,
  p_items jsonb default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_number text;
  v_payment jsonb;
  v_method text;
  v_instrument_id uuid;
  v_change numeric;
  v_amount numeric := 0;
  v_cost numeric := 0;
  v_paid numeric := 0;
  v_line jsonb;
  v_l_product uuid;
  v_l_service uuid;
  v_l_name text;
  v_l_qty numeric;
  v_l_rate numeric;
  v_l_amount numeric;
  v_l_cost numeric;
  v_units text;
  v_stock numeric;
  v_items_mode boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_items is not null and jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0 then
    v_items_mode := true;
    for v_line in select * from jsonb_array_elements(p_items)
    loop
      v_l_product := nullif(v_line->>'product_id', '')::uuid;
      v_l_service := nullif(v_line->>'service_id', '')::uuid;
      v_l_name := nullif(v_line->>'item_name', '');
      v_l_qty := coalesce((v_line->>'qty')::numeric, 1);
      v_l_rate := coalesce((v_line->>'rate')::numeric, 0);
      if v_l_qty <= 0 then
        raise exception 'Quantity must be greater than zero';
      end if;
      if v_l_rate < 0 then
        raise exception 'Invalid selling price';
      end if;
      v_l_amount := round(v_l_qty * v_l_rate, 2);
      v_l_cost := 0;
      if v_l_product is not null then
        select p.cost_price, p.unit into v_l_cost, v_units from public.products p where p.id = v_l_product and p.is_active = true;
        if not found then
          raise exception 'Product not found or unavailable';
        end if;
        v_l_cost := round(v_l_qty * v_l_cost, 2);
      elsif v_l_service is not null then
        select s.cost_price into v_l_cost from public.services s where s.id = v_l_service and s.is_active = true;
        if not found then
          raise exception 'Service not found or unavailable';
        end if;
        v_l_cost := round(v_l_qty * v_l_cost, 2);
elsif v_l_name is null then
        raise exception 'Each item needs a product, service or name';
      else
        -- custom item: optional cost price from the cashier (defaults to 0)
        v_l_cost := round(v_l_qty * greatest(coalesce((v_line->>'cost_price')::numeric, 0), 0), 2);
      end if;
      v_amount := v_amount + v_l_amount;
      v_cost := v_cost + v_l_cost;
    end loop;
    if v_amount <= 0 then
      raise exception 'Sale amount must be greater than zero';
    end if;
  else
    if p_amount <= 0 then
      raise exception 'Sale amount must be greater than zero';
    end if;
    if p_cost < 0 then
      raise exception 'Invalid cost';
    end if;
    v_amount := p_amount;
    v_cost := p_cost;
  end if;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    v_paid := v_paid + coalesce((v_payment->>'amount')::numeric, 0);
  end loop;
  if abs(v_paid - v_amount) > 0.01 then
    raise exception 'Payments (%) must equal the sale amount (%)', round(v_paid, 2), round(v_amount, 2);
  end if;

  if p_tendered is not null and p_tendered < v_amount then
    raise exception 'Tendered amount is less than the sale amount';
  end if;

  v_number := 'QS-' || lpad(nextval('public.quick_sale_number_seq')::text, 4, '0');
  v_change := greatest(coalesce(p_tendered, 0) - v_amount, 0);

  insert into public.quick_sales (sale_number, sale_date, customer_id, product_id, service_id, item_name, amount, cost, tendered, change_due, payments, created_by)
  values (v_number, p_sale_date, p_customer_id,
    case when v_items_mode then null else p_product_id end,
    case when v_items_mode then null else p_service_id end,
    case when v_items_mode then null else p_item_name end,
    v_amount, v_cost, p_tendered, v_change, p_payments, auth.uid())
  returning id into v_id;

  if v_items_mode then
    for v_line in select * from jsonb_array_elements(p_items)
    loop
      v_l_product := nullif(v_line->>'product_id', '')::uuid;
      v_l_service := nullif(v_line->>'service_id', '')::uuid;
      v_l_name := nullif(v_line->>'item_name', '');
      v_l_qty := coalesce((v_line->>'qty')::numeric, 1);
      v_l_rate := coalesce((v_line->>'rate')::numeric, 0);
      v_l_amount := round(v_l_qty * v_l_rate, 2);
      v_l_cost := 0;
if v_l_product is not null then
        select p.cost_price into v_l_cost from public.products p where p.id = v_l_product;
        v_l_cost := round(v_l_qty * coalesce(v_l_cost, 0), 2);
      elsif v_l_service is not null then
        select s.cost_price into v_l_cost from public.services s where s.id = v_l_service;
        v_l_cost := round(v_l_qty * coalesce(v_l_cost, 0), 2);
      else
        v_l_cost := round(v_l_qty * greatest(coalesce((v_line->>'cost_price')::numeric, 0), 0), 2);
      end if;
      insert into public.quick_sale_items (quick_sale_id, product_id, service_id, item_name, qty, rate, amount, cost)
      values (v_id, v_l_product, v_l_service, v_l_name, v_l_qty, v_l_rate, v_l_amount, v_l_cost);
    end loop;
  end if;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    v_method := coalesce(v_payment->>'method', 'cash');
    v_instrument_id := nullif(v_payment->>'instrument_id', '')::uuid;
    if v_instrument_id is not null then
      select type into v_method from public.payment_instruments where id = v_instrument_id and is_active = true;
      if v_method is null then
        raise exception 'Unknown payment instrument';
      end if;
    end if;
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (p_sale_date, v_method, 'in', coalesce((v_payment->>'amount')::numeric, 0), 'Quick sale ' || v_number, 'quick_sale', v_id, v_instrument_id);
  end loop;

  if v_items_mode then
    for v_line in select * from jsonb_array_elements(p_items)
    loop
      v_l_product := nullif(v_line->>'product_id', '')::uuid;
      v_l_qty := coalesce((v_line->>'qty')::numeric, 1);
      if v_l_product is not null then
        select stock_qty into v_stock from public.products where id = v_l_product for update;
        if v_stock is null then
          raise exception 'Product not found';
        end if;
        if v_stock < v_l_qty then
          raise exception 'Insufficient stock (have %, need %)', v_stock, v_l_qty;
        end if;
        update public.products set stock_qty = stock_qty - v_l_qty, updated_at = now() where id = v_l_product;
      end if;
    end loop;
  elsif p_product_id is not null then
    select stock_qty into v_stock from public.products where id = p_product_id for update;
    if v_stock is null then
      raise exception 'Product not found';
    end if;
    if v_stock < 1 then
      raise exception 'Insufficient stock (have %, need 1)', v_stock;
    end if;
    update public.products set stock_qty = stock_qty - 1, updated_at = now() where id = p_product_id;
  end if;

  return (
    select jsonb_build_object(
      'id', id,
      'sale_number', sale_number,
      'sale_date', sale_date,
      'customer_id', customer_id,
      'amount', amount,
      'cost', cost,
      'margin', amount - cost,
      'tendered', tendered,
'change_due', change_due,
      'created_at', created_at,
      'item_count', case when v_items_mode then jsonb_array_length(p_items) else 1 end
    )
    from public.quick_sales
    where id = v_id
  );
end;
$$;

-- Cancel a quick sale (audited, no delete): reverses each payment's cash entry and
-- restores stock for every item line.
create or replace function public.cancel_quick_sale(p_sale_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_sale record;
  v_payment jsonb;
  v_method text;
  v_instrument_id uuid;
  v_item record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_sale from public.quick_sales where id = p_sale_id for update;
  if not found then
    raise exception 'Quick sale not found';
  end if;
  if v_sale.status = 'cancelled' then
    raise exception 'Quick sale already cancelled';
  end if;

  update public.quick_sales set status = 'cancelled', cancelled_at = now() where id = p_sale_id;

  for v_payment in select * from jsonb_array_elements(v_sale.payments)
  loop
    v_method := coalesce(v_payment->>'method', 'cash');
    v_instrument_id := nullif(v_payment->>'instrument_id', '')::uuid;
    if v_instrument_id is not null then
      select type into v_method from public.payment_instruments where id = v_instrument_id;
    end if;
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (current_date, v_method, 'out', coalesce((v_payment->>'amount')::numeric, 0), 'Quick sale cancelled: ' || v_sale.sale_number, 'quick_sale', p_sale_id, v_instrument_id);
  end loop;

  for v_item in select product_id, qty from public.quick_sale_items where quick_sale_id = p_sale_id
  loop
    if v_item.product_id is not null then
      update public.products set stock_qty = stock_qty + v_item.qty, updated_at = now() where id = v_item.product_id;
    end if;
  end loop;

  if v_sale.product_id is not null then
    update public.products set stock_qty = stock_qty + 1, updated_at = now() where id = v_sale.product_id;
  end if;

  return jsonb_build_object('id', p_sale_id, 'status', 'cancelled');
end;
$$;

grant usage, select on sequence public.quick_sale_number_seq to authenticated;

-- Extend add_expense so Money Out / bill payments can be tagged to a named instrument
-- (bank/UPI/wallet/card) or a generic method. Defaults to cash for the existing
-- Finance -> Expenses flow.
drop function if exists public.add_expense(date, text, numeric, text);
drop function if exists public.add_expense(date, text, numeric, text, uuid);
create or replace function public.add_expense(
  p_expense_date date,
  p_category text,
  p_amount numeric,
  p_note text,
  p_instrument_id uuid default null,
  p_method text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_expense_id uuid;
  v_method text := 'cash';
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_category is null or p_category = '' then raise exception 'Category is required'; end if;
  if p_instrument_id is not null then
    select type into v_method from public.payment_instruments where id = p_instrument_id and is_active = true;
    if v_method is null then raise exception 'Unknown payment instrument'; end if;
  elsif p_method is not null then
    v_method := lower(p_method);
    if v_method not in ('cash', 'upi', 'card', 'bank', 'wallet', 'debit_card', 'credit_card') then
      raise exception 'Invalid payment method';
    end if;
  end if;

  insert into public.expenses (expense_date, category, amount, note, created_by)
  values (p_expense_date, p_category, p_amount, p_note, auth.uid())
  returning id into v_expense_id;

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
  values (p_expense_date, v_method, 'out', p_amount, 'Expense: ' || p_category, 'expense', v_expense_id, p_instrument_id);

  return jsonb_build_object('id', v_expense_id);
end;
$$;