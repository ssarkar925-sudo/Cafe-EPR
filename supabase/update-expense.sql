-- Edit an expense (audited): reverse the original cash leg using the same account,
-- instrument and date, update the row, then post a fresh cash leg for the new values.
-- Cancelled expenses cannot be edited. Keeps the cash book accurate.
create or replace function public.update_expense(
  p_expense_id uuid,
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
  v_expense record;
  v_orig_method text;
  v_orig_instrument uuid;
  v_orig_date date;
  v_method text := 'cash';
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_category is null or p_category = '' then raise exception 'Category is required'; end if;

  select * into v_expense from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if v_expense.status = 'cancelled' then raise exception 'Cannot edit a cancelled expense'; end if;

  select ce.method, ce.instrument_id, ce.entry_date
    into v_orig_method, v_orig_instrument, v_orig_date
  from public.cash_entries ce
  where ce.ref_type = 'expense' and ce.ref_id = p_expense_id
  order by ce.created_at asc
  limit 1;
  v_orig_method := coalesce(v_orig_method, 'cash');
  v_orig_date := coalesce(v_orig_date, v_expense.expense_date);

  if p_instrument_id is not null then
    select type into v_method from public.payment_instruments where id = p_instrument_id and is_active = true;
    if v_method is null then raise exception 'Unknown payment instrument'; end if;
  elsif p_method is not null then
    v_method := lower(p_method);
    if v_method not in ('cash', 'upi', 'card', 'bank', 'wallet', 'debit_card', 'credit_card') then
      raise exception 'Invalid payment method';
    end if;
  else
    v_method := v_orig_method;
  end if;

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
  values (v_orig_date, v_orig_method, 'in', v_expense.amount, 'Expense edited (reverse): ' || v_expense.category, 'expense', p_expense_id, v_orig_instrument);

  update public.expenses
  set expense_date = p_expense_date, category = p_category, amount = p_amount, note = p_note
  where id = p_expense_id;

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
  values (p_expense_date, v_method, 'out', p_amount, 'Expense edited: ' || p_category, 'expense', p_expense_id, p_instrument_id);

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'expense_updated', 'expenses', p_expense_id::text,
    'Edited expense of ' || p_amount || ' on ' || p_category,
    jsonb_build_object('category', p_category, 'amount', p_amount, 'method', v_method, 'instrument_id', p_instrument_id)
  );

  return jsonb_build_object('id', p_expense_id, 'status', 'active');
end;
$$;
