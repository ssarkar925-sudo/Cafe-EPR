# V1 System / E2E Test Plan

Status: **SPECIFICATION ONLY — scenarios are defined here, never executed
in this phase. They replace (not port) the legacy `docs/E2E_TEST_MATRIX.md`.**

Basis: G0–G13 gated baseline, `v1-pos-workflow-spec.md`,
`v1-pos-state-component-spec.md`, `v1-thermal-receipt-spec.md`,
`v1-offline-arch-mapping.md`, and owner decisions D1–D11 / F1–F3.
Unless a scenario states otherwise, the actor's session is valid, the
device is enrolled and `active`, masters are cached fresh, and the period
is open.

Conventions used below: **Pre** = precondition · **Actor** = role ·
**Action** = steps · **UI** = expected UI result · **BE** = expected
backend result · **Acct** = accounting expectation · **Audit** = audit
expectation · **Fail** = failure expectation (what must happen when the
negative path is taken). Amounts use ₹0.01 half-up tolerance throughout.

---

## 1. Legacy boundary (assertions that must NOT be ported)

The legacy matrix (`docs/E2E_TEST_MATRIX.md`) is referenced only to name
what V1 forbids. None of the following may appear in any V1 scenario,
fixture, or expected journal:

- Any GST-rate computation, GST-inclusive totals, GST journal legs,
  tax-invoice titles, or tax-rate lookup at cart (legacy POS-01, POS-06).
- Weighted-average-cost blending equations (legacy INV-01). V1 costs by FIFO
  lot `unit_cost`; there is no average-cost field anywhere.
- The legacy express quick-sale RPC and tables, express quick-sale flows,
  15-minute sale-cancellation windows, "cashbook" legs (legacy QS-01–QS-03).
- The legacy return-processing RPC and legacy financial tables / account
  codes (e.g. shrinkage to a legacy expense account, legacy return journal
  pair) (legacy POS-05, INV-03).
- Live BBPS fetch ("live fetch returns ₹1,480"), live gateway calls, card
  facility decrements (legacy BNK-06). V1 services are record-only (D10).
- WhatsApp Cloud API and AI-assistant gates (legacy WA-01–WA-03,
  AI-01–AI-04): deferred, not V1 scope.
- `[↪ Use Self]`-style legacy UI population (legacy BNK-03).
- The legacy manual-adjustment RPC name (the V1 RPC is `adjust_stock`).

---

## 2. Scenarios

### A. Online POS sale (V1-POS-A)

- **Pre:** Product P has an open, unexpired lot with qty ≥ 2; no customer selected.
- **Actor:** Cashier.
- **Action:** Scan P twice → cart shows 2 × rate → Cash full tender → submit.
- **UI:** `ready-to-submit → submitting → server-confirmed → receipt-ready`;
  canonical number shown; change-due shown.
- **BE:** `create_sale` posts one invoice (`status = posted`,
  `canonical_number` set, `provisional_number` null); FIFO consumes the
  oldest open lot; `p_idempotency_key` stored.
- **Acct:** One balanced batch (Σdebit = Σcredit); sale + payment legs only.
- **Audit:** `audit_logs` row with actor, device, idempotency key.
- **Fail:** Double-click submit replays the same key → single invoice
  (no duplicate).

### B. Barcode sale (V1-POS-B)

- **Pre:** Product P has barcode `8901234567890` in the catalog snapshot.
- **Actor:** Cashier.
- **Action:** Wedge-scan `8901234567890` + Enter, twice; then scan unknown `000000`.
- **UI:** First scan adds the line, second increments qty to 2, focus returns
  to the barcode field; unknown scan shows "not found" and changes nothing;
  Esc clears the field; Del removes the selected line.
- **BE:** No RPC fires until submit (scanning is snapshot-local).
- **Acct:** None at scan time.
- **Audit:** None at scan time.
- **Fail:** Wrong barcode must not create, alter, or delete any cart line.

### C. Khata sale (V1-POS-C)

- **Pre:** Customer K with dues ₹1,800 and limit ₹2,000.
- **Actor:** Cashier.
- **Action:** Select K → cart ₹500 → tender Credit → submit.
- **UI:** Dues display from `dues_of`; limit hint "exceeds limit" would block;
  here within limit so submit enables.
