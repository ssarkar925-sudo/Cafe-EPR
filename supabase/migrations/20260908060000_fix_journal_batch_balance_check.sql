-- Fix journal balance enforcement for canonical multi-line journal posting.
-- Journal lines are assembled row-by-row by post_journal_entry(), while the
-- balance constraint trigger is deferred. The trigger must therefore avoid
-- rejecting the temporary one-sided state during assembly and re-check the
-- final persisted state afterward.

create or replace function public.trg_journal_balance_check()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_d numeric;
  v_c numeric;
  v_journal_id uuid := coalesce(new.journal_entry_id, old.journal_entry_id);
begin
  if current_setting('erp.journal_batch_in_progress', true) = 'on' then
    return null;
  end if;

  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into v_d, v_c
  from public.journal_lines
  where journal_entry_id = v_journal_id;

  if abs(v_d-v_c) > 0.005 then
    raise exception 'Journal entry % is unbalanced: debit %, credit %', v_journal_id, v_d, v_c;
  end if;
  return null;
end;
$$;

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
  v_d numeric := 0;
  v_c numeric := 0;
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
    where source_type = p_source_type and source_id = p_source_id
    limit 1;
    if v_entry_id is not null then
      return v_entry_id;
    end if;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_total_debit := v_total_debit + round(coalesce((v_line->>'debit')::numeric,0),2);
    v_total_credit := v_total_credit + round(coalesce((v_line->>'credit')::numeric,0),2);
  end loop;

  if abs(v_total_debit-v_total_credit) > 0.005 then
    raise exception 'Unbalanced journal: debit %, credit %', v_total_debit, v_total_credit;
  end if;
  if v_total_debit <= 0 then
    raise exception 'Journal total must be positive';
  end if;

  v_num := 'JE-' || lpad(nextval('public.journal_entry_seq')::text,8,'0');
  insert into public.journal_entries(entry_number,entry_date,source_type,source_id,description,posted_by)
  values(v_num,coalesce(p_entry_date,current_date),p_source_type,p_source_id,p_description,p_posted_by)
  returning id into v_entry_id;

  perform set_config('erp.journal_batch_in_progress','on',true);
  begin
    for v_line in select value from jsonb_array_elements(p_lines) loop
      v_no := v_no + 1;
      v_account_id_text := nullif(trim(v_line->>'account_id'),'');
      v_code := nullif(trim(v_line->>'account_code'),'');
      v_account := null;

      if v_account_id_text is not null then
        begin
          v_account := v_account_id_text::uuid;
        exception when invalid_text_representation then
          raise exception 'Invalid accounting account id %', v_account_id_text;
        end;

        select code into v_code
        from public.accounting_accounts
        where id=v_account and is_active;
        if v_code is null then
          raise exception 'Unknown accounting account id %', v_account_id_text;
        end if;
      else
        if v_code is null then
          raise exception 'Unknown accounting account <NULL>';
        end if;
        select id into v_account
        from public.accounting_accounts
        where code=v_code and is_active;
        if v_account is null then
          raise exception 'Unknown accounting account %', v_code;
        end if;
      end if;

      insert into public.journal_lines(
        journal_entry_id,account_id,line_no,debit,credit,description
      ) values(
        v_entry_id,v_account,v_no,
        round(coalesce((v_line->>'debit')::numeric,0),2),
        round(coalesce((v_line->>'credit')::numeric,0),2),
        v_line->>'description'
      );
    end loop;

    select coalesce(sum(debit),0),coalesce(sum(credit),0)
      into v_d,v_c
    from public.journal_lines
    where journal_entry_id=v_entry_id;

    if abs(v_d-v_c)>0.005 then
      raise exception 'Journal entry % is unbalanced: debit %, credit %',v_entry_id,v_d,v_c;
    end if;
    if v_d<=0 then
      raise exception 'Journal entry % has no positive debit total',v_entry_id;
    end if;

    perform set_config('erp.journal_batch_in_progress','off',true);
  exception when others then
    perform set_config('erp.journal_batch_in_progress','off',true);
    raise;
  end;

  return v_entry_id;
end;
$$;

grant execute on function public.post_journal_entry(date,text,uuid,text,jsonb,uuid) to authenticated,service_role;
