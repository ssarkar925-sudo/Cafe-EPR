-- Run this in Supabase SQL Editor (idempotent).
-- Quick Sale: fast cash-register style sales for walk-in/local customers — no full invoice.
-- A sale is one or more items (service/product/custom) + named payment instrument.
-- Cost is derived SERVER-SIDE from the catalog cost_price so cashiers never send cost.
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
  cost numeric(15,2) not null default 0 check (cost >= 0)
);
create index if not exists idx_quick_sale_items_sale on public.quick_sale_items (quick_sale_id);

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