- **BE:** `create_sale` + `record_claim` (method `credit`, state `recorded`);
  recognition follows the Admin-gated path (F1).
- **Acct:** Receivable leg for ₹500; journals post only on recognition.
- **Audit:** Claim row linked to invoice + actor.
- **Fail:** A ₹500 sale against dues ₹1,800 / limit ₹2,000 (total 2,300) is
  rejected `LIMIT_EXCEEDED`; nothing partially posts.

### D. Discount approval (V1-POS-D)

- **Pre:** Cart total ₹1,000; cashier requests ₹100 discount.
- **Actor:** Cashier (request) + Admin (approve).
- **Action:** Enter discount → `request_approval` → Admin `approve_override`
  → submit with approver ref.
- **UI:** `approval-required` blocks submit until approval is consumed,
  unexpired (15 min), and in-scope; receipt shows `Approved by: <name>`.
- **BE:** Approval row `pending → consumed`; invoice carries
  `approver_profile_id`; single-use (no replay of the approval).
- **Acct:** Discount leg for ₹100; totals still balance.
- **Audit:** Approval record (approver JWT sub, timestamp, scope hash).
- **Fail:** Expired approval, or lines changed after approval (scope drift),
  forces a fresh `request_approval`; submission without approval is blocked.

### E. Return approval (V1-POS-E)

- **Pre:** Posted invoice I (1 × ₹500 item, traceable lot L).
- **Actor:** Staff (request) + Admin (approve).
- **Action:** Request return against I → Admin approves → composed
  return executes (later-phase workflow; this scenario specifies the gate).
- **UI:** Return request state visible; execution blocked until approval.
- **BE:** Approval consumed; restock targets original lot L when traceable
  (expiry re-checked), else the oldest open lot; mirror entries link both ways.
- **Acct:** Full-document mirror reversal entries; never an edit of posted rows.
- **Audit:** Requester, approver, reason, both document links.
- **Fail:** Return without Admin approval is rejected; returns never restock
  expired lots.

### F. Cash refund (V1-POS-F)

- **Pre:** Approved return entitling the customer to ₹500 cash.
- **Actor:** Admin (approve + disburse) — cashiers never silently pay out.
- **Action:** Approve refund → disburse ₹500 from the mapped till instrument.
- **UI:** Disbursement screen shows approval ref + instrument balance hint.
- **BE:** Approval-gated disbursement rows; instrument balance reduced.
- **Acct:** Refund legs balance; default path remains khata credit unless
  cash is explicitly approved.
- **Audit:** Approver, recipient, instrument, reason.
- **Fail:** Cash payout without approval is rejected at the RPC.

### G. FIFO multi-lot consumption (V1-INV-G)

- **Pre:** Product P: lot L1 (received Jan, 10 units @ ₹80), L2 (Feb,
  20 units @ ₹100), both open and unexpired.
- **Actor:** System (via `create_sale` for 25 units).
- **Action:** Submit the sale.
- **BE:** Allocation consumes L1 fully (10 @ ₹80) then 15 from L2 (@ ₹100);
  L1 → `exhausted`; COGS reflects each lot's own `unit_cost` (no blending).
- **Acct:** COGS legs use true FIFO cost; batch balances.
- **Audit:** Allocation rows reference L1, L2 with quantities.
- **Fail:** Any WAC-style averaged cost in any leg fails the scenario.

### H. Expired/quarantined stock rejection (V1-INV-H)

- **Pre:** Product P: lot LX (`expired`), lot LQ (`quarantined`); no open lots.
- **Actor:** Cashier.
- **Action:** Attempt to sell 1 unit of P.
- **UI:** Sale blocked with stock/availability reason.
- **BE:** Line rejected (`EXPIRED_LOT` class); no negative inventory; no
  backorder row created.
- **Acct:** Nothing posts.
- **Audit:** Rejection recorded with reason + lot refs.
- **Fail:** Warn-and-sell (any path that completes the sale) fails the scenario.

### I. Purchase intake (V1-INV-I)

- **Pre:** Supplier S active; product P master active.
- **Actor:** Manager.
- **Action:** `create_purchase` (20 units @ ₹100) → `intake_lots` with
  `received_at` + `expiry_date`.
