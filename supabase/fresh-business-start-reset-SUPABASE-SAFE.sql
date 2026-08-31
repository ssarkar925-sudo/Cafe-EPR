-- FRESH BUSINESS START — SAFE ZERO-SLATE RESET
-- Supabase / PostgreSQL
--
-- IMPORTANT:
-- 1. Take/keep a backup before running this script.
-- 2. Run this in the SQL Editor of the CORRECT Supabase project.
-- 3. This script resets operational data only.
-- 4. It preserves auth, profiles, masters, catalog/rate cards, payment-account
--    definitions, merchant QR configuration, settings, RPCs, triggers and RLS.
-- 5. Missing tables are skipped safely.
-- 6. The transaction rolls back if any unexpected error occurs.

BEGIN;

-- ============================================================
-- 1. RESET OPERATIONAL / HISTORICAL BUSINESS DATA
-- ============================================================
-- CASCADE is used only on the explicitly approved operational tables.
-- It prevents FK-order failures while preserving referenced master tables.

DO $$
DECLARE
  tbl text;
  operational_tables text[] := ARRAY[
    'public.notification_reads',
    'public.audit_findings',
    'public.audit_runs',
    'public.ai_document_vault',
    'public.ai_audit_snapshots',
    'public.whatsapp_outbox',
    'public.whatsapp_logs',
    'public.saved_contacts',

    'public.return_items',
    'public.returns',
    'public.invoice_items',
    'public.payments',
    'public.invoices',
    'public.quick_sale_items',
    'public.quick_sales',

    'public.purchase_items',
    'public.purchases',
    'public.supplier_ledger',
    'public.stock_movements',

    'public.customer_ledger',
    'public.transactions',
    'public.cash_entries',
    'public.expenses',
    'public.settlements',

    'public.closing_balances',
    'public.closings',
    'public.opening_positions',
    'public.opening_balances',

    'public.audit_logs',

    'public.customers',
    'public.suppliers'
  ];
BEGIN
  FOREACH tbl IN ARRAY operational_tables LOOP
    IF to_regclass(tbl) IS NOT NULL THEN
      EXECUTE format(
        'TRUNCATE TABLE %s RESTART IDENTITY CASCADE',
        to_regclass(tbl)
      );
      RAISE NOTICE 'Reset: %', tbl;
    ELSE
      RAISE NOTICE 'Skipped (table not present): %', tbl;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 2. PRESERVED CATALOG: RESET ONLY LIVE STOCK
-- ============================================================
-- Products/services remain configured; inventory quantity starts at zero.

DO $$
BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    EXECUTE 'UPDATE public.products SET stock_qty = 0';
  END IF;
END $$;

-- ============================================================
-- 3. PRESERVED PAYMENT ACCOUNT DEFINITIONS: ZERO CURRENT BALANCES
-- ============================================================
-- Keeps Cash Drawer / Bank / Debit Card / Credit Card definitions.
-- Credit LIMIT configuration is NOT changed.

DO $$
BEGIN
  IF to_regclass('public.payment_instruments') IS NOT NULL THEN
    EXECUTE 'UPDATE public.payment_instruments SET current_balance = 0';
  END IF;
END $$;

-- ============================================================
-- 4. RESET DOCUMENT NUMBER SEQUENCES
-- ============================================================

ALTER SEQUENCE IF EXISTS public.invoice_number_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.quick_sale_number_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.return_number_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.closing_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.aeps_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.dmt_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.upi_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.settlement_seq RESTART WITH 1;

COMMIT;

-- ============================================================
-- 5. POST-RESET VERIFICATION
-- ============================================================

-- Canonical accounting pool:
SELECT *
FROM public.get_pool_balances();

-- Operational row counts:
SELECT 'transactions' AS table_name, count(*) AS rows FROM public.transactions
UNION ALL
SELECT 'cash_entries', count(*) FROM public.cash_entries
UNION ALL
SELECT 'expenses', count(*) FROM public.expenses
UNION ALL
SELECT 'settlements', count(*) FROM public.settlements
UNION ALL
SELECT 'opening_balances', count(*) FROM public.opening_balances
UNION ALL
SELECT 'opening_positions', count(*) FROM public.opening_positions
UNION ALL
SELECT 'closings', count(*) FROM public.closings
UNION ALL
SELECT 'closing_balances', count(*) FROM public.closing_balances
UNION ALL
SELECT 'invoices', count(*) FROM public.invoices
UNION ALL
SELECT 'payments', count(*) FROM public.payments
UNION ALL
SELECT 'quick_sales', count(*) FROM public.quick_sales
UNION ALL
SELECT 'purchases', count(*) FROM public.purchases
UNION ALL
SELECT 'customer_ledger', count(*) FROM public.customer_ledger
UNION ALL
SELECT 'supplier_ledger', count(*) FROM public.supplier_ledger
UNION ALL
SELECT 'stock_movements', count(*) FROM public.stock_movements
UNION ALL
SELECT 'customers', count(*) FROM public.customers
UNION ALL
SELECT 'suppliers', count(*) FROM public.suppliers
ORDER BY table_name;

-- Preserved configuration checks:
SELECT count(*) AS product_count FROM public.products;
SELECT count(*) AS service_count FROM public.services;
SELECT count(*) AS payment_instrument_count FROM public.payment_instruments;
SELECT count(*) AS merchant_qr_count FROM public.upi_merchant_qrs;
