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
  customer_id uuid not null references public.customers (id) on delete restrict,
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
create index if not exists cash_entries_method_idx on public.cash_entries (method);
create index if not exists cash_entries_ref_idx on public.cash_entries (ref_type, ref_id);
create index if not exists idx_customer_ledger_customer on public.customer_ledger (customer_id);

alter table public.expenses enable row level security;
alter table public.cash_entries enable row level security;
alter table public.customer_ledger enable row level security;

drop policy if exists "expenses select" on public.expenses;
create policy "expenses select" on public.expenses for select to authenticated using (public.is_back_office());
drop policy if exists "expenses insert" on public.expenses;
create policy "expenses insert" on public.expenses for insert to authenticated with check (public.is_back_office());
drop policy if exists "expenses update" on public.expenses;
create policy "expenses update" on public.expenses for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "cash_entries select" on public.cash_entries;
create policy "cash_entries select" on public.cash_entries for select to authenticated using (public.is_back_office());
drop policy if exists "cash_entries insert" on public.cash_entries;
create policy "cash_entries insert" on public.cash_entries for insert to authenticated with check (public.is_back_office());
drop policy if exists "cash_entries update" on public.cash_entries;
create policy "cash_entries update" on public.cash_entries for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "customer_ledger select" on public.customer_ledger;
create policy "customer_ledger select" on public.customer_ledger for select to authenticated using (public.is_back_office());
drop policy if exists "customer_ledger insert" on public.customer_ledger;
create policy "customer_ledger insert" on public.customer_ledger for insert to authenticated with check (public.is_back_office());
drop policy if exists "customer_ledger update" on public.customer_ledger;
create policy "customer_ledger update" on public.customer_ledger for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

-- Sale now writes cash entries + customer ledger atomically.
-- Supports collecting a customer's previous due (non-revenue cash-in) and applying a customer's
-- advance (prepaid credit) against the bill. Totals/items/payments are validated server-side.
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
  -- Server-side validation of client-trusted math
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No items in invoice';
  end if;
  if p_subtotal is null or p_discount is null or p_total is null then
    raise exception 'Invoice totals are required';
  end if;
  if p_subtotal < 0 or p_discount < 0 or p_total < 0 then
    raise exception 'Invalid invoice totals';
  end if;
  if p_discount > p_subtotal then
    raise exception 'Discount exceeds subtotal';
  end if;
  if round(p_subtotal - p_discount, 2) <> round(p_total, 2) then
    raise exception 'Total must equal subtotal minus discount';
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
    if v_qty is null or v_qty <= 0 then raise exception 'Invalid item quantity'; end if;
    if v_rate is null or v_rate < 0 then raise exception 'Invalid item rate'; end if;
    if v_amount is null or v_amount < 0 then raise exception 'Invalid item amount'; end if;
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
    if coalesce((v_payment->>'amount')::numeric, 0) < 0 then
      raise exception 'Invalid payment amount';
    end if;
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

-- Extend add_expense so Money Out / bill payments can be tagged to a named instrument
-- (bank/UPI/wallet/card) or a generic method. Defaults to cash for the existing
-- Finance -> Expenses flow. Every expense is audited server-side.
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
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
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

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'expense_added', 'expenses', v_expense_id::text,
    'Expense of ' || p_amount || ' on ' || p_category || ' paid from ' || v_method,
    jsonb_build_object('category', p_category, 'amount', p_amount, 'method', v_method, 'instrument_id', p_instrument_id)
  );

  return jsonb_build_object('id', v_expense_id);
end;
$$;

-- Cancel an expense (audited, no delete): reverses the cash entry using the SAME account,
-- instrument and date the expense was originally posted from, so the cash book stays correct.
create or replace function public.cancel_expense(p_expense_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_expense record;
  v_orig_method text;
  v_orig_instrument uuid;
  v_orig_date date;
  v_method text;
  v_date date;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select * into v_expense from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if v_expense.status = 'cancelled' then raise exception 'Expense already cancelled'; end if;

  select ce.method, ce.instrument_id, ce.entry_date
    into v_orig_method, v_orig_instrument, v_orig_date
  from public.cash_entries ce
  where ce.ref_type = 'expense' and ce.ref_id = p_expense_id
  order by ce.created_at desc
  limit 1;

  v_method := coalesce(v_orig_method, 'cash');
  v_date := coalesce(v_orig_date, v_expense.expense_date);

  update public.expenses
  set status = 'cancelled', cancelled_at = now()
  where id = p_expense_id;

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
  values (v_date, v_method, 'in', v_expense.amount, 'Expense cancelled: ' || v_expense.category, 'expense', p_expense_id, v_orig_instrument);

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'expense_cancelled', 'expenses', p_expense_id::text,
    'Cancelled expense of ' || v_expense.amount || ' on ' || v_expense.category,
    jsonb_build_object('category', v_expense.category, 'amount', v_expense.amount)
  );

  return jsonb_build_object('id', p_expense_id, 'status', 'cancelled');
end;
$$;
