-- Run this in Supabase SQL Editor (idempotent).
-- Enable realtime for audit_logs so the notification bell updates instantly.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'audit_logs'
  ) then
    alter publication supabase_realtime add table public.audit_logs;
  end if;
end $$;