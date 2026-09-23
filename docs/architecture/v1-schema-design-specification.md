# V1 Schema Design Specification
ERP: CyberCafe & Digital Services ERP · Status: **DESIGN ONLY — no SQL, migrations, code, or database work**
Basis: Final decision register (A2, D1–D11, D9.1–D9.4 approved 2026-09-21), transaction-sync spec, back-entry mini-spec, schema readiness report.
Conventions used throughout (locked): `tenant_id` on every row · UUID primary keys · `numeric(18,2)` money, half-up · server-authoritative timestamps + device-time metadata · deny-default RLS · `SECURITY DEFINER` RPCs with fixed `search_path`, `REVOKE PUBLIC`, explicit grants. Tags: **[V1]** required · **[LATER]** deferred · **[OPEN]** unresolved detail (never structural guess).

## 1. Approved business decisions and constraints
Single tenant with `tenant_id` day one · roles Admin/Manager/Staff/Restricted Cashier, admin-only approvals (any discount, all returns/refunds, variance >₹1), sole-Admin self-approval with full override audit · FIFO + batches + expiry + barcode · GST dormant (masters + flags only) · offline required at launch · record-only AEPS/DMT/UPI/Recharge/BBPS · fresh data, opening 01-01-2026, 12-month back-entry lookback, single atomic lock · cancel-and-recreate · all-or-nothing fulfilment · 24h reservations · watermarked provisional numbers · server time · RPO 24h/RTO 4h · web-only.

## 2. Tenant and role model
- **tenants** [V1]: identity + status. Purpose: isolation root. Constraints: one active tenant in V1; every other entity FK-restricts to it.
- **users/profiles** [V1]: auth identity link, display name, role (Admin/Manager/Staff/Restricted Cashier), active flag. Constraints: role from approved set; ≥1 active Admin invariant (application-enforced, documented).
- **devices** [V1]: device id, owning user, registration/revocation timestamps, last watermark, status. Purpose: offline identity + queue anchoring. Re-registration rotates a device epoch (F9 correction); the server rejects outbox items carrying a stale epoch, so a lost/revoked device can never replay old queues.

## 3. Core entity inventory (summary; detailed in §§4–13)
Masters: customers, suppliers (vendor masters with payables linkage, mirror of customer khata rules), products, payment_instruments, chart_of_accounts, tax HSN/rate masters (dormant). Documents: purchases, invoices (+lines), payment claims (single-table, F1), service_transactions, settlements, adjustments. Stock: stock_lots, stock_reservations. Money truth: journal_entries/lines. Control: approvals, audit_logs, idempotency_keys, outbox/sync metadata, back-entry batches/lines, suspense, period locks, numbering sequences, sync conflicts.

## 4. Sales and invoice lifecycle
- **invoices** [V1]: provisional_number (nullable, device-visible, NOT globally unique) + canonical_number (server-assigned, unique per tenant); lifecycle state (draft→…→posted/failed/reversed/cancelled, server-enforced legal transitions); customer, dates (business_date + entered_at), totals (server-computed), discount + approver ref, edited_from link for recreations plus backward `recreated_by` link for audit traversal (F12 correction). Constraints: canonical_number unique; totals consistent with lines within ₹0.01 (enforced at posting); posted rows immutable (no update/delete by app roles).
- **invoice_lines** [V1]: product, qty, rate, amount, HSN snapshot (dormant use). Lot consumption is modeled per line below, never as a single ref.
- **invoice_line_lots** [V1] (F4 correction): allocation rows `(invoice_line, lot, qty, unit_cost)`; one row per lot consumed by a line, enabling multi-lot partial allocation with true FIFO COGS. Unique `(line, lot)`; quantities sum to line qty (enforced at posting).
- **purchases / purchase_lines** [V1]: supplier bills; intake creates stock_lots (§6).

