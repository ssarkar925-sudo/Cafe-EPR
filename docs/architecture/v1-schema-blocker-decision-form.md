# V1 Schema Blocker Decision Form — F1, F2, F3
ERP: CyberCafe & Digital Services ERP · Source: schema design audit report.
Status: **APPROVED BY OWNER — 2026-09-21 (F1, F2, F3).** Original questions, alternatives, and recommendations preserved below. Design only; no SQL, code, or DB work.
Preserved: A2, D1–D11, D9.1–D9.4, D5 sole-Admin override amendment. BBPS uncertainty explicitly marked where evidence is insufficient.

## F1 — Payments vs Claims Model
1. **Ambiguity (audit-verbatim):** `payments` is listed but never defined; `payment_claims` carries claim states; their relationship is unspecified.
2. **Why it matters:** cash intake is the core money path — tables, posting legs, reconciliation, and balance computation all depend on whether claims transition in place or resolve into separate payment rows.
3. **Alternatives:** (A) Single-table: claims transition `recorded→recognized` in place; recognized rows ARE the payments. (B) Two-table: claims resolve into immutable `payments` legs on recognition.
4. **Recommended: (A)** — fewer tables, no cross-table reconciliation drift, idempotency key lives on one row; audit shows the transition.
5. **Impact:** Entities: one table vs two + resolution linkage. Journals: post only on recognition either way. Sync: single-row state flips replay cleanly. Idempotency: key on the claim row. Reconciliation: (A) trivially consistent; (B) needs claim↔payment tie-out. Audit: transition events vs resolution events. RLS/RPC: recognition is an Admin-gated RPC either way.
6. **Owner decision:** [x] (A) single-table — APPROVED OWNER DECISION 2026-09-21.
7. **Approval status:** APPROVED — single-table payment model.
8. **Security/compliance risks:** (B) risks orphaned claims or double-counted payments if linkage breaks; both options must bar recognition by non-Admin roles.
9. **Sensitive-data minimization:** store method/amount/instrument refs only; never store card numbers, PINs, UPI MPINs, or full account numbers.

## F2 — Service-Transaction Money Linkage
1. **Ambiguity (audit-verbatim):** record-only services still move money, but no stated path service_txns → payments/claims → journals.
2. **Why it matters:** determines FK design across three domains and whether service income/fee/commission ever balances.
3. **Alternatives:** (A) Service sales post through the same payment-claim + journal path as goods sales (uniform money model). (B) Service-only side ledger with periodic summary journals (fewer postings, weaker traceability).
4. **Recommended: (A)** — one money model, one reconciliation story, per-type columns preserved for record-only detail.
5. **Impact:** Entities: service_transactions FK to claims/journals via `(source_type, source_id)`. Journals: fee/commission/income legs per service. Sync: same validation pipeline. Idempotency: same key scope. Reconciliation: unified trial balance. Audit: uniform events. RLS/RPC: same RPC boundary.
6. **Owner decision:** [x] (A) uniform path — APPROVED OWNER DECISION 2026-09-21.
7. **Approval status:** APPROVED — uniform financial posting path.
8. **Security/compliance risks:** (B) risks unreconciled float (AEPS/DMT pools) drifting from books; BBPS evidence is thinnest here — BBPS money legs need explicit owner confirmation.
9. **Sensitive-data minimization:** beneficiary account numbers/IFSC and Aadhaar fragments: store only what operations require; Aadhaar last-4 maximum; no full identity numbers.

## F3 — Retention and Data Minimization Policy
1. **Ambiguity (audit-verbatim):** no retention schedule (audit years? PII minimization? outbox pruning? device tokens?).
2. **Why it matters:** customer PII accumulates unboundedly; legal/compliance exposure grows with every synced device and backup.
3. **Alternatives:** (A) Tiered retention: transactional rows per statutory need, audit 7 years, outbox payloads pruned after sync+30d, device tokens revoked on expiry. (B) Retain-all indefinitely (simplest, highest exposure).
4. **Recommended: (A)** — statutory cover with bounded exposure; purge jobs reason-coded and audited.
5. **Impact:** Entities: retention timestamps + purge state columns. Journals: never purged (money truth permanent). Sync: pruned payloads stay replayable via idempotency keys. Idempotency: keys retained beyond payloads. Reconciliation: unaffected (purged data is non-financial). Audit: retention schedule itself audited. RLS/RPC: purge is an Admin-gated job.
6. **Owner decision:** [x] (A) tiered — APPROVED OWNER DECISION 2026-09-21.
7. **Approval status:** APPROVED — tiered retention policy with sensitive-data minimization.
8. **Security/compliance risks:** (B) maximizes breach blast radius and may breach data-protection expectations; device-local outbox copies multiply exposure.
9. **Sensitive-data minimization:** customer mobiles/addresses kept only while dues active or statute requires; drop card/wallet tokens, biometric-adjacent data, and full bank details entirely — refs only.

## Schema Readiness Impact After F1–F3
F1–F3 are now APPROVED (2026-09-21): payment/claim single-table model, uniform service money path, tiered retention with minimization. Baseline drafting for all money-path entities is unblocked on these three points. Remaining prior blockers still apply: D9 detailed mini-spec, BBPS field confirmation, GST-seam review. No other section may proceed to baseline on assumptions — record decisions first.