- **UI:** Purchase → intake → lot list shows the new open lot.
- **BE:** New `stock_lots` row (open, qty 20 @ ₹100); monthly-aggregate lots
  per D9 Option A where applicable (`received_at` = month start).
- **Acct:** Payable legs balance; no cost averaging.
- **Audit:** Actor + supplier + purchase link on the lot.
- **Fail:** Intake with unknown expiry for an expiry-tracked product is
  rejected (D9.3); intake never creates a blended-cost row.

### J. AEPS record-only (V1-SVC-J)

- **Pre:** AEPS portal instrument configured; till float recorded.
- **Actor:** Staff.
- **Action:** `record_service_txn` (type `aeps`, amount, Aadhaar last-4 max,
  portal refs).
- **UI:** Record-only form; no live-gateway button exists.
- **BE:** `service_transactions` row `recorded`, FK via
  (`source_type`, `source_id`); fee/commission legs per F2.
- **Acct:** Per-type leg balance including the fee leg.
- **Audit:** Beneficiary refs limited to last-4 (F3 minimization).
- **Fail:** Any live API call, or storing full Aadhaar/account numbers,
  fails the scenario.

### K. DMT record-only (V1-SVC-K)

- **Pre:** DMT portal instrument configured.
- **Actor:** Staff.
- **Action:** `record_service_txn` (type `dmt`, beneficiary name/account/IFSC
  as refs, amounts, charges).
- **UI/BE/Acct/Audit/Fail:** As J, with DMT field list; no "Use Self"
  auto-population from legacy UI.

### L. UPI record-only (V1-SVC-L)

- **Pre:** UPI instrument configured.
- **Actor:** Staff.
- **Action:** `record_service_txn` (type `upi`, UTR ref, amount).
- **UI/BE/Acct/Audit/Fail:** As J, with UTR evidence; no dynamic-QR
  disbursement machinery (record-only in V1).

### M. Recharge record-only (V1-SVC-M)

- **Pre:** Recharge portal instrument configured.
- **Actor:** Staff.
- **Action:** `record_service_txn` (type `recharge`, operator, number
  masked per F3, amount).
- **UI/BE/Acct/Audit/Fail:** As J, with masked subscriber identity.

### N. BBPS record-only (V1-SVC-N)

- **Pre:** BBPS uncertainty preserved (D10/F2: thinnest money-leg evidence).
- **Actor:** Staff.
- **Action:** `record_service_txn` (type `bbps`, bill ref + amount + date
  per OD-P5-03 outcome; no live fetch).
- **UI/BE/Acct/Audit/Fail:** As J; any live bill-fetch or credit-facility
  decrement fails the scenario.

### O. Day close (V1-FIN-O)

- **Pre:** Business date open; instruments have expected balances.
- **Actor:** Manager.
- **Action:** `open_day_close` → `record_day_counts` →
  `expected_instrument_balance` compare → `close_day_close`.
- **UI:** Count form → variance display → locked banner.
- **BE:** Day-close row `open → locked`; counts stored with idempotency key.
- **Acct:** Zero-variance path posts nothing further.
- **Audit:** Counter, approver, timestamps.
- **Fail:** Closing with unacknowledged variances follows P, never silent.

### P. ₹1 variance (V1-FIN-P)

- **Pre:** Counted till differs from expected by more than ₹1.
- **Actor:** Manager (record) + Admin (approve).
- **Action:** Record counts → `post_variance_journal` → `approve_day_close`.
- **UI:** `variance_pending` state; approval gate visible.
- **BE:** Variance journal posted; close completes only after approval.
- **Acct:** Variance legs balance within ₹0.01.
- **Audit:** Variance amount, poster, approver.
- **Fail:** Variance above ₹1 closing without Admin approval is rejected.

### Q. Locked period (V1-FIN-Q)

- **Pre:** Period locked (day close locked / back-entry lock held).
- **Actor:** Staff.
- **Action:** Attempt to post a sale/payment into the locked period.
- **UI:** Blocked with locked-period reason.
- **BE:** Denied (lock-conflict matrix, G13); double-lock denied.
- **Acct:** Nothing posts.
- **Audit:** Denied attempt logged.
- **Fail:** Any posting path that lands inside a locked period fails.