## 5. Offline outbox and synchronization entities
- **outbox_items** [V1] (device-local only — F14 correction): device, sequence, client_uuid + idempotency_key (both unique per tenant), payload hash, attempts, next-retry-at, state. Uniqueness (H4 correction): unique `(tenant_id, device, sequence)` for ordered replay; unique `(tenant_id, client_uuid)` for operation identity; unique `(tenant_id, idempotency_key)` for intent dedupe. Replay returns the stored result; same payload with a new key is rejected as ambiguous; stale-epoch items are rejected per device epoch. The server stores no outbox table; it keeps the per-device watermark on `devices`. Purpose: ordered, resumable, deduplicated sync.
- **numbering_sequences** [V1] (F13 correction): per-tenant named sequences (invoice, settlement, closing) with current value + increment; canonical numbers derive from these. Scope is per tenant (F14 correction).
- **sync_conflicts** [V1]: document ref, reason code, server snapshot refs, disposition, actor. Append-only; never silently dropped.
- **idempotency_keys** [V1]: scope + key unique; stored result for replays.

## 6. Inventory, batch, FIFO, expiry entities
- **products** [V1]: catalog fields + barcode (unique), HSN ref (dormant), active flag.
- **stock_lots** [V1]: product, purchase ref, quantities received/remaining, unit cost, received_at, expiry_date (mandatory), status (open/exhausted/quarantined/expired). FIFO = oldest received_at first; expired lots absolutely unallocatable. Granularity (H3 correction): exactly one lot per purchase line (split a line only if supplier lots differ); allocations consume lots via `invoice_line_lots`; reservations attach per (lot, document); every movement records (lot, reason, qty) so value never detaches from batches. Lifecycle ownership (F7 correction): open→exhausted flips event-driven at allocation time; expired flips via nightly reason-coded sweeper job (actor: system, audited); quarantine moves are Manager+Admin only.
- **stock_reservations** [V1]: lot, document ref, qty, hold expiry (24h), device. Auto-released; visible as reserved_qty. Release executor (F8 correction): same nightly sweeper releases expired holds; holds stuck past 2× TTL raise a stuck-hold alert for Manager review; reservations against quarantined/expired lots are rejected.
- **adjustments** [V1]: reason-coded qty/value moves (damage, expiry quarantine, counts); Manager+Admin only; journaled.

## 7. Payment claims and service transaction entities
- **payment_claims** [V1] (single-table model, F1): method, amount, instrument ref, claim_state (recorded/recognized), recorded/recognized timestamps + actor. Unrecognized claims excluded from balances. There is no separate `payments` table; recognized claim rows ARE the payments.
- **collection_allocations** [V1] (F13 correction): per-method split rows of a claim `(claim, method, amount, instrument)`; amounts sum to claim amount (enforced at recognition); each row references an active instrument (no NULLs).
- **service_transactions** [V1]: per-type columns exactly per approved D10 field lists (AEPS/DMT/UPI/Recharge/BBPS); common identity (client_uuid, idempotency_key, server number, dates, status). **[OPEN: BBPS bill-reference confirmation could narrow columns.]** Sensitive-data limits (F2/F3 approved): Aadhaar last-4 maximum, beneficiary account/IFSC only as operationally required, no card/PIN/MPIN/full-identity storage.
- **payment_instruments** [V1]: type, active flag, balances (server-maintained, never client-written).
- **settlements** [V1]: explicit from-instrument and to-instrument refs, amount, reason, actor, timestamp (F12 correction). Balanced settlement journals post atomically with the transfer row.

### 7b. Per-service journal legs (G1 correction; full detail in g1-g3 log)
Uniform path: service sale → claim → balanced batch keyed `(source_type='service_transaction', source_id)`. AEPS: Dr Float Clearing (amount+commission) / Cr Cash (amount−fee) / Cr Fee / Cr Commission Income (legacy-derived, re-verify at baseline). DMT: Dr funding clearing / Cr bank-portal payout / Cr fee. UPI: Dr clearing (gross) / Cr takings-or-dues with fee per fee-source rule. Recharge/BBPS: Dr clearing / Cr provider payable / Cr commission (BBPS fields OPEN). Failures pre-posting leave no legs; reversals mirror in full.

