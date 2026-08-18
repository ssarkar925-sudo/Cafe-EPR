-- Run this in Supabase SQL Editor (idempotent).
-- Enables realtime for every table the app subscribes to (dashboard, POS, reports, P&L,
-- customers, settlements, audit, notifications). postgres_changes respects RLS.

do $$
declare
  t text;
begin
  foreach t in array array[
    'audit_logs', 'invoices', 'invoice_items', 'payments', 'customers',
    'customer_ledger', 'transactions', 'cash_entries', 'expenses',
    'products', 'services', 'categories', 'settlements',
    'quick_sales', 'quick_sale_items', 'returns', 'return_items', 'payment_instruments'
  ] loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t)
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = t
       ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;