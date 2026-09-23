# V1 Returns / Refunds Mini-Spec

Status: **APPROVED — proportional header-discount allocation confirmed for V1 implementation.**

Basis:
- G0–G13 database baseline
- V1 POS workflow
- V1 owner decision register
- existing invoice / invoice-line / invoice-line-lot / payment-claim / journal contracts

This document does not silently alter an existing business decision.

## 1. Scope

Returns/refunds are a composed workflow over an existing posted sale.

The workflow MUST NOT use \`edit_invoice\` or \`cancel_invoice\` as a substitute for a partial return.

The original invoice remains immutable/auditable. A return receives its own immutable return document and links to the original invoice.

Supported V1 outcomes:

- partial or full return of sold quantities
- sellable return to stock
- damaged/unsellable return to quarantine
- default customer-credit (khata) refund
- Admin-approved cash refund
- Admin approval for every return/refund
- idempotent execution
- original-lot traceability
- journal posting and audit linkage

Live payment-provider refund APIs are out of scope.

## 2. Proposed data model

### 2.1 return_documents

One row per return request/execution.

Proposed fields:

- id
- tenant_id
- original_invoice_id
- return_number
- status
- reason
- subtotal_returned
- discount_returned
- refund_total
- refund_method
- customer_id
- approval_id
- requested_by
- approved_by
- approved_at
- created_at
- updated_at

Suggested status lifecycle:

\`requested → approved → posted\`

Failure/correction states:

\`rejected\`, \`cancelled\`

No deletion.

### 2.2 return_lines

One row per returned invoice line.

- id
- tenant_id
- return_document_id
- original_invoice_line_id
- product_id
- qty
- unit_refund_value
- refund_amount
- disposition
- reason
- created_at

\`qty\` MUST be positive and MUST NOT exceed the still-returnable quantity of the original invoice line.

### 2.3 return_line_lots

Lot-level traceability for the returned quantity.

- id
- tenant_id
- return_line_id
- original_invoice_line_lot_id
- lot_id
- qty
- unit_cost
- created_at

The returned quantity MUST reconcile exactly to the return line quantity.

### 2.4 refund_records

Explicit refund outcome.

- id
- tenant_id
- return_document_id
- method
- amount
- claim_id nullable
- journal_entry_id
- created_at

V1 methods:

- \`khata_credit\`
- \`cash\`

Other refund methods remain deferred until their accounting semantics are explicitly approved.

## 3. Quantity invariant

For every original invoice line:

\`sum(returned quantities across non-cancelled return documents) <= original sold quantity\`

For every return line:

\`sum(return_line_lots.qty) = return_line.qty\`

The server owns these checks under row locking.

A second concurrent return MUST fail rather than oversell the returnable quantity.

## 4. Lot handling

Original sale allocation is authoritative through \`invoice_line_lots\`.

For a sellable return, returned quantity is restored to the same original lot(s) where possible, preserving:

- lot identity
- unit cost
- expiry
- FIFO history

For damaged/unsellable returns, the quantity is not restored to ordinary sellable availability. It enters the existing quarantine lifecycle.

The server determines the actual lot quantities. The client cannot manufacture lot allocation.

## 5. Approval

Every return requires Admin approval.

The approval scope MUST bind at least:

- original invoice
- selected invoice lines
- quantities
- return disposition
- refund method
- refund amount

The existing G7 approval mechanism is reused.

No return execution occurs merely because a request exists.

Sole-Admin self-approval follows the already-approved SoD exception.

## 6. Refund destination

### Default

\`khata_credit\`

This is the locked V1 default.

The customer account receives the approved refund credit through the existing financial posting path.

### Cash

\`cash\`

Cash refund requires Admin approval.

The refund must be represented by an explicit financial journal/disbursement leg. It must NOT be implemented by creating a positive \`payment_claim\`, because recognized claims are inflows in the existing V1 model.

## 7. Accounting

Return posting must be atomic with inventory and refund state.

The exact journal legs depend on the approved refund-value allocation rule.

The implementation MUST preserve:

- exact two-sided journal balance
- tenant balance
- original-invoice linkage
- return-document linkage
- idempotency
- locked-period rules
- audit trail

A generic \`post_journal\` call with invented accounts is prohibited.

## 8. Refund-value allocation — OWNER CONFIRMATION REQUIRED

The current invoice model stores discount at header level:

- invoice subtotal
- invoice discount
- invoice total
- invoice-line amounts

It does **not** store a persisted per-line discount allocation.

Therefore the system cannot safely infer the refund amount for a partial return without an explicit rule.

### Proposed option A — proportional allocation

For a return of selected lines:

\`line allocated discount = invoice discount × line amount / invoice subtotal\`

The return value is:

\`line amount - allocated discount\`

Rounding uses the global V1 rule: ₹0.01 half-up.

The final returned amount must be reconciled so the sum of allocated discounts equals the invoice discount when the entire invoice is returned.

**Owner approved: proportional allocation is the V1 rule.**

### Not allowed

Do not:

- refund the full invoice discount on the first partial return
- ignore the invoice discount
- invent a new line-discount field retroactively
- use client-calculated refund values as authority
- silently use a different allocation rule

## 9. Idempotency

Return creation/execution must accept an idempotency key.

Same tenant + same idempotency scope/key must replay the original response.

Duplicate execution must not:

- duplicate stock restoration
- duplicate quarantine movement
- duplicate refund
- duplicate journal
- duplicate approval consumption

## 10. Period locking

Return/refund posting must obey the existing locked-period guard.

If the posting date is locked, the operation is rejected.

No unlock/reopen path is introduced.

## 11. Audit

Audit must capture:

- original invoice
- return document
- requester
- approver
- self-approval flag where applicable
- quantities
- disposition
- refund method
- refund amount
- reason
- journal linkage
- execution timestamp

No financial return record is deleted.

## 12. Proposed RPC surface

No existing RPC is overloaded.

Proposed new RPCs after approval:

- \`request_return\`
- \`approve_return\`
- \`reject_return\`
- \`execute_return\`
- \`record_refund\`

The exact split may be collapsed during implementation if a single atomic server workflow provides the same guarantees, but no business rule may be lost.

All write RPCs:

- SECURITY DEFINER
- fixed search_path
- REVOKE PUBLIC
- least-privilege grants
- deny-default RLS
- server-side authorization
- server-side tenant derivation
- server-side money/quantity validation

## 13. UI dependency

No Returns UI should be exposed before the backend contract and gates exist.

Once V1_015 is approved and gated, UI can provide:

- invoice lookup
- returnable quantities
- line selection
- disposition
- refund method
- reason
- approval request
- Admin approval/rejection
- execution result
- return receipt/audit reference

## 14. Acceptance gates

V1_015 must test at minimum:

1. partial return
2. full return
3. over-return rejection
4. concurrent-return protection
5. original-lot restoration
6. damaged/quarantine disposition
7. khata refund
8. Admin-approved cash refund
9. non-Admin rejection
10. approval scope drift rejection
11. sole-Admin self-approval
12. multi-Admin SoD
13. locked-period rejection
14. idempotent replay
15. failure atomicity
16. journal balance
17. tenant isolation
18. audit linkage
19. original invoice preservation
20. no legacy-table/RPC dependency

## 15. Explicit blocker

Owner approval recorded: **proportional line-level discount allocation** is the V1 rule for partial returns.

Implementation note: V1 uses the existing G7 approval RPC for approval/rejection and a single atomic `execute_return` workflow for inventory + journal + refund-record posting; separate `approve_return` / `record_refund` RPCs are not required.
