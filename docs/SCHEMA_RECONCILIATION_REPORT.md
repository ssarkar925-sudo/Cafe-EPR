# Schema Reconciliation Report — repo DDL vs production
Project: `tvxehxnvuwojjbhysajp` (ap-south-1, PG 17.6) · Date: 2026-09-20
Scope: READ-ONLY recovery & reconciliation. No reset/TRUNCATE/DELETE/DROP/live modification performed.
Status: **PASS (Schema Dump & Canonical Reconciliation Completed; Migration Prepared)**

---

## 1. Production Dump Extraction & Verification

The production schema-only extraction was executed and verified on 2026-09-20:

- **Source**: `tvxehxnvuwojjbhysajp` via Supabase session pooler (`aws-0-ap-south-1.pooler.supabase.com:5432`)
- **pg_dump Version**: PostgreSQL 18.4 client against PostgreSQL 17.6 server
- **Output File**: `supabase/prod_schema_public_20260920.sql`
- **File Size**: 841,377 bytes (841 KB)
- **Safety**: Local PowerShell masked input (`Read-Host -AsSecureString`), credentials retained in-memory only and cleared immediately. Dump file added to `.gitignore`.
- **Database Object Counts Confirmed in Dump**:
  - **Tables**: 66 tables in schema `public` (65 previously in repo DDL + exactly 1 missing: `public.transactions`)
  - **Functions**: 203 distinct functions
  - **Triggers**: 70 triggers (22 attached directly to `public.transactions`)
  - **Policies**: 167 row security policies (4 on `public.transactions`)
  - **Indexes**: 172 indexes (18 on `public.transactions`)
  - **Views**: 9 views (`accounting_balance_sheet`, `accounting_general_ledger`, `accounting_profit_loss`, `accounting_transaction_register`, `accounting_trial_balance`, `active_journal_source_violations`, `journal_effective_sources`, `payment_account_balance_audit`, `trial_balance`)

---

## 2. Canonical `public.transactions` Definition (Confirmed Live)

All unknown properties from initial forensic analysis are now **100% CONFIRMED from production DDL**:

### 2.1 Primary Key & Uniqueness
- **Primary Key**: `CONSTRAINT transactions_pkey PRIMARY KEY (id)`
- **Unique Constraints**:
  - `CONSTRAINT transactions_transaction_number_key UNIQUE (transaction_number)`
  - `CREATE UNIQUE INDEX transactions_reference_uq ON public.transactions USING btree (reference) WHERE (reference IS NOT NULL)`

