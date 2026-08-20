-- Run this in Supabase SQL Editor (idempotent).
-- The AEPS / DMT / UPI Transactions module lives in business.sql (table, RLS,
-- create/update/reverse/delete_business_txn, cash entry posting). This file only
-- keeps the realtime publication for the transactions table.
-- NOTE: legacy create_txn / cancel_txn RPCs were removed (superseded by
-- create_business_txn / reverse_business_txn / delete_business_txn).

-- Publish to realtime (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and c.relname = 'transactions'
      and n.nspname = 'public'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;
end $$;