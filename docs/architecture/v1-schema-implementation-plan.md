# V1 Schema Implementation Plan
ERP: CyberCafe & Digital Services ERP · Status: **PLAN ONLY — no SQL, migrations, code, tests, objects, config, or database contact.**
Conventions: **[IMPL]** implementation-time choice (bounded, no owner input) · **[DEFERRED]** intentionally out of V1 · **[EXT]** needs external/legal confirmation. All approved decisions preserved; no new business rules.

## G0 — Tenant/auth/device foundation (first)
- Prerequisites: none (greenfield baseline start).
- Entities: tenants, users/profiles, devices (+ enrollment token flow), numbering_sequences.
- Dependencies: auth provider for identity links.
- Constraints: one active tenant; roles from approved set; ≥1 active Admin invariant (documented check).
- Indexes: users(tenant, role, active); devices(owner, status).
- RLS: deny-default; self-read own profile; Admin user management.
- RPC: enrollment-token issuance/consumption; read-only profile accessors.
- Seed: the single tenant row; initial Admin (operator-provisioned, documented).
- Verification: RLS probe matrix (anon denied, cross-tenant denied); enrollment happy-path + expiry + single-use.
- Rollback: baseline rebuild (no data yet); recorded in plan log.

## G1 — Masters and dormant tax
- Prerequisites: G0.
- Entities: suppliers, customers (+credit_limit), products (+barcode unique, HSN ref), payment_instruments, chart_of_accounts (seeded, versioned), hsn_codes, tax_rates (dormant).
- Dependencies: numbering for codes (application-assigned or sequenced — [IMPL]).
- Constraints: barcode unique per tenant; HSN/rate flags validated against known sets; CoA admin-maintained.
- Indexes: by tenant + code/name; instruments (type, active).
- RLS: back-office read all; staff/cashier read active catalog only; zero financial-table DML.
- RPC: master CRUD (role-gated); CoA changes Admin-only.
- Seed: CoA heads; payment methods/instruments per approved list; HSN/rate dormant rows.
- Verification: dormant flags carry no computation; RLS matrix; seed counts.
- Rollback: master deletes restricted once referenced (RESTRICT FKs) — restore from backup.

## G2 — Inventory lots, FIFO, expiry, reservations
- Prerequisites: G1 (products, suppliers).
- Entities: stock_lots (one per purchase line), stock_reservations, adjustments.
- Dependencies: purchases (G3 intake creates lots — order note: lots table before purchase posting logic, populated at runtime).
- Constraints: mandatory expiry_date; status CHECK; expired/quarantined unallocatable; reservation TTL 24h; stuck-hold alert at 2× TTL.
- Indexes: lots (product, status, received_at); reservations (lot, hold expiry).
- RLS: operational read for staff; adjustments Manager+Admin RPC only.
- RPC: intake (creates lots), reserve/release, adjust (reason-coded), quarantine.
- Seed: none (lots arise from purchases/opening).
- Verification: FIFO order test; expiry hard-block; reservation release + alert; multi-lot split sums.
- Rollback: adjustments reverse via linked correction, never delete.

## G3 — Purchases, invoices, allocations
- Prerequisites: G1, G2.
- Entities: purchases/purchase_lines, invoices/invoice_lines/invoice_line_lots, provisional + canonical numbers.
- Dependencies: numbering_sequences; lot creation on intake; totals recomputed server-side.
- Constraints: all-or-nothing documents; canonical_number unique per tenant; line-lot sums equal line qty at posting; provisional numbers non-unique.
- Indexes: invoices (canonical_number) unique, (customer, business_date); lines (invoice); line_lots (line, lot) unique.
- RLS: cashier creates drafts/sales; corrections via cancel-and-recreate RPC only.
- RPC: create_sale, edit path (cancel + reissue), purchase intake.
- Seed: none.
- Verification: totals-match-₹0.01 gate; immutable posted; edited_from/recreated_by linkage; idempotent replay.
- Rollback: reversals only (mirror entries), never deletes.

