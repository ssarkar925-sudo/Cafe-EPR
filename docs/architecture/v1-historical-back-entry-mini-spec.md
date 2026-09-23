# D9 — Historical Back-Entry Mini-Spec
ERP: CyberCafe & Digital Services ERP · Status: **DESIGN ONLY — no code, migrations, schemas, or DB changes**
Basis: Approved A2 + D1–D11. Legend: **[APPROVED]** = owner-decided · **[★ PROPOSAL]** = awaiting approval · **[? OWNER DECISION REQUIRED]** = must be answered in review.

## 1. Purpose and permitted use cases
Back-entry reconstructs pre-2026-01-01 history so opening position on 01-01-2026 is complete and auditable **[APPROVED: opening date; dedicated mini-spec required before schema]**. Permitted: opening inventory lots, historical purchases/sales needed for dues and stock continuity, opening cash/instrument balances, documented adjustments. Forbidden: back-dating live (post-opening) activity; editing closed periods; free-form entries without source references.

## 2. Historical transaction dates before 2026-01-01
Every back-entered record carries `business_date < 2026-01-01` **[APPROVED]**. Records dated on/after opening belong to live workflows only; back-entry window rejects them. **[? OWNER DECISION REQUIRED: earliest allowable back-entry date / lookback limit — ★ PROPOSAL: 12 months (from 2025-01-01).]**

## 3. Admin-only authorization
Back-entry is an Admin-only action **[APPROVED: admin enters + locks opening; admin-only approvals]**. Each batch requires an Admin approval record; Manager/Staff/Cashier have no back-entry rights. Sole-Admin self-approval rule (D5 amendment) applies.

## 4. Opening balance relationship and locking
Back-entry feeds the opening position; the opening lock closes the window. Sequence: back-enter → reconcile → lock **[APPROVED: admin locks]**. After lock: no new back-entries, no edits; corrections only via live-period journals with explicit back-entry linkage. **[? OWNER DECISION REQUIRED: single lock event vs per-module locks — ★ PROPOSAL: single atomic lock.]**

## 5. Historical FIFO lot creation and dating
Each historical purchase creates lots with original `received_at` and `expiry_date` **[APPROVED: FIFO + batches + expiry]**. Lot identity: `purchase_ref + line_no`. Where original lot granularity is unknown, aggregate into one lot per product per month with documented method **[★ PROPOSAL]**. Expiry unknown → **[? OWNER DECISION REQUIRED: reject line vs category-default shelf life — ★ PROPOSAL: reject unless documented.]**

## 6. Inventory quantity and valuation treatment
Quantities from source documents only; valuations at historical unit cost; amounts in ₹0.01 half-up **[APPROVED]**. No revaluation during back-entry; cost changes apply prospectively only.

## 7. Balanced accounting journal requirements
Every back-entered document posts balanced journals (Σdebit = Σcredit) dated at `business_date`, flagged `origin = back_entry` **[★ PROPOSAL on flag naming]**. Opening position is therefore fully journaled; trial balance at 2026-01-01 must be zero-net verifiable before lock.

## 8. Entry timestamp versus business date
Two timestamps: `business_date` (historical, drives ledger/FIFO/aging) and `entered_at` (server time at entry **[APPROVED: server-authoritative]**). Reports default to `business_date`; audit views show both. Device timestamps never authoritative.

## 9. Corrections through reversal and replacement
Cancel-and-recreate doctrine applies **[APPROVED]**: erroneous back-entries are reversed (mirror entries) and replaced, even before lock; after lock, corrections post in the live period referencing the original. No in-place edits, no deletes.

## 10. Audit trail and reason requirements
Every back-entry batch records: actor (Admin identity), timestamp, reason, source-document refs, original values. Self-approved overrides include reason + original/approved values per D5 amendment. Audit rows are append-only.

## 11. Validation rules
Reject on: missing product/customer master (masters must pre-exist), unknown lot expiry, unbalanced journals, totals mismatch beyond ₹0.01, duplicate keys, post-opening business dates, non-Admin actor. Expiry-blocked lines never auto-substitute.

## 12. Duplicate prevention and idempotency
Back-entry batches carry idempotency keys with unique `(tenant_id, batch_key)`; line identity `(source_ref, line_no)`; replays return prior results. Same source submitted twice = replay, never double-post.

## 13. Impact on offline synchronization
Back-entered history syncs to devices as **read-only reference** (balances, dues, lot snapshots); devices cannot create or alter back-entries **[★ PROPOSAL]**. Offline documents validate against synced opening-derived state; provisional reservations never touch historical lots directly (allocation consumes live availability computed from lots).

## 14. Incomplete or uncertain historical records
Policy: no invention **[APPROVED direction: document, don't guess]**. Missing cost → use documented aggregate method (§5) or reject line. Missing counterparty → park in a suspense entity with reason, resolved before lock **[★ PROPOSAL]**. Unresolvable items at lock time → excluded with an exception list signed by Admin **[★ PROPOSAL]**.

## 15. Approval and closure of the back-entry period
Closure checklist: all batches validated; trial balance zero-net at opening; lot continuity reconciled (received − sold − adjusted = on-hand per lot); exception list signed; Admin lock event recorded with timestamp. Post-closure changes prohibited except live-period corrections.

## 16. Required future schema entities and relationships (design requirements, not DDL)
`back_entry_batches(batch_key unique, actor, reason, window, state)` → `back_entry_lines(source_ref, line_no, business_date, lot_link?, opening_link?)`; `entered_at` vs `business_date` on all dated rows; `origin` flag on journals; suspense entity for parked items; lock event record. No tables are created by this document.

## 17. Worked examples (illustrative; follow approved rules, add no policy)
- **Opening inventory:** 10 units Product X @ ₹100 from Dec-2026 purchase bill #B-118 → lot L-1 (received 2025-12-18, qty 10, cost 100) + journal Dr Inventory / Cr Opening Equity 1,000.00.
- **Historical purchase:** supplier bill dated 2025-11-02, 2 lots (different costs) → two lot rows, FIFO order preserved; payable leg to supplier khata.
- **Historical sale:** cash sale 2025-12-20, 3 units → FIFO consumes oldest open lot; revenue + cash legs dated 2025-12-20.
- **Historical adjustment:** damaged 2 units found in count → quarantine move with reason + actor; Dr Inventory Adjustment / Cr Inventory.
- **Opening cash balance:** counted cash 2026-01-01 morning → Dr Cash Drawer / Cr Opening Equity; instrument opening row locked thereafter.

## Open decisions
Lookback limit (§2) · single vs per-module lock (§4) · unknown-expiry handling (§5) · suspense/exception-list mechanics (§14).

## Schema implications
Back-entry batch/line structures, dual timestamps, origin flags, suspense entity, lock record — all pending detailed schema design (still not implemented).

## Owner review checklist
- [ ] Approve/reject §2 lookback limit (default 12 months if accepted).
- [ ] Approve/reject single atomic lock (§4).
- [ ] Approve/reject unknown-expiry and suspense policies (§5, §14).
- [ ] Confirm worked examples reflect intended practice.
- [ ] Approve this mini-spec to unblock back-entry-related schema design.

## Confirmation of zero implementation changes
No code, migrations, schemas, database objects, tests, configuration, or application files created or modified. No database or external system contacted. Nothing committed or branched.
