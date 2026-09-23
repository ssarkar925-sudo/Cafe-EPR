# V1 POS State & Component Contract Specification

Status: **DESIGN ONLY — specification-level state model and module
contracts. No production state-management implementation, no business logic.**

Basis: `v1-pos-workflow-spec.md` (§2–§3), `v1-transaction-sync-spec.md`
(§1 lifecycle, §2 offline, §3 conflicts), and the G0–G13 gated baseline
(`V1InvoiceStatus`, `V1ClaimMethod`, `V1ClaimState`, `V1SyncReasonCode` in
`lib/v1/v1-contracts.ts`). Terminology matches those documents exactly.

---

## 1. The three state planes

The design distinguishes three planes that must never be conflated:

| Plane | Owner | Examples | May the operator act on it? |
|---|---|---|---|
| **UI state** | Browser session (ephemeral, except the outbox) | `idle … receipt-ready` (§2) | Yes — drives screens, focus, buttons |
| **Server financial state** | Database (`V1InvoiceStatus`) | `draft, offline_created, queued, server_validated, posted, failed, reversed, cancelled` | No — observed via RPC results only |
| **Offline provisional state** | Persistent device outbox | `queued, sent, acked, failed, conflict` per queue record | Yes — retry / correct-and-resubmit / discard / escalate (all audited) |

Rules:

1. UI state may **display** server state; it may never **assert** it. A screen
   showing "Paid" without a `posted` RPC result is a defect.
2. Offline provisional records are the only UI state that survives restart.
   An unsubmitted cart (`idle … ready-to-submit`) is lost on unload; an
   `offline_created` payload is not.
3. Devices NEVER post journals. Any UI label implying a journal entry before
   `posted` is a defect.

---

## 2. UI state model (13 states)

Transitions are operator- or connectivity-triggered. Only the listed
transitions are legal; all others return to the current state with no effect.

```
idle ──scan──► scanning ──match──► cart-ready ──select──► customer-selected
 │                 │                   │                        │
 │                 │ (no match: stay,  │                        ▼
 │                 │  "not found")     │                  payment-entry ──discount>0──► approval-required
 │                 │                   │                        │                              │
 │                 ▼                   ▼                        ▼                              │ approved
 │              (Esc: clear      ready-to-submit ──submit──► submitting ◄─────────────────────┘
 │               input only)          │                        │  │
 │                                    │                        │  ├──online──► server-confirmed ──► receipt-ready
 │                                    │                        │  └──offline─► offline-created ──► queued ──► receipt-ready*
 │                                    │                        │                                     │  │  │
 │                                    │                        │                              sync-failed conflict │
 │                                    │                        │                                  (retry / resolve → queued)
 │                                    └────────────────────────┘
 │                                     (* receipt carries UNSYNCED — NOT FINAL)
 └──cancel (pre-submit only)──► idle
```

### 2.1 State definitions

| UI state | Entry condition | Screen meaning | Server financial plane | Offline plane |
|---|---|---|---|---|
| `idle` | No sale in progress | Empty counter, barcode field focused | — | — |
| `scanning` | Barcode field has focus / input | Awaiting wedge Enter | — | — |
| `cart-ready` | ≥1 line in cart | Lines + estimates visible | Estimate only | — |
| `customer-selected` | Customer/khata chosen | Dues + limit hint visible | Estimate only | — |
| `payment-entry` | Payment panel open | Split lines + tendered vs total | Estimate only | — |
| `approval-required` | Discount > 0 entered | Submission blocked, approval requested | Discount frozen pending `approve_override` | — |
| `ready-to-submit` | All validations pass locally | Submit enabled | Estimate only | — |
| `submitting` | Submit pressed, RPC/outbox in flight | Spinner, inputs locked | `draft → offline_created → queued` requested | Record written |
| `server-confirmed` | `create_sale` returned canonical number | Canonical invoice + change shown | `posted` (observed) | `acked` |
| `offline-created` | Outbox write succeeded, no connectivity | "UNSYNCED — NOT FINAL" + provisional no. | No invoice yet | `queued` |
| `queued` | Awaiting `sync_flush` | Pending indicator + count | No invoice yet | `queued`/`sent` |
| `sync-failed` | `sync_flush` returned failure | Red badge, reason shown, retry offered | `failed` (observed) | `failed` |
| `conflict` | Server returned conflict disposition | Conflict dialog: correct-and-resubmit / discard / escalate | Per reason code | `conflict` |
| `receipt-ready` | Printable receipt available | Print button enabled (existing `PrintButton`/`AutoPrint` pattern) | Canonical, or provisional if offline | `acked`, or `queued` if offline |

