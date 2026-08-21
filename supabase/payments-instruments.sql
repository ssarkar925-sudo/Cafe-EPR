-- Run this in Supabase SQL Editor (idempotent).
-- Payment instruments: named cash/bank/UPI/wallet/debit/credit accounts used at the till.
-- Every POS payment and cash entry can be tagged to one named instrument so reports can
-- break down collections card/bank-wise. Run BEFORE pos.sql/finance.sql on a fresh DB.

create table if not exists public.payment_instruments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('cash', 'bank', 'upi', 'wallet', 'debit_card', 'credit_card')),
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.payment_instruments enable row level security;
drop policy if exists "payment_instruments all" on public.payment_instruments;
create policy "payment_instruments all" on public.payment_instruments for all to authenticated using (true) with check (true);

insert into public.payment_instruments (name, type)
values ('Cash', 'cash')
on conflict (name) do nothing;

-- Payments + cash entries can point at a named instrument.
alter table public.payments add column if not exists instrument_id uuid references public.payment_instruments (id) on delete set null;
alter table public.cash_entries add column if not exists instrument_id uuid references public.payment_instruments (id) on delete set null;
create index if not exists idx_payments_instrument on public.payments (instrument_id);
create index if not exists idx_cash_entries_instrument on public.cash_entries (instrument_id);

-- Widen method checks so bank/wallet/debit_card/credit_card are valid.
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check check (method in ('cash', 'upi', 'card', 'bank', 'wallet', 'debit_card', 'credit_card'));
alter table public.cash_entries drop constraint if exists cash_entries_method_check;
alter table public.cash_entries add constraint cash_entries_method_check check (method in ('cash', 'upi', 'card', 'bank', 'wallet', 'debit_card', 'credit_card', 'dmt', 'aeps'));

-- Atomic sale: invoice + items + stock deduction + payments + customer balance in ONE transaction.
-- Supports collecting a customer's previous due (non-revenue cash-in) and applying a customer's
-- advance (prepaid credit) against the bill. Each payment tags a named payment_instrument;
-- the effective method is derived from the instrument's type.
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
  v_stock numeric;
  v_payment jsonb;
  v_method text;
  v_instrument_id uuid;
  v_cust_balance numeric;
  v_calc_subtotal numeric := 0;
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

  -- Server-side totals: derive subtotal from the item lines. Client-sent p_subtotal /
  -- p_total are never trusted (a tampered client could record any total).
  select coalesce(sum(round(coalesce((v_j->>'amount')::numeric, 0), 2)), 0)
    into v_calc_subtotal
  from jsonb_array_elements(p_items) v_j;

  if p_discount is null or p_discount < 0 then
    raise exception 'Invalid discount';
  end if;
  if p_discount > v_calc_subtotal then
    raise exception 'Discount cannot exceed subtotal';
  end if;

  p_subtotal := round(v_calc_subtotal, 2);
  p_total := round(v_calc_subtotal - p_discount, 2);

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
      'previous_due', p_previous_due,
      'advance_used', p_advance_used
    )
    from public.invoices
    where id = v_invoice_id
  );
end;
$$;

grant usage, select on sequence public.invoice_number_seq to authenticated;