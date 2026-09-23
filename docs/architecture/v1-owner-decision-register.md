# V1 Owner-Decision Register — Phase 5

Status: **REGISTER ONLY. No decision is resolved here; the owner resolves
each item in writing. Undecided items block only the scope named in
"Blocks"; nothing else may wait on them.**

Scope rule: this register contains **only** decisions still marked as
owner decisions in the approved plan (`v1-schema-implementation-plan.md`
§G15, deferred/external-confirmation items) that Phase 5 exposes. Decided
matters (D1–D11, D9.1–D9.4, F1–F3) are recorded, not re-opened. In
particular the D9 detailed mini-spec, BBPS field-list finalization beyond
confirmation depth, and the GST-seam review are separate tracks and are
**not** listed here.

---

- **Returns/refunds discount allocation (2026-09-23):** Owner approved proportional line-level allocation of the invoice header discount for partial returns. The implementation must use the approved ₹0.01 half-up rounding rule and reconcile any final cent residual on the final return line when the invoice is fully returned.

## Pending decisions

| ID | Decision | Context | Options for the owner | Blocks |
|---|---|---|---|---|
| OD-P5-01 | **Thermal receipt layout approval** | `v1-thermal-receipt-spec.md` fixes the field contract and order; the visual sign-off (spacing, weight, footer wording) is required before the POS build treats the layout as final. | (a) Approve spec layout as final · (b) Approve with named spacing/weight tweaks · (c) Require a revised proof | Final receipt CSS/print work (later phase); nothing in Phase 5 |
| OD-P5-02 | **Admin override-at-POS UX** | Any discount requires Admin approval; the capture UX at a busy counter is an owner call (presence vs remote). | (a) Admin present at counter (PIN/tap) · (b) Remote approval via Admin hub queue · (c) Hybrid with per-shift delegation rules | Discount-approval screen implementation (later phase); the `request_approval` / `approve_override` contract is unaffected |
| OD-P5-03 | **BBPS confirmation depth** | V1 is record-only (D10/F2) with the thinnest money-leg evidence; the owner sets how much evidence each BBPS record must carry. | (a) Reference no. only · (b) Ref + amount + date · (c) Ref + amount + date + attachment | BBPS record form fields (later phase); record-only doctrine is unaffected |
| OD-P5-04 | **Per-category near-expiry tuning** | The 30-day watch / 7-day action defaults (D6) ship as-is unless the owner tunes per category. | (a) Keep uniform defaults · (b) Named per-category bands (e.g. dairy shorter, dry goods default) | Expiry-band tuning only; intake, FIFO, and hard-block rules are unaffected |
| OD-P5-05 | **Reporting P&L scope** | Which profit views are required at V1 launch vs deferred to V2. | (a) Daily summary only · (b) Monthly P&L · (c) Category-wise margin | Reports scope (later phase); day-close and journal truth are unaffected |

---

## Decision history

- *None recorded in Phase 5. Each resolution must be appended here with
  date, decider, chosen option, and affected spec section — never edited
  into the specs silently.*