## 8. Accounting journals and ledger relationships
- **chart_of_accounts** [V1]: admin-owned heads (seeded, versioned; admin-exclusive maintenance).
- **journal_entries / journal_lines** [V1]: balanced batches (Σdebit=Σcredit), `(source_type, source_id)` unique, `origin` flag (live/back-entry/opening), posted immutability, mirror-reversal linkage (`reverses`/`reversed_by` refs both ways). Locked-period rule (F10 correction): no journal may be dated into a locked period unless `origin` is a linked correction explicitly referencing the original entry. Every financial effect (sales, purchases, payments, adjustments, settlements, opening) resolves to journals; journals are the money truth.
- **day_closes / day_close_lines** [V1] (G2 correction): `(tenant_id, business_date)` unique; status (open, balanced, variance_pending, locked); per-instrument expected/counted/variance in ₹0.01 half-up; |variance| ≤ ₹1 auto-accepts with variance journal, over-tolerance escalates to Admin; no reopen after lock (linked corrections only); close requires all devices synced (proposal).

## 9. Khata and credit structures
- **customers.credit_limit + dues aging** [V1]: limits enforced server-side at validation; over-limit sales rejected (no partial credit).
- Dues derived from posted invoice/payment/return journals (never hand-maintained balances); aging buckets are a derived view, not stored rows (F12 correction).

## 10. Approval and audit structures
- **approvals** [V1]: scope hash, approver identity, timestamp, expiry (15 min), self-approval flag, requester ref (separation of duties once multi-user). SoD activation (F11 correction): separation of duties activates on the event of a second active Admin; historical sole-Admin self-approvals remain valid and are never retro-invalidated. Approvals are single-use and scope-bound (replay or scope drift → reject).
- **audit_logs** [V1]: actor, action, entity, before/after values, reason, device, idempotency key; append-only; override entries carry original/approved values (D5).

## 11. GST dormant structures [V1 dormant]
`hsn_codes`, `tax_rates` (effective-dated), supply-type/B2B flags on documents. No computation columns, no filing entities. Anything more is LATER. Dormant flags are validated against known value sets at write time so no garbage accumulates for later activation (F14 correction). Near-expiry bands are configuration with per-category overrides allowed; defaults 30-day watch + 7-day action (expiry-tuning note).

## 12. Historical back-entry entities (detailed design deferred to D9 mini-spec execution)
`back_entry_batches` (key unique, actor, reason, window, state) → `back_entry_lines` (source ref, line, business_date, lot/opening links); suspense records; single atomic lock record. Structure follows the approved mini-spec; detailed field design happens there, not here.

### 12b. Lock taxonomy (H2 correction — three distinct mechanisms, never confused)
1. **Back-entry atomic lock:** one-time closure of the pre-opening window; owned by Admin; scope = all back-entry; after it, no new back-entries (live-period corrections only).
2. **Period locks (`period_locks`):** recurring business periods (day-close and later month-close); owned by the closer role (Manager records, Admin approves over-tolerance); scope = one `(tenant_id, business_date or period)`; effect = locked-period posting prohibition (§8).
3. **Record-level guards (not lock rows):** posted-row immutability, single-use approval consumption, lifecycle CHECKs — enforced by constraints/triggers, owned by the database, no lock table involved.

## 13. Device registration and synchronization metadata
Covered in §2 (`devices`) + §5 (outbox, watermarks, conflicts). Server watermark per device is the resume truth; unflushed device drafts are losable (UX-disclosed).

## 14. Constraints, unique keys, idempotency rules
PKs everywhere; FK `ON DELETE RESTRICT` for masters/ledger; `tenant_id` FK on all rows; uniques: `(tenant_id, idempotency_key)`, `(tenant_id, client_uuid)`, canonical numbers, `(source_type, source_id)` on journals, barcode; CHECKs: lifecycle transitions, non-negative quantities, balanced journals, expiry gating, claim-state discipline; overweight rule: any semantic violation rejects the document, never partial-posts.
Per-entity FK column enumeration is explicitly deferred to baseline drafting (H5 note) — relationship targets above are final, but exact column lists are not pretended final here.