### 2.2 Transition guard table (submit path)

| From → To | Guard | Failure behavior |
|---|---|---|
| `ready-to-submit → submitting` | Cart non-empty; splits sum = estimate total; discount = 0 OR approval consumed & in-scope & unexpired; customer within limit (cached hint only) | Stay; show first failing field |
| `submitting → server-confirmed` | Online `create_sale` success; totals accepted by server | — |
| `submitting → offline-created` | Outbox write success while offline | `submitting → idle` is FORBIDDEN (would lose the payload) |
| `offline-created → queued` | Automatic; record enters flush order | — |
| `queued → server-confirmed` | `sync_flush` + `sync_acknowledge` success; canonical number stored; provisional replaced | `→ sync-failed` / `→ conflict` per reason code |
| `sync-failed → queued` | Operator retry (transient) or correct-and-resubmit (semantic) | Semantic rejections are never auto-retried |
| `conflict → queued` | `resolve_conflict` success | Discard path requires reason + audit |
| Any pre-submit → `idle` | Operator cancel | Post-`submitting` cancel is FORBIDDEN (use `cancel_invoice` / reversal workflow) |

---

## 3. Component contracts (future modules only)

No business logic lives in these modules. Each contract lists
responsibility, inputs, outputs, and the RPCs it may reference (never call
directly except through the V1 mutation wrapper at implementation time).

### 3.1 `V1PosContainer` (page/container)

- **Responsibility:** Owns the UI state machine (§2); wires panels; the only
  module aware of all 13 states.
- **Input:** `session: V1SessionContext` (server-resolved), device identity
  (`V1LocalDevice`), cached masters snapshot (with timestamp).
- **Output:** Current UI state + composed estimate view-model for children.
- **References:** `create_sale`, `request_approval`, `sync_flush`,
  `sync_acknowledge`, `resolve_conflict`, `sync_handshake` (read).
- **Must not:** Compute totals authoritatively; post journals; cache secrets.

### 3.2 `useV1BarcodeWedge` (hook)

- **Responsibility:** Autofocus management; wedge Enter detection; Esc clears
  input only; Del removes the selected line; focus return after each scan.
- **Input:** `onScan(barcode: string)`, `onClear()`, `onRemoveSelected()`.
- **Output:** Current input value + `focus()` imperative handle.
- **Must not:** Resolve barcodes (resolution is a catalog lookup against the
  cached snapshot; a miss changes nothing and shows "not found").

### 3.3 `V1CartModel` + `V1CartLine`

- **Responsibility:** Line list with qty-step, line remove, estimate
  subtotal/discount/total. Every figure is labeled estimate.
- **Input:** `lines: V1SaleLine[]` (`product_id, qty, rate`), product snapshot
  (name, barcode, sale_price).
- **Output:** `{ lines, subtotalEstimate, discountEstimate, totalEstimate, isEstimate: true }`.
- **Must not:** Apply FIFO, convert units, or round authoritatively (server
  recomputes; ₹0.01 half-up mismatch → `TOTAL_MISMATCH`).

### 3.4 `V1CustomerKhataPanel`

- **Responsibility:** Optional customer lookup (name/phone); dues display via
  `dues_of` (read RPC); cached credit-limit hint.
- **Input:** `customerId?`, tenant snapshot timestamp.
- **Output:** `{ customerId?, duesDisplay, limitHint }`.
- **Must not:** Enforce limits (server enforces at `create_sale`; over-limit
  → reject, no partial credit).

