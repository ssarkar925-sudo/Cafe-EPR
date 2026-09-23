# V1 POS Workflow Specification

Status: **DESIGN ONLY — no code, no checkout, no cart engine, no barcode
implementation, no payment/khata logic, no discount execution, no
returns/refunds, no offline queue, no sync worker, no print CSS.**

Basis: approved `v1-schema-implementation-plan.md` (G3 documents, G4
claims/khata, G7 approvals, G9 offline protocol), `v1-transaction-sync-spec.md`
(lifecycle, FIFO, financial safety), and the G0–G13 gated baseline. Nothing
here invents a business rule, RPC, or DB object. Open points are recorded in
`v1-owner-decision-register.md`, never resolved here.

## 1. Overview
The V1 POS is a cart-based counter application designed for keyboard /
barcode-wedge input, maintaining server-authoritative financial state. The
counter home is cart-focused; offline/sync state is always visible. Every
value the operator sees before `create_sale` succeeds is a **presentation
estimate**; the server recomputes all totals from lines, lots, and masters at
validation time (mismatch beyond ₹0.01 half-up → `TOTAL_MISMATCH` reject).

## 2. POS Workflow Steps

### 2.1 Counter Home (Screen 1)
- **Layout:** Cart-focused view with persistent offline/sync status banner.
- **Visibility:** Always visible — sync state (green dot/queued count / red dot/conflict).
- **Actions:** Focus moves to barcode field on load.

### 2.2 Barcode Wedge Input (Screen 2)
- **Input:** One autofocus `<input type="text">` field labeled "Scan barcode" or "Search product".
- **Scanner Behavior:** Device sends digits followed by Enter (hardware wedge).
- **Successful Scan:** Increments quantity of existing cart line, OR adds new line if barcode not in cart. Focus returns to barcode field.
- **Wrong Barcode:** Does NOT modify cart. Visual feedback "Product not found" briefly; focus remains on barcode field.
- **Delete (Del):** Removes selected cart line entirely.
- **Escape (Esc):** Clears barcode input field only, does not affect cart.

### 2.3 Cart (Screen 3)
- **Items:** Each cart line shows name, qty, unit price, line total.
- **Server Authority:** Final totals are **server-authoritative**. Client displays **estimates only**.
- **No Suspended Cart:** There is no suspend/resume, no parked-cart list, and
  no multi-cart switching in V1. An unsubmitted cart is ephemeral session
  state: leaving the counter without submitting discards it. Persistence
  begins only at `offline_created`, when the immutable payload (with
  `client_uuid` + `p_idempotency_key`) is written to the outbox — see §2.8.
- **Totals:** Subtotal, discount (if approved), total — all marked "estimate" in UI.

### 2.4 Optional Customer/Khata Selection (Screen 4)
- **Customer Select:** Optional lookup by name/phone. If selected, customer ID carried into sale.
- **Khata Dues:** If khata selected, current dues display and credit-limit enforcement noted (server-side).
- **Default:** No customer selected unless operator explicitly chooses.

### 2.5 Payment Entry (Screen 5)
- **Payment Methods:** Cash, UPI, Card, Wallet, Credit.
- **Split Payment:** Multiple methods allowed; each split line shows method + amount. Server validates sum = total.
- **Credit Enforcement:** Server-side credit-limit check. Display "Within limit" or "Exceeds limit — admin override needed".

### 2.6 Discount Approval (Conditional)
- Any discount > 0 blocks submission and triggers `request_approval`
  (G7; approval scope binds document lines + discount + requester).
- An Admin must `approve_override`; the approver profile id is carried into
  the sale (`V1InvoiceRow.approver_profile_id`) and printed on the receipt.
- Approvals expire after 15 min; an expired or scope-drifted approval (lines
  or discount changed after approval) requires a fresh `request_approval`.
- Separation of duties applies per the approved register (sole-admin
  self-approval exception applies only where the register allows it).

### 2.7 Submit Sale (Screen 6)
- `create_sale` RPC with canonical invoice number, total, change.
- Receipt transition: Offline-created receipts show "UNSYNCED — NOT FINAL" until sync.

### 2.8 Offline / Provisional (Screen 7)
- **Provisional Number:** Device-side provisional identifier (format
  **[★ PROPOSAL]**: `PROV-YYYYMMDD-XXXX`; canonical numbers are assigned
  only by the server at `server_validated`). Provisional numbers are never
  shown as final and never reused as canonical numbers.
- **Watermark:** "UNSYNCED — NOT FINAL" displayed on screen and on any
  printed receipt until the server confirms the sale.
- **Queued State:** `offline_created` payload is written to the persistent
  outbox (survives app restart); sync resumes from the per-device watermark.
- **Sync:** On reconnection, `sync_flush` sends the queued sale in outbox
  order with stop-on-first-failure; on success the canonical number replaces
  the provisional number everywhere (screen + reprint).

### 2.9 Returns/Refunds
- Documented as later composed workflows only. Not implemented in V1.