### 2.2 Columns & Types (66 Columns Total)
| Column | Type | Nullable | Default / Expression | Notes / Origin |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary Key |
| `transaction_number` | text | NOT NULL | None | Unique constraint enforced |
| `service_type` | text | NOT NULL | None | Checked against 10 allowed types |
| `direction` | text | NOT NULL | None | Checked: `'in'` or `'out'` |
| `transaction_date` | date | NOT NULL | `CURRENT_DATE` | Indexed DESC |
| `customer_id` | uuid | YES | None | FK `customers(id) ON DELETE SET NULL` |
| `customer_name` | text | YES | None | Out-of-band / legacy column |
| `phone` | text | YES | None | Out-of-band / legacy column |
| `aadhaar_last4` | text | YES | None | Base AEPS / DMT |
| `bank_name` | text | YES | None | Out-of-band / legacy column |
| `account_last4` | text | YES | None | Out-of-band / legacy column |
| `reference` | text | YES | None | Unique where not null |
| `amount` | numeric(15,2) | NOT NULL | None | Checked `> 0` |
| `commission` | numeric(15,2) | NOT NULL | `0` | Checked `>= 0` |
| `status` | text | NOT NULL | `'pending'` | Checked: `success`, `pending`, `failed`, `reversed`, `deleted` |
| `created_by` | uuid | YES | None | FK `profiles(id) ON DELETE SET NULL` |
| `cancelled_at` | timestamptz | YES | None | Out-of-band / legacy column |
| `cancelled_by` | uuid | YES | None | Out-of-band / legacy FK `auth.users(id) ON DELETE SET NULL` |
| `created_at` | timestamptz | YES | `now()` | Base timestamp |
| `customer_mobile` | text | YES | None | Added via `business.sql` |
| `bank_id` | uuid | YES | None | FK `aeps_banks(id) ON DELETE SET NULL` |
| `portal_id` | uuid | YES | None | FK `aeps_portals(id) ON DELETE SET NULL` |
| `merchant_qr_id` | uuid | YES | None | FK `upi_merchant_qrs(id) ON DELETE SET NULL` |
| `transfer_method` | text | YES | None | Checked: `bank_account`, `upi` |
| `sender_name` | text | YES | None | DMT sender |
| `sender_mobile` | text | YES | None | DMT sender mobile |
| `beneficiary_name` | text | YES | None | DMT beneficiary |
| `beneficiary_mobile`| text | YES | None | DMT beneficiary mobile |
| `beneficiary_bank` | text | YES | None | DMT beneficiary bank |
| `beneficiary_ifsc` | text | YES | None | DMT beneficiary IFSC |
| `beneficiary_account`| text | YES | None | DMT beneficiary account |
| `upi_id` | text | YES | None | UPI ID |
| `service_fee` | numeric(15,2) | NOT NULL | `0` | Fee charged to customer |
| `portal_commission`| numeric(15,2) | NOT NULL | `0` | Commission earned from portal |
| `remarks` | text | YES | None | Operator remarks |
| `reversed_at` | timestamptz | YES | None | Audit timestamp |
| `reversed_by` | uuid | YES | None | FK `auth.users(id) ON DELETE SET NULL` |
| `deleted_at` | timestamptz | YES | None | Soft delete timestamp |
| `deleted_by` | uuid | YES | None | FK `auth.users(id) ON DELETE SET NULL` |
| `updated_at` | timestamptz | YES | `now()` | Updated timestamp |
| `transaction_timestamp`| timestamptz| YES | None | Transaction business timestamp |
| `fee_source` | text | YES | None | Checked allowed fee sources |
| `paid_from` | text | YES | None | Checked: `'bank'`, `'portal'` |
| `customer_pay_method`| text | YES | None | Checked allowed payment methods |
| `cash_out` | numeric(15,2) | NOT NULL | `0` | Financial money leg |
| `cash_in` | numeric(15,2) | NOT NULL | `0` | Financial money leg |
| `bank_out` | numeric(15,2) | NOT NULL | `0` | Financial money leg |
| `bank_in` | numeric(15,2) | NOT NULL | `0` | Financial money leg |
| `pool_out` | numeric(15,2) | NOT NULL | `0` | Financial money leg |
| `pool_credit` | numeric(15,2) | NOT NULL | `0` | Financial money leg |
| `pool_credit_type` | text | YES | None | Financial classification |
| `upi_fee` | numeric(15,2) | NOT NULL | `0` | Financial money leg |
| `provider_id` | uuid | YES | None | FK `recharge_providers(id) ON DELETE SET NULL` |
| `instrument_id` | uuid | YES | None | FK `payment_instruments(id) ON DELETE SET NULL` |
| `pay_from_instrument_id`| uuid | YES | None | FK `payment_instruments(id) ON DELETE SET NULL` |
| `pay_from_method` | text | YES | `'bank'` | Payment routing |
| `receiver_name` | text | YES | None | UPI receiver name |
| `portal_charge` | numeric | NOT NULL | `0` | Portal fee |
| `service_id` | uuid | YES | None | FK `services(id) ON DELETE RESTRICT` |
| `subservice_id` | uuid | YES | None | FK `services(id) ON DELETE RESTRICT` |
| `total_amount` | numeric | YES | `GENERATED ALWAYS AS (amount) STORED` | **Confirmed Generated Expression** |
| `customer_collected_amount`| numeric| NOT NULL | `0` | Partial payment collection |
| `customer_due_amount`| numeric | NOT NULL | `0` | Customer receivable balance |
| `customer_collection_method`| text| YES | None | Split payment collection method |
| `customer_collection_instrument_id`| uuid| YES | None | Split payment collection instrument |
| `customer_payment_allocations`| jsonb| NOT NULL | `'[]'::jsonb` | **Confirmed Type & Default** |

