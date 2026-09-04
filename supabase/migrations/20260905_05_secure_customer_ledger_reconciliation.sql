create or replace function public.get_customer_ledger_reconciliation(p_customer_id uuid default null)
returns table(
  customer_id uuid,
  customer_name text,
  stored_balance numeric,
  ledger_balance numeric,
  variance numeric,
  ledger_rows bigint,
  status text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.role() <> 'service_role' and current_user <> 'postgres' then
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not public.is_back_office() then raise exception 'Forbidden'; end if;
  end if;

  return query
  with ledger as (
    select cl.customer_id,
           count(*)::bigint as row_count,
           (array_agg(cl.balance_after order by cl.entry_date desc, cl.created_at desc))[1]::numeric as last_balance
    from public.customer_ledger cl
    where p_customer_id is null or cl.customer_id=p_customer_id
    group by cl.customer_id
  )
  select c.id,
         c.name,
         coalesce(c.balance,0)::numeric,
         coalesce(l.last_balance,0)::numeric,
         case when l.customer_id is null then null
              else round(coalesce(c.balance,0)-coalesce(l.last_balance,0),2) end,
         coalesce(l.row_count,0),
         case when l.customer_id is null then 'unseeded'
              when abs(round(coalesce(c.balance,0)-coalesce(l.last_balance,0),2)) <= 0.01 then 'ok'
              else 'mismatch' end
  from public.customers c
  left join ledger l on l.customer_id=c.id
  where c.is_active=true
    and (p_customer_id is null or c.id=p_customer_id)
  order by c.name;
end;
$$;

revoke execute on function public.get_customer_ledger_reconciliation(uuid) from public, anon;
grant execute on function public.get_customer_ledger_reconciliation(uuid) to authenticated, service_role;
