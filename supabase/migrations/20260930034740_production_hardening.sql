-- 20260930 production hardening
-- Non-SAI production safety controls:
-- 1) Prevent public authenticated clients from directly executing trigger helpers.
-- 2) Pin SECURITY DEFINER trigger search_path.
-- 3) Remove unnecessary TRUNCATE privilege from authenticated clients on core ERP tables.
--
-- This migration does not change application data and does not modify SAI objects.

BEGIN;

ALTER FUNCTION public.assign_customer_code() SET search_path = public;
ALTER FUNCTION public.prune_ai_conversations() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.assign_customer_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prune_ai_conversations() FROM PUBLIC, anon, authenticated;

REVOKE TRUNCATE ON TABLE
  public.cash_entries,
  public.customer_ledger,
  public.customers,
  public.invoice_items,
  public.invoices,
  public.payments,
  public.products,
  public.purchase_items,
  public.purchases,
  public.settlements,
  public.stock_movements,
  public.supplier_ledger,
  public.suppliers,
  public.transactions
FROM authenticated;

COMMIT;
