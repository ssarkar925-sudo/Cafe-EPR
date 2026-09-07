# CafeERP Financial Remediation — Final Engineering Gate

## Production baseline

- Project: `tvxehxnvuwojjbhysajp`
- Production migration count: 262
- Latest production migration: `20260906173737_allow_due_only_transaction_collection`
- Approved remediation: `20260907_01_controlled_financial_remediation.sql`
- Approved SHA-256: `8dd84fb143c60878324bd37a91f1c6f5785ee2f7376f341f`
- Rejected migration: `20260907_02_historical_batch_correction.sql`

## Remaining deployment gate

The production migration history intentionally differs from the local 74-file migration tree, so normal `supabase db push` is not approved for the financial release.

The approved 01 migration is a separate controlled release artifact. After it is executed successfully, migration history must be recorded only after the database actually contains the resulting objects.

## Database boundary hardening

The release also requires client roles to be unable to write directly to core append-only financial ledgers. Financial mutations must occur through authorized server-side functions.

The affected tables are:

- transactions
- invoices
- invoice_items
- quick_sales
- quick_sale_items
- payments
- cash_entries
- customer_ledger
- stock_movements
- journal_entries
- journal_lines
- settlements

Anonymous execution is also removed from sensitive DMT/edit/recharge RPC overloads.

## Certification rule

A balanced trial balance alone is not certification. Certification requires:

1. backup/snapshot;
2. exact approved SQL execution;
3. catalog, privilege and RLS verification;
4. request-level idempotency replay/conflict/concurrency tests;
5. reversal/cancellation tests;
6. operational-to-GL reconciliation;
7. report reconciliation.

Until those live gates pass, production remains `NOT CERTIFIED — DEPLOYMENT FROZEN`.
