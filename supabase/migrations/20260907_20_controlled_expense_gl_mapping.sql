-- Controlled expense category -> GL mapping.
-- Historical expense journals are intentionally unchanged.

create table if not exists public.expense_category_account_map (
  id uuid primary key default gen_random_uuid(),
  category_key text not null,
  account_id uuid not null references public.accounting_accounts(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category_key)
);

insert into public.expense_category_account_map (category_key, account_id)
select v.category_key, a.id
from (values ('general'), ('shopping'), ('money out')) v(category_key)
join public.accounting_accounts a on a.code = '6000'
on conflict (category_key) do update
set account_id = excluded.account_id, active = true;

create or replace function public.resolve_expense_account(p_category text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select m.account_id
       from public.expense_category_account_map m
      where m.active
        and lower(trim(m.category_key)) = lower(trim(coalesce(p_category, 'general')))
      limit 1),
    (select id from public.accounting_accounts where code = '6000' limit 1)
  );
$$;

revoke all on public.expense_category_account_map from anon, authenticated;
grant execute on function public.resolve_expense_account(text) to authenticated, service_role;
alter table public.expense_category_account_map enable row level security;

create or replace function public.post_expense_accounting_bridge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_expense_account uuid;
  v_expense_code text;
  v_instrument uuid;
  v_lines jsonb;
begin
  if new.status is not null and lower(new.status) not in ('active','posted','completed','approved') then
    return new;
  end if;
  if exists(select 1 from public.journal_entries where source_type='expense' and source_id=new.id) then
    return new;
  end if;

  select ce.instrument_id
    into v_instrument
    from public.cash_entries ce
   where ce.ref_type='expense'
     and ce.ref_id=new.id
     and ce.direction='out'
   order by ce.created_at desc
   limit 1;

  v_code := accounting_instrument_account_code(v_instrument);
  if v_code is null then
    raise exception 'Expense % has an unmapped payment instrument', new.id;
  end if;

  v_expense_account := public.resolve_expense_account(new.category);
  select code into v_expense_code from public.accounting_accounts where id = v_expense_account;
  if v_expense_account is null or v_expense_code is null then
    raise exception 'Expense % has no valid GL account mapping', new.id;
  end if;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code',v_expense_code,'debit',new.amount,'credit',0),
    jsonb_build_object('account_code',v_code,'debit',0,'credit',new.amount)
  );

  perform public.post_journal_entry(
    new.expense_date,
    'expense',
    new.id,
    'Expense ' || coalesce(new.category,'General'),
    v_lines,
    new.created_by
  );
  return new;
end;
$$;

-- Keep the mapping table private; callers use the SECURITY DEFINER resolver.