### R. Internet loss mid-sale (V1-SYN-R)

- **Pre:** Cart ready, payment entered; connectivity drops before submit.
- **Actor:** Cashier.
- **Action:** Submit while offline.
- **UI:** `submitting → offline-created → queued`; `UNSYNCED — NOT FINAL`
  + provisional number; "1 unsynced" badge.
- **BE:** Immutable payload (`client_uuid` + `p_idempotency_key`) in the
  persistent outbox; no invoice row exists yet.
- **Acct:** Nothing posts offline (devices never post journals).
- **Audit:** Outbox write logged locally with seq.
- **Fail:** Any screen or print implying a final invoice fails the scenario.

### S. Resume after loss (V1-SYN-S)

- **Pre:** One queued record from R; connectivity restored.
- **Actor:** Cashier (or automatic flush on reconnect).
- **Action:** `sync_handshake` → `sync_flush` → `sync_acknowledge`.
- **UI:** Pending → confirmed; canonical number replaces provisional
  everywhere, including reprint.
- **BE:** `create_sale` executes once; watermark advances past the record.
- **Acct:** Single balanced batch (replay-safe).
- **Audit:** Ack logged with canonical number.
- **Fail:** Duplicate invoice from the same key fails the scenario.

### T. Duplicate replay (V1-SYN-T)

- **Pre:** Invoice I posted under key K.
- **Actor:** System (retry of key K within seconds, e.g. network hiccup).
- **Action:** Resubmit identical payload with key K.
- **UI:** Original result shown; no second receipt.
- **BE:** Stored result returned; nothing re-executes; `(tenant_id,
  idempotency_key)` uniqueness holds.
- **Acct:** No second batch.
- **Audit:** Replay noted against the original record.
- **Fail:** Any duplicate cashbook/journal movement fails the scenario.

### U. Stale epoch (V1-SYN-U)

- **Pre:** Device epoch superseded (re-enrollment elsewhere).
- **Actor:** Device (sync attempt with old epoch).
- **Action:** `sync_flush` under the stale epoch.
- **UI:** Sync halted; "session/device needs refresh" guidance.
- **BE:** Records rejected `STALE_EPOCH`; nothing executes.
- **Acct:** Nothing posts.
- **Audit:** Rejections logged with device + epoch.
- **Fail:** Executing any queued mutation under a stale epoch fails.

### V. Revoked device (V1-SYN-V)

- **Pre:** Admin revoked the device (`revoke_device`).
- **Actor:** Cashier on the revoked device.
- **Action:** Any sync attempt.
- **UI:** Access-denied state; queue paused with explanation.
- **BE:** `sync_handshake` rejects; no flush proceeds.
- **Acct:** Nothing posts.
- **Audit:** Revocation + denied attempts logged.
- **Fail:** Any successful mutation from a revoked device fails.

### W. Sync conflict (V1-SYN-W)

- **Pre:** Two devices hold the last units of lot L; device B syncs first.
- **Actor:** Cashier on device A (syncs second).
- **Action:** `sync_flush` of A's sale consuming L.
- **UI:** `conflict` dialog: correct-and-resubmit / discard / escalate.
- **BE:** Record marked `conflict` with reason (`INSUFFICIENT_STOCK`
  class); immutable `sync_conflicts` row written; all-or-nothing per
  document (D2) — no partial fulfilment.
- **Acct:** Nothing posts for the conflicted document.
- **Audit:** Conflict + disposition (actor, timestamp) recorded.
- **Fail:** Silent drop, partial posting, or auto-retry of the semantic
  rejection fails the scenario.

### X. Back-entry (V1-BCK-X)

- **Pre:** D9 mini-spec scope: within 12-month lookback (from 2025-01-01);
  atomic lock acquired (`acquire_back_entry_lock`); Admin actor.
- **Actor:** Admin.
- **Action:** `submit_back_entry_batch` with balanced lines + evidence.
- **UI:** Lock banner; batch preview with origins (`live | back_entry |
  opening`); submit gated on balance.
- **BE:** Batch `posted` with `V1JournalOrigin = back_entry`; suspense
  items (if any) carry evidence and clear only before lock (D9.4).
