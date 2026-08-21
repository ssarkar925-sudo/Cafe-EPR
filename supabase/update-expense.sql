-- Edit an expense (audited). To avoid duplicating cash-book entries on every edit:
--  * if the payment method is UNCHANGED, post only the DELTA (new amount - amount already
--    posted) as a single cash entry. No-op saves post nothing.
--  * if the payment method CHANGED, cleanly reverse the old full amount and post the new.
-- Cancelled expenses cannot be edited.
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
  v_old_net numeric := 0;
  v_delta numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_category is null or p_category = '' then raise exception 'Category is required'; end if;

  select * into v_expense from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if v_expense.status = 'cancelled' then raise exception 'Cannot edit a cancelled expense'; end if;

  -- Net cash effect already posted for this expense (out - in).
  select coalesce(sum(case when ce.direction = 'out' then ce.amount else -ce.amount end), 0)
    into v_old_net
  from public.cash_entries ce
  where ce.ref_type = 'expense' and ce.ref_id = p_expense_id;

  -- Method/instrument/date of the most recent outflow leg (used if method changes).
  select ce.method, ce.instrument_id, ce.entry_date
    into v_orig_method, v_orig_instrument, v_orig_date
  from public.cash_entries ce
  where ce.ref_type = 'expense' and ce.ref_id = p_expense_id and ce.direction = 'out'
  order by ce.created_at desc
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

  if v_method = v_orig_method then
    -- Same account: post only the delta so the cash book isn't cluttered with
    -- reverse+repost pairs on every edit.
    v_delta := round(p_amount - v_old_net, 2);
    if v_delta <> 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (
        p_expense_date, v_method,
        case when v_delta > 0 then 'out' else 'in' end,
        abs(v_delta),
        'Expense edited: ' || p_category, 'expense', p_expense_id, p_instrument_id
      );
    end if;
  else
    -- Payment method changed: reverse the old full amount, then post the new.
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (v_orig_date, v_orig_method, 'in', v_old_net, 'Expense edited (reverse): ' || v_expense.category, 'expense', p_expense_id, v_orig_instrument);

    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (p_expense_date, v_method, 'out', p_amount, 'Expense edited: ' || p_category, 'expense', p_expense_id, p_instrument_id);
  end if;

  update public.expenses
  set expense_date = p_expense_date, category = p_category, amount = p_amount, note = p_note
  where id = p_expense_id;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'expense_updated', 'expenses', p_expense_id::text,
    'Edited expense of ' || p_amount || ' on ' || p_category,
    jsonb_build_object('category', p_category, 'amount', p_amount, 'method', v_method, 'instrument_id', p_instrument_id)
  );

  return jsonb_build_object('id', p_expense_id, 'status', 'active');
end;
$$;
