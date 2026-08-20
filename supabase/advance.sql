-- Allow 'advance' entries in the customer ledger
alter table public.customer_ledger drop constraint if exists customer_ledger_type_check;
alter table public.customer_ledger
  add constraint customer_ledger_type_check
  check (type in ('invoice', 'payment', 'return', 'opening', 'advance'));

-- Record an advance received from a customer (cash in; reduces their balance -> advance).
-- Atomically updates customers.balance + customer_ledger + cash_entries.
-- p_method lets advances be recorded from bank/UPI/card too (defaults to cash).
create or replace function public.record_advance(
  p_customer_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_note text default null,
  p_method text default 'cash'
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance numeric;
  v_name text;
  v_method text;
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
  v_method := coalesce(nullif(p_method, ''), 'cash');
  if v_method not in ('cash', 'upi', 'card', 'bank', 'wallet', 'debit_card', 'credit_card') then
    raise exception 'Invalid payment method';
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
  values (p_entry_date, v_method, 'in', p_amount, 'Advance received from ' || v_name, 'customer_advance', p_customer_id);

  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

-- Return an advance to a customer (cash out; increases their balance).
-- Atomically updates customers.balance + customer_ledger + cash_entries.
create or replace function public.return_advance(
  p_customer_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_note text default null,
  p_method text default 'cash'
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance numeric;
  v_name text;
  v_method text;
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
  v_method := coalesce(nullif(p_method, ''), 'cash');
  if v_method not in ('cash', 'upi', 'card', 'bank', 'wallet', 'debit_card', 'credit_card') then
    raise exception 'Invalid payment method';
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
  values (p_entry_date, v_method, 'out', p_amount, 'Advance returned to ' || v_name, 'customer_advance', p_customer_id);

  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;
