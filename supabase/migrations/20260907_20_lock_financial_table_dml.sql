-- Financial records are mutated only through audited SECURITY DEFINER RPCs.
-- Keep SELECT access unchanged; remove direct row-level mutation from client roles.
revoke insert, update, delete on table public.transactions from anon, authenticated;
revoke insert, update, delete on table public.cash_entries from anon, authenticated;
revoke insert, update, delete on table public.customer_ledger from anon, authenticated;
revoke insert, update, delete on table public.expenses from anon, authenticated;
revoke insert, update, delete on table public.payments from anon, authenticated;
revoke insert, update, delete on table public.invoices from anon, authenticated;