### 2.3 Outbound Foreign Keys (13 Enforced)
- `transactions_bank_id_fkey`: `REFERENCES aeps_banks(id) ON DELETE SET NULL`
- `transactions_cancelled_by_fkey`: `REFERENCES auth.users(id) ON DELETE SET NULL`
- `transactions_created_by_fkey`: `REFERENCES profiles(id) ON DELETE SET NULL` *(Resolved: references profiles, not auth.users)*
- `transactions_customer_id_fkey`: `REFERENCES customers(id) ON DELETE SET NULL`
- `transactions_deleted_by_fkey`: `REFERENCES auth.users(id) ON DELETE SET NULL`
- `transactions_instrument_id_fkey`: `REFERENCES payment_instruments(id) ON DELETE SET NULL`
- `transactions_merchant_qr_id_fkey`: `REFERENCES upi_merchant_qrs(id) ON DELETE SET NULL`
- `transactions_pay_from_instrument_id_fkey`: `REFERENCES payment_instruments(id) ON DELETE SET NULL`
- `transactions_portal_id_fkey`: `REFERENCES aeps_portals(id) ON DELETE SET NULL`
- `transactions_provider_id_fkey`: `REFERENCES recharge_providers(id) ON DELETE SET NULL`
- `transactions_reversed_by_fkey`: `REFERENCES auth.users(id) ON DELETE SET NULL`
- `transactions_service_id_fkey`: `REFERENCES services(id) ON DELETE RESTRICT`
- `transactions_subservice_id_fkey`: `REFERENCES services(id) ON DELETE RESTRICT`

### 2.4 Inbound Foreign Keys
- **NONE**: Zero external tables enforce a foreign key reference into `public.transactions`. Downstream linkages in `cash_entries` and `journal_entries` are logical references (`ref_type`/`ref_id` and `source_type`/`source_id`).

### 2.5 Indexes (18 Confirmed)
1. `idx_transactions_customer_collection_instrument` (customer_collection_instrument_id)
2. `idx_transactions_pay_from_instrument` (pay_from_instrument_id)
3. `transactions_bank_idx` (bank_id)
4. `transactions_cancelled_by_idx` (cancelled_by)
5. `transactions_created_by_idx` (created_by)
6. `transactions_customer_idx` (customer_id)
7. `transactions_date_idx` (transaction_date DESC)
8. `transactions_deleted_by_idx` (deleted_by)
9. `transactions_instrument_id_idx` (instrument_id)
10. `transactions_merchant_qr_idx` (merchant_qr_id)
11. `transactions_portal_idx` (portal_id)
12. `transactions_provider_id_idx` (provider_id)
13. `transactions_reference_uq` (reference) WHERE reference IS NOT NULL *(UNIQUE)*
14. `transactions_reversed_by_idx` (reversed_by)
15. `transactions_service_id_idx` (service_id)
16. `transactions_service_idx` (service_type)
17. `transactions_status_idx` (status)
18. `transactions_subservice_id_idx` (subservice_id)

### 2.6 Row Level Security & Policies (4 Confirmed)
RLS is `ENABLED`. Production employs tightened policies restricting direct modifications and channeling writes through audited RPCs:
- `"transactions insert denied"`: `FOR INSERT TO authenticated WITH CHECK (false)`
- `"transactions insert google play backoffice"`: `FOR INSERT TO authenticated WITH CHECK (...)`
- `"transactions select"`: `FOR SELECT TO authenticated USING (public.is_back_office())`
- `"transactions update denied"`: `FOR UPDATE TO authenticated USING (false) WITH CHECK (false)`

### 2.7 Triggers (22 Confirmed Attached)
- **Constraint Triggers (2)**:
  - `trg_post_service_transaction_accounting_bridge` (AFTER INSERT, DEFERRABLE INITIALLY DEFERRED)
  - `trg_validate_service_transaction_money_trail` (AFTER INSERT OR UPDATE, DEFERRABLE INITIALLY DEFERRED)
