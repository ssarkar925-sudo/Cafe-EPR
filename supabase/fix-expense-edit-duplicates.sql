-- One-time data repair for expenses that were edited with the BUGGY update_expense().
-- That function reversed + reposted the full cash leg on every save, leaving duplicate
-- in/out pairs. They always NETTED to zero (so cash balances / pool positions were
-- already correct), but they inflated the gross cash-book / expense totals.
--
-- This collapses each affected expense's cash_entries down to a SINGLE correct 'out' leg
-- (amount = the expense's current amount, method/instrument/date taken from its latest
-- cash leg). Every collapse is recorded in audit_logs so the action is auditable.
--
-- Idempotent: it only acts on expenses that still have more than one cash entry, so
-- re-running it is a no-op once repaired.
do $$
declare
  r record;
  v_method text;
  v_instrument uuid;
  v_date date;
  v_cnt int;
begin
  if auth.uid() is null then
    raise notice 'Running as service role — audit user_id will be null.';
  end if;

  for r in
    select e.id, e.amount, e.expense_date
    from public.expenses e
    where e.status = 'active'
      and (select count(*) from public.cash_entries ce where ce.ref_type = 'expense' and ce.ref_id = e.id) > 1
  loop
    -- latest cash leg tells us the effective method / instrument / date
    select ce.method, ce.instrument_id, ce.entry_date
      into v_method, v_instrument, v_date
    from public.cash_entries ce
    where ce.ref_type = 'expense' and ce.ref_id = r.id
    order by ce.created_at desc
    limit 1;

    v_cnt := (select count(*) from public.cash_entries ce where ce.ref_type = 'expense' and ce.ref_id = r.id);

    -- remove the duplicate reconciling entries created by the old edit logic
    delete from public.cash_entries ce
    where ce.ref_type = 'expense' and ce.ref_id = r.id;

    -- insert the single correct outflow for this expense
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (
      coalesce(v_date, r.expense_date),
      coalesce(v_method, 'cash'),
      'out',
      r.amount,
      'Expense corrected (collapsed duplicate edits): ' || r.id,
      'expense',
      r.id,
      v_instrument
    );

    insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
    values (
      auth.uid(), null, 'data_repair', 'expenses', r.id::text,
      'Collapsed ' || v_cnt || ' duplicate cash entries into one for expense',
      jsonb_build_object('expense_id', r.id, 'amount', r.amount, 'removed_rows', v_cnt)
    );
  end loop;
end $$;
