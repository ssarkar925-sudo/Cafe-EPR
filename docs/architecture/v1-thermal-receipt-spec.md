# V1 Thermal Receipt Specification

Status: **DESIGN ONLY — content model, field contract, and print-layout
specification. No print CSS, no production receipt printing, no native
drivers in this phase.**

Basis: G3 invoice model (`V1InvoiceRow`: `provisional_number,
canonical_number, invoice_date, subtotal, discount, total,
approver_profile_id, status`), G4 claims (`V1ClaimRow`, `V1ClaimMethod`,
`V1ClaimState`), G7 approvals, G9 provisional-numbering (D7), G15
(schema impact: none — all receipt-required fields already modeled).
Receipt layout approval itself is an owner decision
(`v1-owner-decision-register.md` OD-P5-01); this spec defines the field
contract the layout must satisfy, not the final visual sign-off.

---

## 1. Field contract (normative)

Every field below names its source. A receipt missing a mandatory field, or
showing a forbidden field, fails the print-content completeness test (G15
verification, deferred to POS build).

### 1.1 Business identity (mandatory)

| Field | Source | Notes |
|---|---|---|
| Business name | Tenant profile (G14 seed) | Centered header, bold |
| Business address / contact | Tenant profile (G14 seed) | Below name, wrapped |
| Receipt title | Fixed string `SALE RECEIPT` | **Not** "TAX INVOICE" — GST is dormant in V1 (D11); no tax-invoice language may appear |

### 1.2 Transaction identity (mandatory)

| Field | Source | Notes |
|---|---|---|
| Invoice number | `canonical_number` if server-confirmed; `provisional_number` if offline-created/queued | Exactly one is shown, labeled `Bill No` |
| Provisional watermark | G9/D7 rule | `UNSYNCED — NOT FINAL`, large, centered, on **every** offline-created/queued receipt (screen and print) |
| Invoice date | `invoice_date` (server-authoritative per D8) | `DD-MMM-YYYY`; device time is informational only and never printed as the invoice date |
| Server timestamp | `created_at` from the confirmed row | Printed after sync; omitted (not estimated) on provisional receipts |

### 1.3 Customer block (conditional — present only if a customer was selected)

| Field | Source | Notes |
|---|---|---|
| Customer name | Customer master (`mg_customer_upsert`) | Omitted for walk-in sales |
| Customer phone | Customer master | Minimization (F3): printed only while dues are active or statute requires; otherwise omitted |
| Khata due | `dues_of` (read RPC) at confirm time | Labeled `Khata balance`; a cached hint is never printed as a balance on provisional receipts |

### 1.4 Line items (mandatory, one row per `V1SaleLine`)

| Column | Format | Alignment |
|---|---|---|
| Item name | Catalog name (truncated with ellipsis beyond column width) | Left |
| Quantity | `qty` as entered | Left (`2 x`) |
| Unit price | `rate` (sale price, 2 decimals, ₹) | Right |
| Line total | `qty × rate` as returned by the server; estimate-marked while provisional | Right |

### 1.5 Totals (mandatory)

| Field | Source | Notes |
|---|---|---|
| Subtotal | Server `subtotal` | Before discount |
| Discount | Server `discount` | `0.00` when none; no discount row is hidden — always printed |
| Approver reference | `approver_profile_id` | Mandatory when discount > 0: `Approved by: <display name>` (resolved from profile); absent otherwise |
| Total | Server `total` | Large, bold, the single payable figure |

### 1.6 Payment block (mandatory)

| Field | Source | Notes |
|---|---|---|
| Payment method(s) | `V1ClaimMethod`: Cash, UPI, Card, Wallet, Credit | Single line for full payment; one row per split for split payment (`method + amount` each) |
| Claim / instrument reference | `V1ClaimRow.instrument_id` → instrument master | E.g. `UPI QR: <label>`; never prints card numbers, PINs, MPINs, or full account numbers (F1) |
| Khata / credit balance | `dues_of` after posting | Printed for credit sales (`Credit` split present); otherwise omitted |
| Change due | Server-computed | Printed for cash over-tender; never estimated on provisional receipts |

### 1.7 Audit / lifecycle stamps (conditional)

| Stamp | Condition | Wording |
|---|---|---|
| Edited source | Receipt reprinted after `edit_invoice` (cancel-and-recreate doctrine) | `Edited from: <original canonical no.>` |
| Recreated by | Reissue actor recorded | `Recreated by: <display name>` |
| Cancelled | `cancel_invoice` succeeded | `CANCELLED` watermark, reason-coded |
| Reversed | Mirror reversal posted | `REVERSED` watermark with link to the reversing document |
| Return stamp | A composed return workflow references this receipt (later phase) | `RETURN REF: <document no.>` — placement reserved; workflow itself is out of V1 scope |

---

## 2. Explicit exclusions (dormant / forbidden)

- **NO GST calculation.** No tax computation exists in the receipt layer.
- **NO GST lines.** No CGST/SGST/IGST/UTGST rows unless a future owner
  decision activates tax and future schema/application work ships it (D11).
- **NO WAC display.** FIFO costing (`unit_cost` per lot) is internal; the
  receipt shows sale prices and totals only.
- **NO "TAX INVOICE" title.** See §1.1.
- **NO secrets.** F1/F3 minimization applies to print as to storage.

---

## 3. Printer target (existing infrastructure only)

- **Browser print** is the target: `window.print()` via the existing
  `PrintButton` / `AutoPrint` pattern (`components/receipt/`).
- **USB/network thermal printers** are reached through that browser path;
  where the existing Electron shell exposes `electronAPI.printThermal`, it
  remains the fallback (`printThermal().catch(() => window.print())`).
- **No native drivers, no new print pipeline, no print CSS are added by this
  phase.** The layout spec below constrains the future implementation.

---

## 4. Print layout specification (80mm thermal)

1. **Width:** 80mm fixed; single column; monospace-safe font (column
   alignment must survive thermal firmware font substitution).
2. **Contrast:** black on white only; no grays, no color-dependent meaning
   (watermarks use size/weight/border, not shade).
3. **Page-break avoidance:** the receipt is one unbreakable block
   (`page-break-inside: avoid` at implementation time); if content overflows
   one paper length, breaks fall only on line-item boundaries, never inside
   totals, payment, or stamp blocks.
4. **Responsive preview:** the on-screen preview reflows to the operator
   display but preserves the 80mm line width, field order (§1), and
   watermark prominence, so what is approved on screen is what prints.
5. **Field order is fixed:** identity → transaction → customer → lines →
   totals → payment → stamps → footer. Layout approval (OD-P5-01) may tune
   spacing/weight but may not reorder, drop, or add fields outside §1.
6. **Footer (mandatory):** `Thank you` line + `Bills subject to <retention
   policy as seeded in G14>` placeholder text pending owner wording.

---

## 5. Verification (deferred to POS build)

G15 print-content completeness test: for a posted sale, a khata sale, a
discount-approved sale, a split-payment sale, a provisional receipt, and a
cancelled/reversed receipt, assert every §1 field present from its named
source, every §2 exclusion absent, watermark present exactly when unacked,
and figures byte-equal to the server row. Not executed in this phase.
