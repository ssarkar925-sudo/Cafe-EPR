# V1 Final Decision Register
ERP: CyberCafe & Digital Services ERP · Compiled 2026-09-21
Status: **DECISIONS RECORDED — IMPLEMENTATION HAS NOT STARTED.** No code, migrations, schemas, database objects, tests, or configuration created or modified. No database or external system contacted.

## 1. A2 locked decisions
Roles Admin/Manager/Staff/Restricted Cashier · admin-exclusive user/role management, financial configuration, CoA, tax rates, backups, opening-balance locks · admin-only final approval (any discount, all returns/refunds, variance >₹1) · FIFO + batches + expiry + barcode · GST future-ready, disabled at launch · offline required at launch · AEPS/DMT/UPI/Recharge/BBPS record-only v1 · single tenant + `tenant_id` · fresh data, no legacy migration · opening 01-01-2026 · cancel-and-recreate · ₹0.01 half-up · RPO 24h / RTO 4h · web-only responsive (desktop excluded) · thermal printer required.

## 2. Approved D1–D11 decisions (owner, 2026-09-21)
- **D1** Offline cash: record-only claims; recognized only after server validation; operator-liability window.
- **D2** All-or-nothing fulfilment per document; no partial fulfilment or backorders in V1.
- **D3** 24h provisional reservations; auto-release; `reserved_qty` exposed.
- **D4** Retry 30s ×2, 15-min cap, 48h max age; semantic rejections never auto-retry.
- **D5** Approvals: 15-min expiry baseline amended — see §4.
- **D6** 30-day watch + 7-day action bands.
- **D7** Watermarked provisional numbers "UNSYNCED — NOT FINAL".
- **D8** Server-authoritative timestamps; device time informational.
- **D9** Dedicated back-entry mini-spec before schema (not an approval of unspecified rules).
- **D10** Record-only field lists for AEPS/DMT/UPI/Recharge/BBPS; BBPS uncertainty preserved; no live API in V1.
- **D11** HSN/SAC masters, effective-dated rates, supply-type references, B2B/B2C flags only; no V1 tax computation or returns.

## 3. Approved D9.1–D9.4 decisions (owner, 2026-09-21)
- **D9.1** Lookback limit: 12 months (from 2025-01-01).
- **D9.2** Single atomic lock for the back-entry period.
- **D9.3** Reject inventory records with unknown expiry; no uncontrolled usage of unknown-expiry lots.
- **D9.4** Suspense-as-proposed (evidence, authorized clearing, balanced journals, complete audit history).

## 4. D5 owner self-approval amendment (preserved verbatim in effect)
Sole-Admin self-approval permitted for own discounts, returns, refunds. Every override requires an audit log with identity, timestamp, reason, affected transaction, and original/approved values. Separation-of-duties approval becomes mandatory when additional users are introduced. Permission architecture must support future multi-user approval workflows.

## 5. Remaining documentation gaps
1. D9 mini-spec detailed design (authorized to draft; schema for back-entry structures still blocked on it).
2. BBPS bill-reference fields (least-evidenced; correctable at schema review).
3. Thermal-printer receipt layout (app-level, needed before POS build).
4. Admin-override-at-POS capture UX.
5. Per-category near-expiry tuning (defaults shippable).
6. Pre-opening back-entry execution method (within D9 scope).

## 6. Explicit statement
**Implementation has not started.** This register authorizes nothing beyond review. Any schema, code, migration, or database work requires a separate explicit instruction, and each such step requires its own review before execution.

## 7. Approved F1–F3 blocker decisions (owner, 2026-09-21)
- **F1 — Single-table payment model.** Rationale: fewer tables, no cross-table reconciliation drift, idempotency key on one row. Schema: claims transition `recorded→recognized` in place; recognized rows ARE payments. Posting: journals post only on recognition. Sync: single-row state flips replay cleanly. Reconciliation/audit: trivially consistent transition events. Security/RLS: recognition is an Admin-gated RPC. Minimization: method/amount/instrument refs only; never card numbers, PINs, MPINs, or full account numbers.
- **F2 — Uniform financial posting path.** Rationale: one money model, one reconciliation story, per-type columns preserved. Schema: service_transactions FK to claims/journals via `(source_type, source_id)`. Posting: fee/commission/income legs per service. Sync/idempotency: same validation pipeline and key scope. Reconciliation/audit: unified trial balance, uniform events. Security/RLS: same RPC boundary. Minimization: beneficiary account/IFSC and Aadhaar fragments stored only as operationally required; Aadhaar last-4 maximum. BBPS money-leg evidence remains thinnest — owner confirmation preserved as a note.
- **F3 — Tiered retention with minimization.** Rationale: statutory cover with bounded exposure; purges reason-coded and audited. Schema: retention timestamps + purge-state columns; journals never purged. Sync/idempotency: pruned payloads stay replayable via retained keys. Reconciliation: unaffected (purged data is non-financial). Security/RLS: purge is an Admin-gated job. Minimization: mobiles/addresses kept only while dues active or statute requires; drop card/wallet tokens, biometric-adjacent data, full bank details — refs only.
- D5 sole-admin override, D9 decisions, and D1–D11 unchanged. Project is NOT marked implementation-ready; next stage is F4–F14 documentation correction plus a second schema design audit.
