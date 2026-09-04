-- Align statutory/tax report invoice recognition with the canonical sales basis used by P&L:
-- issued invoices are recognized unless explicitly cancelled. Unpaid and partial
-- invoices remain issued receivables and must not disappear from reports.

DO $$
declare
  v_ddl text;
begin
  select pg_get_functiondef(p.oid) into v_ddl
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='get_gst_report'
    and pg_get_function_identity_arguments(p.oid)='p_start_date date, p_end_date date'
  limit 1;

  if v_ddl is null then
    raise exception 'get_gst_report(date,date) not found';
  end if;

  v_ddl := regexp_replace(
    v_ddl,
    'status\\s+in\\s*\\(\\s*''completed''(::text)?\\s*,\\s*''paid''(::text)?\\s*\\)',
    'status <> ''cancelled''',
    'gi'
  );
  execute v_ddl;
end $$;

DO $$
declare
  v_ddl text;
begin
  select pg_get_functiondef(p.oid) into v_ddl
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='get_tax_preparation_report'
    and pg_get_function_identity_arguments(p.oid)='p_start_date date, p_end_date date'
  limit 1;

  if v_ddl is null then
    raise exception 'get_tax_preparation_report(date,date) not found';
  end if;

  v_ddl := regexp_replace(
    v_ddl,
    'status\\s+in\\s*\\(\\s*''completed''(::text)?\\s*,\\s*''paid''(::text)?\\s*\\)',
    'status <> ''cancelled''',
    'gi'
  );
  execute v_ddl;
end $$;