### 3.5 `V1PaymentSplitPanel`

- **Responsibility:** One or more `{ method, amount }` rows where method ∈
  `V1ClaimMethod` (`cash, upi, card, wallet, credit`); tendered-vs-total
  arithmetic as estimate; change-due estimate.
- **Input:** `totalEstimate`, `availableMethods: V1ClaimMethod[]`.
- **Output:** `splits: { method, amount }[]`, `tenderedEstimate`, `changeEstimate`.
- **Must not:** Recognize payments (offline payments are **claims, not
  facts**; recognition is the Admin-gated `recognize_claim` RPC; journals
  post only on recognition per decision F1).

### 3.6 `V1DiscountApprovalModal`

- **Responsibility:** Capture discount request; show approval state
  (`pending → consumed | rejected`); block submit while pending/expired.
- **Input:** `scopeHash`, requested discount, approval record (`V1ApprovalRow`).
- **Output:** `{ status, approverProfileId? }`.
- **References:** `request_approval`, `approve_override`, `reject_approval`.
- **Must not:** Apply the discount locally as authoritative; approver must
  differ from requester per SoD (sole-admin exception per register only).

### 3.7 `V1OfflineBanner` + `V1SyncBadge`

- **Responsibility:** Always-visible connectivity + outbox state: online /
  offline / syncing / conflict; "N unsynced" count; last-ack watermark age.
- **Input:** Online status, outbox counts by state, last `sync_handshake` result.
- **Output:** Banner variant + badge count. No actions except "Retry sync"
  (transient only) and navigation to the exception queue.
- **Must not:** Hide the UNSYNCED watermark while any depended record is
  unacked; unflushed drafts must be disclosed (device/browser loss loses
  them — the badge is the disclosure).

### 3.8 `V1ConfirmationPanel`

- **Responsibility:** Pre-submit read-back: lines count, estimate total,
  splits, customer, approval ref; single Submit action; double-submit guard.
- **Input:** Composed estimate view-model + approval state.
- **Output:** `proceed: boolean` (single emission; button disables on emit).
- **Must not:** Submit twice (idempotency key is fixed at `offline_created`;
  the same key family is reused for retries, never a fresh key per click).

### 3.9 `V1ReceiptHandoff`

- **Responsibility:** Render the receipt view-model per
  `v1-thermal-receipt-spec.md`; hand off to the existing
  `PrintButton`/`AutoPrint` pattern (`window.print()` with
  `electronAPI.printThermal` fallback where present).
- **Input:** `invoice: V1InvoiceRow` (+ claim rows, approval ref, status flags).
- **Output:** Print trigger; reprint with canonical number after sync.
- **Must not:** Compute tax (none in V1), display WAC, or add print CSS
  (explicitly out of this phase); offline receipts always carry the
  UNSYNCED watermark.

---

## 4. Data contracts referenced (already gated, not redefined)

- `V1SaleLine { product_id, qty, rate }`, `V1InvoiceRow` (incl.
  `provisional_number, canonical_number, subtotal, discount, total,
  approver_profile_id, status`), `V1ClaimRow`, `V1ApprovalRow`,
  `V1SyncReasonCode`, `V1QueueState` — see `lib/v1/v1-contracts.ts`.
- RPC allowlist discipline: mutations via `POST /api/pos/financial-rpc`;
  reads (`dues_of`, `sync_handshake`, `allocate_fifo`) direct with session.
- Idempotency: `create_sale` ∈ `V1_IDEMPOTENT_RPCS`; the client auto-injects
  `p_idempotency_key` when the caller does not supply one.

---

## 5. Explicit non-goals (reaffirmed)

No suspended carts; no cart engine; no scanner-driver code; no payment or
khata posting in the client; no discount/approval execution beyond the
specified request/observe flow; no returns/refunds UI; no IndexedDB/Dexie
implementation; no sync worker; no conflict-resolution automation; no print
CSS; no GST computation; no weighted-average costing; no legacy
express-sale tables, legacy return-processing RPCs, or legacy
financial-table references anywhere in the future surface.
