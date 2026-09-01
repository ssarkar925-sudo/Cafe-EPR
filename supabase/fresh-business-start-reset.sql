-- ============================================================================
-- FRESH BUSINESS START — CONTROLLED ZERO-SLATE RESET
-- Target Project: https://tvxehxnvuwojjbhysajp.supabase.co
-- Checkpoint Commit: 430b56fcd86a0c4f63f6cb19305010311e3b239e
--
-- Objective:
-- 1. Wipe ONLY operational business activity (invoices, sales, purchases,
--    transactions, cash entries, ledger, customer due, opening/closing snapshots).
-- 2. Preserve ALL master catalogs, services, product rate cards, bank lists,
--    portal gateways, real merchant QRs (9339987644@upi), and auth profiles.
-- 3. Set actual inventory quantities to 0.
-- 4. Set payment account operational current balances to 0 while preserving
--    account definitions, linked bank/debit-card mappings, and credit limits.
-- 5. Restart document sequences at 1 for clean new-business numbering.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- STEP 1: TRUNCATE OPERATIONAL BUSINESS DATA (Strict Leaf-to-Root Order)
-- ----------------------------------------------------------------------------

-- A. Notifications & AI / Audit Runs
TRUNCATE TABLE IF EXISTS public.notification_reads;
TRUNCATE TABLE IF EXISTS public.audit_findings CASCADE;
TRUNCATE TABLE IF EXISTS public.audit_runs CASCADE;
TRUNCATE TABLE IF EXISTS public.ai_document_vault;
TRUNCATE TABLE IF EXISTS public.whatsapp_outbox;
TRUNCATE TABLE IF EXISTS public.whatsapp_logs;
TRUNCATE TABLE IF EXISTS public.saved_contacts;

-- B. Sales, Invoices, Returns & Payments
TRUNCATE TABLE IF EXISTS public.return_items CASCADE;
TRUNCATE TABLE IF EXISTS public.returns CASCADE;
TRUNCATE TABLE IF EXISTS public.invoice_items CASCADE;
TRUNCATE TABLE IF EXISTS public.payments CASCADE;
TRUNCATE TABLE IF EXISTS public.invoices CASCADE;
TRUNCATE TABLE IF EXISTS public.quick_sale_items CASCADE;
TRUNCATE TABLE IF EXISTS public.quick_sales CASCADE;

-- C. Purchases & Inventory Movements
TRUNCATE TABLE IF EXISTS public.purchase_items CASCADE;
TRUNCATE TABLE IF EXISTS public.purchases CASCADE;
TRUNCATE TABLE IF EXISTS public.supplier_ledger CASCADE;
TRUNCATE TABLE IF EXISTS public.stock_movements CASCADE;

-- D. Customer Ledgers & Business Service Transactions
TRUNCATE TABLE IF EXISTS public.customer_ledger CASCADE;
TRUNCATE TABLE IF EXISTS public.transactions CASCADE;
TRUNCATE TABLE IF EXISTS public.cash_entries CASCADE;
TRUNCATE TABLE IF EXISTS public.expenses CASCADE;
TRUNCATE TABLE IF EXISTS public.settlements CASCADE;

-- E. Financial Day Closings & Prior Opening Balances
TRUNCATE TABLE IF EXISTS public.closing_balances CASCADE;
TRUNCATE TABLE IF EXISTS public.closings CASCADE;
TRUNCATE TABLE IF EXISTS public.opening_balances CASCADE;

-- F. Demo CRM & Supplier Contacts
TRUNCATE TABLE IF EXISTS public.customers CASCADE;
TRUNCATE TABLE IF EXISTS public.suppliers CASCADE;

-- ----------------------------------------------------------------------------
-- STEP 2: RESET INVENTORY QUANTITIES (Preserve Products & Pricing)
-- ----------------------------------------------------------------------------
-- Deliberate maintenance exception: this script has already cleared the
-- inventory ledger and now resets the matching stock snapshot.
SELECT set_config('erp.internal_stock_mutation_authorized', 'on', true);
UPDATE public.products SET stock_qty = 0, updated_at = now();

-- ----------------------------------------------------------------------------
-- STEP 3: RESET PAYMENT INSTRUMENT CURRENT BALANCES (Preserve Definitions & Limits)
-- ----------------------------------------------------------------------------
UPDATE public.payment_instruments
SET current_balance = 0,
    updated_at = now()
WHERE current_balance IS NOT NULL;

-- ----------------------------------------------------------------------------
-- STEP 4: RESTART DOCUMENT NUMBER SEQUENCES AT 1
-- ----------------------------------------------------------------------------
ALTER SEQUENCE IF EXISTS public.invoice_number_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.quick_sale_number_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.return_number_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.closing_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.aeps_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.dmt_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.upi_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.settlement_seq RESTART WITH 1;

COMMIT;