## G4 — Payments, claims, allocations (F1 single-table)
- Prerequisites: G3 (documents), G1 (instruments, customers).
- Entities: payment_claims (recorded→recognized in place; recognized rows ARE payments), collection_allocations (sum = claim, no NULL instruments).
- Dependencies: khata limits at validation; instrument active checks.
- Constraints: claim-state CHECK; unrecognized excluded from balances; over-limit rejected.
- Indexes: claims (state); allocations (claim).
- RLS: cashier records claims; recognition Admin-gated RPC.
- RPC: record claim, recognize claim, allocate splits.
- Seed: none.
- Verification: state-transition legality; sum enforcement; limit rejection; replay safety.
- Rollback: un-recognize only pre-recognition; post-recognition via reversal.

## G5 — Record-only services + F2 uniform legs
- Prerequisites: G4 (claims/journals path).
- Entities: service_transactions (AEPS/DMT/UPI/Recharge/BBPS columns per frozen lists).
- Dependencies: per-type legs (AEPS float/fee/commission; DMT funding/fee; UPI gross/fee rule; Recharge/BBPS payable/commission); `(source_type, source_id)` journal linkage.
- Constraints: BBPS columns exactly frozen list (no speculative fields); sensitive-data limits enforced.
- Indexes: (service_type, status); (server number) unique.
- RLS: record via role-gated RPC; read scoped by role.
- RPC: record service sale; service reversal.
- Seed: provider/biller reference rows as needed (non-secret refs only).
- Verification: legs balance per type; fee treatment matches spec; BBPS freeze honored.
- Rollback: mirror reversals only.

## G6 — Journals, settlements, khata
- Prerequisites: G3–G5 postings.
- Entities: journal_entries/lines (balanced, immutable, origin-flagged, reversal-linked), settlements (explicit from/to), khata derived dues + limits.
- Dependencies: CoA (G1); all posting paths.
- Constraints: Σdebit=Σcredit; `(source_type, source_id)` unique; locked-period rule; no direct app DML.
- Indexes: (entry_date); (source_type, source_id); (account, date) for ledger reads.
- RLS: read scoped; mutation RPC-only (posting engine).
- RPC: single canonical posting engine; settlement executor; reversal executor.
- Seed: opening equity heads (via opening workflow, not free data).
- Verification: trial-balance zero; immutable-posted probes; locked-period rejection; khata-limit rejection.
- Rollback: corrections only (linked entries), never edits/deletes.

## G7 — Discounts, returns, refunds, D5 overrides
- Prerequisites: G3, G6.
- Entities: approvals (scope hash, approver, timestamp, 15-min expiry, self-approval flag, requester); override audit fields.
- Dependencies: admin identity; SoD activation on second Admin (grandfather history).
- Constraints: any discount / all returns / over-₹1 variance need Admin; scope-bound single-use approvals.
- Indexes: approvals (scope_hash).
- RLS: requesters insert own requests; only Admin resolves.
- RPC: request approval, approve (with override audit), apply approved action.
- Seed: none.
- Verification: staff self-approval denied; expired approval rejected; scope drift rejected; override audit complete.
- Rollback: approvals consumed, never deleted; mistaken approvals reversed via business reversal.

## G8 — Day-close and ₹1 variance
- Prerequisites: G4–G6 (balances), devices synced (watermark check — proposal).
- Entities: day_closes + day_close_lines (expected/counted/variance, closer, approver, variance journal ref, lock).
- Dependencies: instrument balances; variance journals; period locks.
- Constraints: |variance| ≤ ₹1 auto-accept; over-tolerance Admin approval; no reopen (linked corrections).
- Indexes: (tenant, business_date) unique.
- RLS: Manager records, Admin approves/locks.
- RPC: open/close day, record counts, approve variance, lock.
- Seed: none.
- Verification: tolerance math half-up; escalation path; lock enforcement; offline-provisional exclusion.
- Rollback: locked closes corrected via linked entries only.

## G9 — Offline outbox, idempotency, epochs, conflicts
- Prerequisites: G0 (devices), document RPCs.
- Entities: device-local outbox (not server); server watermark on devices; sync_conflicts; idempotency_keys.
- Dependencies: enrollment tokens; epoch rotation on re-registration.
- Constraints: three outbox uniques; stale-epoch rejection; conflict append-only.
- Indexes: server-side keys/conflicts by (tenant, key)/(tenant, document).
- RLS: devices see own queue state only (server-side metadata).
- RPC: sync handshake, flush, acknowledge, conflict disposition.
- Seed: none.
- Verification: kill-network resume; expired-auth pause; revoke-mid-queue; duplicate/replay/concurrency suites.
- Rollback: n/a (sync protocol) — failed items to exception queue, never silent drop.

