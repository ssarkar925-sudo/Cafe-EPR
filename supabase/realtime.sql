-- Run this in Supabase SQL Editor (idempotent).
-- Required for Realtime: publish table changes so the UI updates live across devices.

do $$
declare t text;
begin
  foreach t in array array[
    'invoices', 'invoice_items', 'payments', 'products', 'services',
    'customers', 'cash_entries', 'expenses', 'customer_ledger'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;
