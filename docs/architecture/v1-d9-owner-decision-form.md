# D9 Owner Decision Form — Historical Back-Entry
ERP: CyberCafe & Digital Services ERP · Companion to `v1-historical-back-entry-mini-spec.md`
Status: **APPROVED BY OWNER — 2026-09-21.** D9.1–D9.4 recorded below; detailed implementation choices remain subject to schema design review.

Locked context (not re-decided): opening 01-01-2026; admin-only back-entry with admin lock; FIFO + batches + expiry; cancel-and-recreate; ₹0.01 half-up; balanced journals; append-only audit with actor/reason/values; idempotency uniques.

## D9.1 — Historical lookback limit
- Question: Earliest allowable back-entry business date?
- Options: (a) 12 months (from 2025-01-01) · (b) 6 months (lighter, less history) · (c) unlimited (heaviest, most drift risk).
- Accounting/audit implications: longer windows import more unverifiable history, weaken opening-balance assurance, and expand the reconciliation surface; shorter windows may strand genuine dues/stock continuity.
- Recommendation: **(a) 12 months — PROPOSED.**
- Owner selection: [x] (a) — APPROVED OWNER DECISION 2026-09-21
- Notes: Historical lookback limit 12 months (from 2025-01-01).

## D9.2 — Back-entry lock granularity
- Question: Single atomic lock, or per-month / per-transaction-class locks?
- Options: (a) single atomic lock · (b) per-month locks (staged closure) · (c) per-class locks (inventory vs cash vs dues).
- Correction/reopening implications: granular locks allow partial reopening but multiply lock bookkeeping and cross-module inconsistency risk (e.g., cash locked while linked dues open); single lock is simplest to reason about and audit.
- Recommendation: **(a) single atomic lock — PROPOSED.**
- Owner selection: [x] (a) — APPROVED OWNER DECISION 2026-09-21
- Notes: Single atomic lock for the back-entry period.

## D9.3 — Unknown expiry handling
- Question: Lines with unknown lot expiry — block, quarantine, or controlled admin override?
- Options: (a) reject the line · (b) quarantine (usable only after expiry documented) · (c) admin override with reason (usable immediately).
- FIFO/safety implications: FIFO ordering is unaffected (receipt-date driven), but unknown expiry risks selling expired goods; (c) trades safety for continuity and concentrates risk on one override path.
- Recommendation: **(a) reject unless expiry is documented — PROPOSED** (with (b) available per-line at admin discretion, never as default).
- Owner selection: [x] (a) — APPROVED OWNER DECISION 2026-09-21
- Notes: Reject inventory records with unknown expiry. No uncontrolled usage of unknown-expiry lots.

## D9.4 — Suspense mechanics
- Question: When is suspense required, who clears it, with what evidence, and what journals/audit apply?
- When required (PROPOSED): missing counterparty, missing cost with no defensible aggregate, or unresolvable source refs — park, never invent.
- Who may clear (PROPOSED): Admin only, before lock; uncleared items go to the signed exception list.
- Supporting evidence (PROPOSED): source document or written owner attestation attached to the suspense record.
- Audit/journal (PROPOSED): suspense movements are journaled legs with reason + actor; clearing links back to the original suspense entry; all append-only.
- Alternatives: forbid suspense entirely (forces rejection of anything imperfect — cleaner ledger, possible data loss).
- Recommendation: **suspense as proposed — PROPOSED.**
- Owner selection: [x] As proposed — APPROVED OWNER DECISION 2026-09-21
- Notes: Suspense-as-proposed approved, preserving evidence, authorized clearing, balanced journals, and complete audit history requirements.

## Plain-text response template (copy, fill, return)
```
D9 OWNER DECISIONS — date: __________
D9.1 lookback: [(a) 12 months / (b) 6 months / (c) unlimited / Amended: ___]
D9.2 lock: [(a) single / (b) per-month / (c) per-class / Amended: ___]
D9.3 unknown expiry: [(a) reject / (b) quarantine / (c) admin override / Amended: ___]
D9.4 suspense: [As proposed / Forbid / Amended: ___]
Approver name: __________  Signature/date: __________
```