- **Acct:** Balanced journals with back-entry origin marking.
- **Audit:** Lock holder, lines, evidence refs.
- **Fail:** Back-entry outside lookback, without the atomic lock, with
  unknown-expiry inventory lines (D9.3), or by a non-Admin fails.

### Y. Monthly aggregate lot (V1-BCK-Y)

- **Pre:** D9 Option A approved: monthly-aggregate lots
  (product × calendar month × unit_cost).
- **Actor:** Admin (back-entry intake).
- **Action:** Intake back-entry stock for a product/month/cost bucket.
- **UI:** Lot shown as the month aggregate.
- **BE:** Single lot row with `received_at` = month start; FIFO position
  follows `received_at` order.
- **Acct:** Cost basis = bucket `unit_cost`; no blending across buckets.
- **Audit:** Bucket key + actor recorded.
- **Fail:** Per-day lots inside an aggregate month, or averaged costs
  across months, fail the scenario.

### Z. Back-entry void (V1-BCK-Z)

- **Pre:** Posted back-entry batch B (Admin).
- **Actor:** Admin.
- **Action:** `void_back_entry_batch` with reason.
- **UI:** Batch `posted → voided` with reason display.
- **BE:** Void recorded; original rows retained (never DELETE).
- **Acct:** Compensating entries balance; originals untouched.
- **Audit:** Void actor, timestamp, reason, batch link.
- **Fail:** Silent deletion of back-entry rows fails the scenario.

### AA. Audit verification (V1-SEC-AA)

- **Pre:** Any posted document with approvals and sync history.
- **Actor:** Admin (read-only review).
- **Action:** Open the audit trail for the document.
- **UI:** Chronological actor/action/entity/before-after/device/key view.
- **BE:** `audit_logs` append-only; no updates/deletes by any app role.
- **Acct:** N/A (read path).
- **Audit:** The review itself is logged.
- **Fail:** Any mutable or missing audit row fails the scenario.

### AB. Tenant isolation (V1-SEC-AB)

- **Pre:** Two tenants with identically-numbered documents.
- **Actor:** Authenticated user of tenant A.
- **Action:** Probe tenant B rows (direct read + RPC with B's ids).
- **UI:** Nothing renders; forbidden state.
- **BE:** RLS deny-by-default; every probe denied.
- **Acct:** Nothing exposed.
- **Audit:** Denied cross-tenant attempts logged.
- **Fail:** Any leaked row, total, or error oracle distinguishing B fails.

### AC. Role authorization (V1-SEC-AC)

- **Pre:** Cashier session (sales + collections only).
- **Actor:** Cashier.
- **Action:** Attempt restricted calls: `approve_override`,
  `adjust_stock`, `set_instrument_account`, `run_retention_purge`,
  opening-balance locks.
- **UI:** Restricted surfaces hidden (display only).
- **BE:** Every call denied (UI hiding is not the control; RPC gates are).
- **Acct:** Nothing posts.
- **Audit:** Denied attempts logged.
- **Fail:** Any privileged effect from a cashier session fails.

### AD. Thermal receipt completeness (V1-OUT-AD)

- **Pre:** Posted sale (canonical), khata sale, discount-approved sale,
  split-payment sale, provisional receipt, cancelled receipt.
- **Actor:** Operator (print) + reviewer (verify).
- **Action:** Print/preview each of the six receipts.
- **UI:** Responsive preview preserves 80mm line width, §1 field order,
  and watermark prominence before printing.
- **BE:** Figures byte-equal to the server rows; approver name resolves;
  provisional shows no server timestamp.
- **Acct:** Printed totals equal posted totals exactly.
- **Audit:** N/A (output check; reprints reference the source rows).
- **Fail:** Any missing §1 field, any §2 forbidden content (GST/WAC/tax
  title/secrets), or a missing UNSYNCED watermark on a provisional receipt
  fails the scenario.

---

## 3. Execution policy

Scenarios execute only in a future build/test phase against the gated
baseline, with exit-code-0 evidence per group checkpoint (G0 RLS matrix
through G13 lock-conflict matrix, plus the G15 print-content completeness
test). No scenario is executed, and no fixture is created, in this phase.