## G10 — Retention, purge, holds, backups
- Prerequisites: all entities (columns), jobs runtime.
- Entities: `retain_until`/`purge_state` columns; hold flags; purge log; archive stores.
- Dependencies: backup rotation procedure honoring purge reconciliation.
- Constraints: journals never purged; holds suspend purge; per-tenant scoping mandatory.
- Indexes: (purge_state, retain_until) per entity.
- RLS: purge job runs as Admin-gated service identity.
- RPC/jobs: retention sweeper, purge executor, hold setter, restore-reconciliation step.
- Seed: retention policy rows (approved tiers).
- Verification: hold suspension; per-tenant scoping probes; backup-restore-reconcile drill; audit-of-purge completeness.
- Rollback: restores from backup + reconciliation (documented lag honestly).

## G11 — GST dormant seams (disabled)
- Prerequisites: G1 masters.
- Entities/columns: HSN/rate masters + document flags only (frozen list).
- Dependencies: value-set validation at write.
- Constraints: no computation columns; no posting rules referencing tax.
- Verification: dormancy probes (totals exclude tax math; flags validate).
- Rollback: n/a. Activation is a future project, not V1.

## G12 — Back-entry/D9 structures (pending detailed mini-spec)
- Prerequisites: D9 detailed design approval.
- Entities: back_entry_batches/lines, suspense_records, atomic lock record — NOT TO BE BUILT until mini-spec lands.
- Verification: deferred with the mini-spec.

## G13 — Locks and record guards
- Prerequisites: postings, closes, back-entry.
- Entities/rules: back-entry atomic lock; period_locks; lifecycle CHECKs; approval single-use; posted immutability.
- Verification: lock-conflict matrix (post into locked period denied; double-lock denied; stale-epoch denied).

## G14 — Seed and reference data
- Prerequisites: G0, G1.
- Content: tenant row; initial Admin (operator-provisioned); CoA heads; instruments/methods; HSN/rate dormant rows; numbering starts; retention policy rows. No business data, no legacy imports.

## G15 — Thermal-print/POS dependencies affecting schema/implementation
- Prerequisites: invoice canonical data model (G3).
- Schema impact: none beyond receipt-required fields (numbers, totals, business identifiers) already modeled; printer layout is app-level.
- POS override dependency: discount/approval capture fields on sale requests (approver ref) — already in approvals design.
- Verification: print-content completeness test at POS build (later phase).

## Verification checkpoints per group
G0 RLS matrix · G1 seed counts + dormancy · G2 FIFO/expiry/reservation suites · G3 totals/immutability/idempotency · G4 state machine + limits · G5 per-type leg balance + BBPS freeze · G6 trial balance + lock rules · G7 approval matrix incl. SoD activation · G8 tolerance math + lock · G9 offline/duplicate/concurrency suites · G10 hold/purge/backup drill · G11 dormancy probes · G13 lock-conflict matrix. Every checkpoint needs exit-code-0 evidence before the next group begins.

## Recovery/rollback considerations
No destructive DDL without a fresh backup; every group reversible via compensating entries (never DELETE); restores re-run purge reconciliation; outbox watermarks survive restores; migration log records each applied group with hash + actor + timestamp. Rollback of a group = documented compensating procedure, never silent reversion.

## Deferred / external-confirmation items
[DEFERRED] live gateway APIs, WhatsApp, tax engine/filing, per-category expiry tuning beyond defaults, backorder model. [EXT] statutory retention confirmation beyond approved tiers (legal counsel if operations scale); D9 detailed mini-spec content (owner track).

IMPLEMENTATION AUTHORIZATION REQUIRED: YES

Specific authorization required from the owner before any baseline schema/migration work begins:
1. Written approval of this implementation plan (scope, group order, verification checkpoints).
2. Confirmation that D9 detailed mini-spec, BBPS freeze, and GST-seam review remain the only outstanding design items, with back-entry structures explicitly excluded from the first baseline cut.
3. Named authority to create the greenfield database objects (project, environment, and actor).
4. Acceptance of the verification-checkpoint regime (no group marked complete without exit-code-0 evidence).
5. Acknowledgement that thermal-print/POS build, live integrations, and WhatsApp remain out of V1 baseline scope.
