-- ============================================================================
-- FRESH START — wipe all business data, keep staff login (auth + profiles).
-- The schema, tables, RPCs, and policies stay intact; the opening balance
-- module works as-is so you can enter fresh opening balances immediately.
--
-- DESTRUCTIVE + IRREVERSIBLE. Run in the Supabase SQL editor of project
-- tvxehxnvuwojjbhysajp. RECOMMENDED: take a backup first
-- (Project Settings -> Database -> Backups).
-- ============================================================================

-- 1) Truncate all business data. Explicit list, no cascade: fails loudly instead
--    of wiping anything unexpected. Keeps: profiles, avatars, logos,
--    login_attempts, auth.users (your staff login stays intact).
truncate table
  public.notification_reads,
  public.audit_logs,
  public.closing_balances,
  public.closings,
  public.opening_balances,
  public.settlements,
  public.return_items,
  public.returns,
  public.quick_sale_items,
  public.quick_sales,
  public.payments,
  public.invoice_items,
  public.invoices,
  public.customer_ledger,
  public.cash_entries,
  public.expenses,
  public.transactions,
  public.payment_instruments,
  public.customers,
  public.products,
  public.services,
  public.categories,
  public.brands,
  public.units,
  public.payment_methods,
  public.aeps_banks,
  public.aeps_portals,
  public.upi_merchant_qrs
restart identity;

-- 2) Restart every numbering sequence at 1, so the first invoice of the fresh
--    run is INV-1, the first transaction TXN-1, the first closing CLS-1, etc.
alter sequence public.invoice_number_seq restart with 1;
alter sequence public.quick_sale_number_seq restart with 1;
alter sequence public.return_number_seq restart with 1;
alter sequence public.closing_seq restart with 1;
alter sequence public.aeps_seq restart with 1;
alter sequence public.dmt_seq restart with 1;
alter sequence public.upi_seq restart with 1;
alter sequence public.settlement_seq restart with 1;

-- 3) Re-seed the default shop settings row (Settings panel reads id = 1).
insert into public.settings (id, shop_name) values (1, 'SCC OMM Cafe')
on conflict (id) do nothing;

-- 4) Re-seed the standard payment methods (POS / Quick Sale offer these).
insert into public.payment_methods (method, label, sort_order)
values
  ('cash', 'Cash', 1),
  ('card', 'Card', 2),
  ('bank', 'Bank', 3),
  ('upi', 'UPI', 4),
  ('wallet', 'Wallet', 5),
  ('debit_card', 'Debit Card', 6),
  ('credit_card', 'Credit Card', 7)
on conflict (method) do update set label = excluded.label, sort_order = excluded.sort_order;

-- 5) Uploaded files (shop logo, staff avatars, customer photos) live in Storage,
--    not in the tables above. If you also want those cleared, empty the buckets
--    in the dashboard: Storage -> logos / avatars / customer-photos -> empty.
--    Do NOT uncomment the line below; Supabase rejects direct SQL deletes on
--    storage.objects from the SQL editor.
-- delete from storage.objects;
