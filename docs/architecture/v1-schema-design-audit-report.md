# V1 Schema Design Audit Report
Scope: `v1-schema-design-specification.md` audited against final decision register, sync spec, back-entry mini-spec, readiness report.
Status: **DOCUMENTATION ONLY — no SQL, code, tests, objects, or database contact.** Severities: BLOCKER / HIGH / MEDIUM / LOW / INFORMATIONAL.

## Findings

### F1 — BLOCKER — payments vs payment_claims relationship undefined (§7, §4)
Problem: `payments` is listed but never defined; `payment_claims` has claim states; their relationship (are payments recognized claims? separate legs?) is unspecified. Why it matters: core money path — schema cannot model cash intake coherently. Correction: define one model (recommended: claim rows transition recorded→recognized in place; no separate payments table — or justify two tables). Owner approval: required (money-path business rule).

### F2 — BLOCKER — service-transaction money linkage undefined (§7, §8)
Problem: record-only services still move money (cash received, commissions); no stated path service_txns → payments/claims → journals. Why it matters: determines FK design across three domains. Correction: specify per service type which money legs post and through which entities. Owner approval: required (business rule).

### F3 — BLOCKER — retention and sensitive-data minimization absent (§18)
Problem: no retention policy (audit years? PII minimization? outbox pruning? device tokens?). Why it matters: customer PII accumulates unboundedly; RPO covers backup, not retention. Correction: add retention schedule + minimization rules (e.g., retain audit N years, prune synced outbox payloads, minimize stored PII). Owner approval: required (retention periods are business decisions).

### F4 — HIGH — multi-lot allocation needs a join entity (§4)
Problem: `invoice_lines` carries a single "lot allocations ref", but FIFO partial allocation spans multiple lots. Correction: add `invoice_line_lots(line, lot, qty, unit_cost)`; keep single-ref only as display. Owner approval: none (normalization necessity; note at baseline review).

### F5 — HIGH — per-entity indexes and CHECK enumerations absent (§14)
Problem: §14 states principles but no per-entity index list (outbox device+sequence; lots product+status+received_at; journals entry_date; audit entity+created_at) and incomplete status enumerations (device, approval, batch, adjustment types). Correction: add the per-entity index/CHECK schedule. Owner approval: none.

### F6 — HIGH — enrollment and requester write paths undefined (§15)
Problem: deny-default RLS leaves no path for device self-registration or staff-created approval requests/outbox bootstrap. Correction: specify enrollment bootstrap (e.g., short-lived registration token flow) and requester-scoped insert policies. Owner approval: none (security design detail).

### F7 — MEDIUM — lot lifecycle ownership undefined (§6)
Problem: who flips open→exhausted→expired (event vs scheduled job) and with what actor/audit. Correction: state event-driven transitions + nightly expiry sweeper as a reason-coded job. Owner approval: none.

### F8 — MEDIUM — reservation release executor undefined (§6)
Problem: 24h auto-release needs an executor; stuck reservations (crashed releaser) unhandled. Correction: define sweeper ownership + stuck-hold alert threshold. Owner approval: none.

### F9 — MEDIUM — device re-registration invalidation missing (§5, §13)
Problem: after loss/revoke, old outbox sequences must never replay. Correction: re-registration rotates device epoch; server rejects stale-epoch items. Owner approval: none.

### F10 — MEDIUM — locked-period posting prohibition unstated (§8, §12)
Problem: `period_locks` exists but no rule bars journals dated into locked periods. Correction: add CHECK/RPC rule (locked period + non-correction origin → reject). Owner approval: none.

### F11 — MEDIUM — D5 SoD activation trigger undefined (§10)
Problem: historical self-approvals vs future separation-of-duties transition (when exactly 2nd Admin activates; grandfathering). Correction: define activation event + grandfathering rule. Owner approval: review at baseline (policy edge).

### F12 — LOW — relationship explicitness gaps
`edited_from` lacks a backward `recreated_by` link (or documented query pattern); settlements need explicit from/to refs; dues aging should be stated as derived view. Correction: editorial additions. Owner approval: none.

### F13 — LOW — undescribed entities
`collection_allocations`, `numbering_sequences`, `suppliers` appear in lists without field/relationship notes. Correction: add short definitions (or drop if redundant). Owner approval: none.

### F14 — LOW — location/scope clarifications
State `outbox_items` as device-local only (server keeps watermark on `devices`); numbering sequences per-tenant scope; dormant flags validated against known value sets. Correction: editorial. Owner approval: none.

### F15 — INFORMATIONAL — proper deferrals confirmed
D9 structures correctly deferred to mini-spec execution; HSN snapshot on lines is data, not computation — consistent with dormant GST. No action.

## Blocker summary
F1 (payments/claims model) · F2 (service money linkage) · F3 (retention policy). All three need owner/business input — they cannot be resolved by baseline drafting alone.

## High-risk findings
F4 (allocation join entity) · F5 (index/CHECK schedule) · F6 (enrollment/requester paths) — all resolvable in baseline drafting without owner pre-approval; must be closed before baseline review.

## Required documentation changes
1. Resolve F1–F3 with owner input; record decisions.
2. Apply F4–F6 corrections into the design spec.
3. Apply F7–F11 rules; F12–F14 editorial pass.
4. Complete D9 detailed mini-spec and BBPS freeze (prior blockers, unchanged).

## Schema readiness verdict: NOT READY
Baseline drafting is blocked on owner input (F1, F2, F3, D9 detail, BBPS). CONDITIONALLY READY is not appropriate: the outstanding items change tables and relationships, not just defaults.

## Confirmation of zero implementation changes
No SQL, migrations, code, tests, database objects, configuration, or application files created or modified. No database or external system contacted. Nothing committed or branched.