### 14b. Per-entity index and CHECK schedule (F5 correction)- Indexes (all prefixed by `tenant_id` where applicable): outbox `(device, sequence)`; lots `(product, status, received_at)`; journals `(entry_date)` + `(source_type, source_id)` unique; audit `(entity, created_at)`; approvals `(scope_hash)`; invoices `(canonical_number)` unique + `(customer, business_date)`; claims `(state)`; devices `(owner)`; back-entry lines `(batch, source_ref)`.
- Status enumerations (CHECK, exact value lists fixed at baseline): invoice lifecycle (draft, offline_created, queued, server_validated, posted, failed, reversed, cancelled); lot status (open, exhausted, quarantined, expired); claim state (recorded, recognized); device status (active, revoked); approval state (pending, consumed, expired); back-entry batch state (open, validated, locked); adjustment types (damage, expiry, count, other); day-close status (open, balanced, variance_pending, locked).

### 14c. Retention columns (G3 correction; tiers approved in F3)
Policy (approved, not mechanics): R1 idempotency keys retained 2 years · R2 audit 7 years then read-only archive, operational rows purged · R3 per-entity legal/audit holds suspend purge · R4 backups retain purged data until rotation, restores re-run purge reconciliation · R5 all retention/purge per-tenant · R6 purges Admin-gated, reason-coded, audited. Mechanics: `retain_until` + `purge_state` columns on operational entities; journals never purged; outbox payloads pruned after sync+30d; device tokens dropped on revocation/expiry; customer PII kept only while dues active or statute requires.

## 15. Tenant isolation and RLS requirements
Deny-by-default on all tables; per-role policies keyed on `tenant_id = current_tenant()` + role predicate; no `USING(true)`; app roles get zero direct DML on financial tables (RPC-only); per-function ACL matrix (PUBLIC/anon/auth/sr) tested per overload; cross-tenant probes mandatory in CI.

### 15b. Enrollment and requester write paths (F6 correction)
Device self-registration uses a short-lived, single-use enrollment token issued to an authenticated user (Admin/Manager/Staff); the token binds `device ↔ user ↔ tenant` and expires in 15 minutes. Approval requests and outbox registrations are requester-scoped inserts (staff/cashier may insert own requests; only Admin resolves). No anonymous or cross-tenant insert path exists.

## 16. Schema risks and unresolved documentation dependencies
D9 detailed mini-spec (gates back-entry structures) · BBPS field confirmation (gates service columns) · thermal-printer layout + POS override UX (app-level, pre-build) · per-category expiry tuning (defaults shippable) · GST-seam drift (review at baseline) · single-lock operational load at closure.

## Proposed entity list (V1)
tenants, users/profiles, devices, customers, suppliers, products, stock_lots, stock_reservations, purchases, purchase_lines, invoices, invoice_lines, invoice_line_lots, payment_claims (single-table; no separate payments table, F1), collection_allocations, service_transactions, payment_instruments, settlements, chart_of_accounts, journal_entries, journal_lines, day_closes, day_close_lines, approvals, audit_logs, idempotency_keys, outbox_items, sync_conflicts, back_entry_batches, back_entry_lines, suspense_records, period_locks, numbering_sequences, hsn_codes, tax_rates. Dormant in V1: tax computation/filing. Excluded: partial-fulfilment/backorder structures, live gateway integrations, WhatsApp.

## Schema blockers
D9 detailed mini-spec · BBPS field freeze · GST-seam confirmation at baseline review. Non-blocking on defaults: TTLs, retry caps, warning bands, provisional UX, server time.

## Open decisions
All §16 items above; nothing here approves them.

## Review checklist
- [ ] Entity list vs approved decisions (no scope creep: no backorders, no live APIs, no tax engine).
- [ ] Every V1 entity justified by a locked requirement.
- [ ] OPEN items explicitly carried (not silently resolved).
- [ ] D9 structures marked deferred-to-mini-spec.
- [ ] Explicit authorization obtained to draft the V1 baseline (still design-only).

## Confirmation of zero implementation changes
No SQL, migrations, code, database objects, tests, configuration, or application files created or modified. No database or external system contacted. Nothing committed or branched.