## 3. POS State Machine (UI + Financial + Sync)

```
Idle ──► Scanning ──► Cart-Ready ──► Customer-Selected ──► Payment-Entry
   │                      │                      │
   │                      └───── approval-required ◄──┘
   │
   └───── ready-to-submit ──► submitting ──► server-confirmed
                                         │
                                         └─ offline-created ──► queued
```

### State Descriptions
| State | UI Meaning | Server Financial | Offline Provisional |
|---|---|---|---|
| **idle** | No sale in progress | N/A | N/A |
| **scanning** | Barcode field focused | N/A | N/A |
| **cart-ready** | Items in cart, totals shown | Estimate only | N/A |
| **customer-selected** | Customer panel visible | Estimate only | N/A |
| **payment-entry** | Payment split UI visible | Estimate only | N/A |
| **approval-required** | Discount approval modal open | Discount frozen pending approval | N/A |
| **ready-to-submit** | "Submit" enabled | Estimate only | N/A |
| **submitting** | Spinner / "Submitting..." | Provisional → queued (offline) | Draft created |
| **server-confirmed** | Receipt shows canonical number | Posted, canonical invoice | N/A |
| **offline-created** | "UNSYNCED — NOT FINAL" visible | Draft saved locally, no invoice yet | Provisional invoice |
| **queued** | Pending sync indicator | In outbox, awaiting sync_flush | Queued in localStorage |
| **sync-failed** | Red badge, retry action | Failed on sync, preserved in outbox | Retry required |
| **conflict** | Conflict dialog, resolve or discard | Server detected conflict | Manual resolution required |
| **receipt-ready** | Print button enabled | Canonical invoice available | After sync confirmation |

### Distinctions
- **UI State:** What the operator sees on screen (transient, local).
- **Server Financial State:** Authoritative financial state in the database (posted, canonical invoice).
- **Offline Provisional State:** Browser-local draft that has not yet reached server (UNSYNCED watermark).

## 4. Component Contracts (Conceptual — no business logic)

| Module | Responsibility | Input | Output |
|---|---|---|---|
| `V1PosContainer` | Orchestrates workflow, state machine transitions | `session.tenantId`, device identity | Current UI state, totals |
| `V1BarcodeScanner` | Wedge-input hook, debounce, Enter handling | `onScan(barcode: string)`, `onEsc()` | `barcode` emitted, focus restored |
| `V1Cart` | Line items, display totals, estimate flags | `lines: V1SaleLine[]`, `session.tenantId` | `subtotal, total, estimateFlags` |
| `V1SaleLine` | Single line representation | `productId, name, qty, rate` (estimate) | `lineTotal, displayString` |
| `V1KhataPanel` | Customer/khata selection, dues display | `customerId?, khataId?` | `selectedCustomer, duesDisplay` |
| `V1PaymentSplit` | Payment method/amount control | `availableMethods: V1ClaimMethod[]` | `selectedSplits: {method, amount}[]` |
| `V1ApprovalModal` | Discount/override capture | `scopeHash, currentDiscount` | `approved: boolean, approverId` |
| `V1OfflineBanner` | Sync status visibility | `queuedCount, hasConflict, isOnline` | `"online" \| "offline" \| "syncing" \| "conflict"` |
| `V1SyncBadge` | Queued/conflict indicator | `syncState` | Badge with count/state |
| `V1ConfirmationPanel` | Final submit confirmation | `invoiceTotal, change, paymentSplits` | `proceed: boolean` |
| `V1ReceiptHandoff` | Receipt display + print trigger | `invoice: V1InvoiceRow` | `print: void, download: void` |

## 5. Boundary — What Is Estimated vs Authoritative

| Item | Classification |
|---|---|
| Cart subtotal estimate | **Presentation only** — not authoritative |
| Authoritative total | **Server** — recomputed from lines + approved adjustments (no tax math in V1; GST seams dormant) |
| Inventory quantity | **Server** — FIFO allocation, stock_lots.qty_remaining |
| FIFO allocation | **Server** — `allocate_fifo` RPC; never client-computed |
| Payment recognition | **Server** — `record_claim`/`recognize_claim` RPC |
| Credit limit | **Server** — enforced at `create_sale` validation |
| Canonical number | **Server** — generated by `create_sale`, replaces provisional |
| Timestamp | **Server** — `invoice_date` from RPC, not from client clock |
| Journal posting | **Server** — atomic post-journal after `server_validated` |
| Discount approval | **Server** — `approve_override` binds approver JWT sub |

## 6. Glossary
- **Wedge:** Hardware barcode scanner that sends digits + Enter to an autofocus input.
- **Provisional number:** Client-generated invoice number (`PROV-YYYYMMDD-XXXX`) used until sync.
- **Canonical number:** Server-assigned invoice number after `create_sale` success.
- **Offline-created:** Sale drafted locally, watermarked "UNSYNCED — NOT FINAL", queued for sync.
- **Estimate:** Client-side display value that does not reflect server state.