-- Keep only the canonical create_business_txn overload.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='create_business_txn'
      and p.pronargs=30
  loop
    execute 'drop function ' || r.signature || ';';
  end loop;

  select p.oid::regprocedure as signature into r
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='create_business_txn'
    and p.pronargs=31
  limit 1;

  if r.signature is null then
    raise exception 'Canonical create_business_txn function not found';
  end if;

  execute 'revoke execute on function ' || r.signature || ' from public, anon';
  execute 'grant execute on function ' || r.signature || ' to authenticated';
end
$$;
