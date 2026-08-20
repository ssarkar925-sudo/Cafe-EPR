-- ============================================================================
-- FACTORY RESET — wipe ALL application data (keep the schema).
-- Tables, RPCs, policies, and the shop schema stay intact; every row is gone.
-- Invoice/transaction/sale/return number sequences restart at 1.
-- All auth users are deleted too (you will need to create a new admin user in
-- Authentication → Users after running this).
--
-- DESTRUCTIVE: run in the Supabase SQL editor (or via the DB connection).
-- ============================================================================

-- 1) Empty every table in the public schema (resets identity columns).
do $$
declare
  r record;
begin
  -- audit_logs is the immutable financial trail: never wiped by a reset.
  for r in select tablename from pg_tables
    where schemaname = 'public' and tablename <> 'audit_logs'
  loop
    execute format('truncate table public.%I restart identity cascade', r.tablename);
  end loop;
end $$;

-- 2) Restart any plain (non-identity) sequences at 1.
do $$
declare
  r record;
begin
  for r in select sequence_name from information_schema.sequences where sequence_schema = 'public'
  loop
    execute format('alter sequence public.%I restart with 1', r.sequence_name);
  end loop;
end $$;

-- 3) Remove uploaded files (shop logo, staff avatars, customer photos).
--    NOTE: Supabase blocks direct SQL deletes on storage tables. Empty the
--    buckets via the Storage API instead (e.g. in the dashboard, or
--    supabase.storage.emptyBucket('logos') with the service role key).
-- delete from storage.objects where bucket_id in ('logos', 'avatars', 'customer-photos');

-- 4) Remove all auth users (profiles, notification reads, etc. cascade / set null).
delete from auth.users;
