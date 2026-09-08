-- Repair the canonical journal posting boundary.
-- Some hardened callers pass account_id while the legacy boundary required account_code.
-- Accept either representation, but always validate against an active accounting account.

create or replace function public.post_journal_entry(
  p_entry_date date,
  p_source_type text,
  p_source_id uuid,
  p_description text,
  p_lines jsonb,
  p_posted_by uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_entry_id uuid;
  v_num text;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_line jsonb;
  v_code text;
  v_account uuid;
  v_account_id_text text;
  v_no int := 0;
begin
  if auth.uid() is null and auth.role() <> 'service_role' then
    raise exception 'Not authenticated';
  end if;
  if auth.role() <> 'service_role' and not public.is_back_office() then
    raise exception 'Forbidden';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Journal requires lines';
  end if;

  if p_source_id is not null then
    select id into v_entry_id
    from public.journal_entries
    where source_type = p_source_type and source_id = p_source_id;
    if v_entry_id is not null then
      return v_entry_id;
    end if;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_total_debit := v_total_debit + round(coalesce((v_line->>'debit')::numeric, 0), 2);
    v_total_credit := v_total_credit + round(coalesce((v_line->>'credit')::numeric, 0), 2);
  end loop;

  if abs(v_total_debit - v_total_credit) > 0.005 then
    raise exception 'Unbalanced journal: debit %, credit %', v_total_debit, v_total_credit;
  end if;
  if v_total_debit <= 0 then
    raise exception 'Journal total must be positive';
  end if;

  v_num := 'JE-' || lpad(nextval('public.journal_entry_seq')::text, 8, '0');
  insert into public.journal_entries(entry_number, entry_date, source_type, source_id, description, posted_by)
  values (v_num, coalesce(p_entry_date, current_date), p_source_type, p_source_id, p_description, p_posted_by)
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no := v_no + 1;
    v_account_id_text := nullif(trim(v_line->>'account_id'), '');
    v_code := nullif(trim(v_line->>'account_code'), '');
    v_account := null;

    if v_account_id_text is not null then
      begin
        v_account := v_account_id_text::uuid;
      exception when invalid_text_representation then
        raise exception 'Invalid accounting account id %', v_account_id_text;
      end;

      select code into v_code
      from public.accounting_accounts
      where id = v_account and is_active;

      if v_code is null then
        raise exception 'Unknown accounting account id %', v_account_id_text;
      end if;
    else
      if v_code is null then
        raise exception 'Unknown accounting account <NULL>';
      end if;

      select id into v_account
      from public.accounting_accounts
      where code = v_code and is_active;

      if v_account is null then
        raise exception 'Unknown accounting account %', v_code;
      end if;
    end if;

    insert into public.journal_lines(
      journal_entry_id, account_id, line_no, debit, credit, description
    )
    values (
      v_entry_id,
      v_account,
      v_no,
      round(coalesce((v_line->>'debit')::numeric, 0), 2),
      round(coalesce((v_line->>'credit')::numeric, 0), 2),
      v_line->>'description'
    );
  end loop;

  return v_entry_id;
end;
$$;

grant execute on function public.post_journal_entry(date, text, uuid, text, jsonb, uuid) to authenticated, service_role;

-- Keep the expense bridge canonical: pass the mapped GL account by account_code.
create or replace function public.post_expense_accounting_bridge()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_payment_code text;
  v_instrument uuid;
  v_expense_account uuid;
  v_expense_code text;
  v_lines jsonb;
begin
  if new.status is not null and lower(new.status) not in ('active', 'posted', 'completed', 'approved') then
    return new;
  end if;

  if exists (
    select 1 from public.journal_entries
    where source_type = 'expense' and source_id = new.id
  ) then
    return new;
  end if;

  select ce.instrument_id into v_instrument
  from public.cash_entries ce
  where ce.ref_type = 'expense'
    and ce.ref_id = new.id
    and ce.direction = 'out'
  order by ce.created_at desc
  limit 1;

  v_payment_code := public.accounting_instrument_account_code(v_instrument);
  if v_payment_code is null then
    raise exception 'Expense % has an unmapped payment instrument', new.id;
  end if;

  v_expense_account := public.resolve_expense_account(new.category);
  if v_expense_account is null then
    raise exception 'Expense % has no resolvable expense account', new.id;
  end if;

  select code into v_expense_code
  from public.accounting_accounts
  where id = v_expense_account and is_active;

  if v_expense_code is null then
    raise exception 'Expense % has an invalid expense account mapping', new.id;
  end if;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', v_expense_code, 'debit', new.amount, 'credit', 0),
    jsonb_build_object('account_code', v_payment_code, 'debit', 0, 'credit', new.amount)
  );

  perform public.post_journal_entry(
    new.expense_date,
    'expense',
    new.id,
    'Expense ' || coalesce(new.category, 'General'),
    v_lines,
    new.created_by
  );

  return new;
end;
$$;