- **Row-Level Triggers (20)**:
  - `trg_000_a_upi_qr_binding` (BEFORE INSERT OR UPDATE)
  - `trg_000_normalize_google_play_funding` (BEFORE INSERT OR UPDATE OF service_type, status, instrument_id, pay_from_instrument_id)
  - `trg_000_normalize_transaction_fee_source` (BEFORE INSERT OR UPDATE)
  - `trg_000_resolve_transaction_payment_instruments` (BEFORE INSERT OR UPDATE)
  - `trg_000_sync_customer_due` (AFTER UPDATE OF customer_id, customer_due_amount, status)
  - `trg_001_google_play_bank_out` (BEFORE INSERT OR UPDATE OF pool_out, instrument_id, pay_from_instrument_id, service_type)
  - `trg_001_sync_service_transaction_money_legs` (AFTER INSERT)
  - `trg_block_posted_transaction_financial_delete` (BEFORE DELETE)
  - `trg_block_posted_transaction_financial_update` (BEFORE UPDATE)
  - `trg_enforce_online_service_funding_account` (BEFORE INSERT OR UPDATE OF service_type, instrument_id, pay_from_instrument_id)
  - `trg_enforce_transaction_money_instrument` (BEFORE INSERT OR UPDATE)
  - `trg_mark_nested_transaction_update_internal` (BEFORE UPDATE)
  - `trg_normalize_google_play_transaction_number` (BEFORE INSERT)
  - `trg_service_transaction_edit_accounting` (AFTER UPDATE)
  - `trg_set_dmt_business_date` (BEFORE INSERT OR UPDATE OF transaction_timestamp, service_type)
  - `trg_sync_google_play_money_legs` (AFTER INSERT)
  - `trg_validate_financial_account_linkage` (BEFORE INSERT OR UPDATE OF status, customer_pay_method, instrument_id, pay_from_method, pay_from_instrument_id, amount)
  - `trg_validate_online_service_funding_account` (BEFORE INSERT OR UPDATE OF service_type, instrument_id)
  - `trg_validate_service_payment_instrument` (BEFORE INSERT OR UPDATE OF amount, pay_from_instrument_id, pay_from_method, service_type)
  - `trg_validate_service_portal_link` (BEFORE INSERT OR UPDATE OF service_type, portal_id)

---

## 3. Out-Of-Band Objects Identified

1. **Legacy Columns in `transactions`**:
   The columns `customer_name`, `phone`, `bank_name`, `account_last4`, `cancelled_at`, and `cancelled_by` existed in production from early prototype tracking prior to the double-entry accounting and modular AEPS/DMT/UPI refactor. They were retained in production schema without ALTER statements in subsequent migrations.
2. **RLS Hardening Policy Set**:
   Earlier migrations introduced naive `is_back_office()` check policies on write; production subsequently hardened these to deny direct authenticated inserts and updates (except google play backoffice), ensuring all updates flow through SECURITY DEFINER RPCs (`update_business_txn`, `reverse_business_txn`, etc.).
3. **Database Views**:
   9 views exist live, all with `security_invoker = true`.

---

## 4. Prepared Migration

A complete, reviewed, idempotent reconciliation migration was created:

**File**: [`supabase/migrations/20260920000000_canonical_transactions_recovery.sql`](file:///E:/CafeERP/supabase/migrations/20260920000000_canonical_transactions_recovery.sql)

### Migration Features:
- **Zero Invented DDL**: Sourced directly from live PostgreSQL catalog output.
- **Idempotency**: All sequences, tables, constraints, foreign keys, indexes, policies, and triggers check for existence before application.
- **Ordering**: Timestamped `20260920000000`, ordered directly after `20260917_customer_code_canonical.sql`.
- **Pre-flight Validation**: Syntax, block balancing, column parity, and constraint coverage verified via local AST check script [`scratch/validate_migration_sql.py`](file:///E:/CafeERP/scratch/validate_migration_sql.py).

---

## 5. Status & Next Steps

### PASS:
- Production public schema dump obtained cleanly and verified (841 KB, 66 tables).
- `public.transactions` canonical DDL extracted with all 66 columns, generated column, constraints, foreign keys, indexes, policies, and triggers.
- Exact differences between repository assumptions and production catalog identified and reconciled.
- Reviewed migration [`20260920000000_canonical_transactions_recovery.sql`](file:///E:/CafeERP/supabase/migrations/20260920000000_canonical_transactions_recovery.sql) created and validated.
- Production and repository secrets protected at all stages.

### REMAINING OPERATOR ACTIONS:
1. **Review Migration**: Inspect [`supabase/migrations/20260920000000_canonical_transactions_recovery.sql`](file:///E:/CafeERP/supabase/migrations/20260920000000_canonical_transactions_recovery.sql).
2. **Commit Migration**: Stage and commit `supabase/migrations/20260920000000_canonical_transactions_recovery.sql` and `docs/SCHEMA_RECONCILIATION_REPORT.md` (the dump file `supabase/prod_schema_public_20260920.sql` is gitignored and must remain uncommitted).
3. **Staging / CI Test**: Test applying migrations sequentially on a blank test Supabase project or Docker instance to verify from-scratch build pass.
