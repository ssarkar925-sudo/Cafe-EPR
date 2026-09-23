# V1 Owner Approval Form
ERP: CyberCafe & Digital Services ERP · Companion to `v1-owner-decision-questionnaire.md`
Status: **APPROVED BY OWNER — 2026-09-21.** D1–D11 recorded below (D5 as APPROVED — OWNER AMENDMENT, unchanged). Only a further explicit owner statement can revise these.

A2 locked context (not re-decided): Admin/Manager/Staff/Restricted Cashier; admin-only approvals (any discount, all returns/refunds, variance >₹1); FIFO + batches + expiry; GST dormant; offline at launch; AEPS/DMT/UPI/Recharge/BBPS record-only v1; single tenant + `tenant_id`; fresh data; opening 01-01-2026; cancel-and-recreate; ₹0.01 half-up; RPO 24h/RTO 4h.

## A. Schema-blocking decisions (V1 schema cannot be finalized until these are answered)

### D1 — Offline cash acceptance policy
- Question: May cash be accepted offline, and when is it recognized in the books?
- Recommendation: record-only claims; recognized after server validation; unvalidated cash is an operator-liability window.
- Alternatives: (a) forbid offline cash · (b) recognize on sync without review.
- Owner selection: [x] Recommendation — APPROVED OWNER DECISION 2026-09-21
- Notes: Record-only offline cash claims; recognized in the books only after server validation; unvalidated cash remains in an operator-liability window.

### D2 — Fulfilment mode
- Question: All-or-nothing documents, or partial fulfilment with backorders?
- Recommendation: all-or-nothing per document in v1.
- Alternatives: partial fulfilment with backorder structures.
- Owner selection: [x] Recommendation — APPROVED OWNER DECISION 2026-09-21
- Notes: All-or-nothing fulfilment per document for V1; no partial fulfilment or backorders in V1.

### D9 — Historical back-entry mini-spec
- Question: How are pre-2026-01-01 transactions back-entered against FIFO lots and opening balances?
- Recommendation: dedicated mini-spec first; no back-entry schema until it exists.
- Alternatives: free-form back-entry / opening-balances-only with no history.
- Owner selection: [x] Recommendation — APPROVED OWNER DECISION 2026-09-21
- Notes: Dedicated back-entry mini-spec required before schema finalization. This is NOT an approval of unspecified future back-entry rules.

### D10 — Record-only field lists (per service)
- Question: Exact recorded fields for each payment service?
- Recommendation: questionnaire §12 lists (AEPS / DMT / UPI / Recharge / BBPS).
- Alternatives: per-service amendment in notes.
- Owner selection per service (APPROVED OWNER DECISION 2026-09-21 — record-only lists as proposed):
  - AEPS: [x] As proposed
  - DMT: [x] As proposed
  - UPI: [x] As proposed
  - Recharge: [x] As proposed
  - BBPS: [x] As proposed
- Notes: BBPS uncertainty and field-level notes preserved. No live API integration in V1.

### D11 — GST dormant seam list
- Question: Which tax tables/columns ship in V1 vs later?
- Recommendation: HSN/rate masters with effective dating + supply-type/B2B flags only; no computation.
- Alternatives: full tax engine now / no tax structures at all.
- Owner selection: [x] Recommendation — APPROVED OWNER DECISION 2026-09-21
- Notes: HSN/SAC masters, effective-dated rates, supply-type references, and B2B/B2C flags only. No V1 tax computation or GST return functionality.

## B. Non-blocking proposed defaults (shippable as-is; confirm or amend)

### D3 — Reservation TTL
- Question: How long do offline stock reservations hold?
- Recommendation: 24h provisional holds, auto-released, visible as `reserved_qty`.
- Alternatives: 4h / 72h.
- Owner selection: [x] Recommendation — APPROVED OWNER DECISION 2026-09-21
- Notes: 24-hour provisional stock reservations; auto-release; reserved quantity exposed.

### D4 — Sync retry limits
- Question: Retry schedule and abandonment age?
- Recommendation: backoff base 30s ×2, 15-min cap, 48h max age; semantic rejections never auto-retry.
- Alternatives: amend values in notes.
- Owner selection: [x] Recommendation — APPROVED OWNER DECISION 2026-09-21
- Notes: 30-second initial backoff ×2, 15-minute cap, 48-hour maximum age; semantic rejections never auto-retry.

### D5 — Approval expiry
- Question: Validity window for admin approvals; must approver differ from requester?
- Recommendation: 15-min expiry; approver ≠ requester; identity + timestamp + scope hash bound.
- Alternatives: no expiry / self-approval allowed.
- Owner selection: [x] Amended — APPROVED WITH OWNER AMENDMENT (see notes)
- Notes: Owner/Admin self-approval is permitted while the owner is the sole active Admin (own discounts, returns, refunds). Every override requires an audit log with identity, timestamp, reason, affected transaction, and original/approved values. When additional users are introduced, separation-of-duties approval becomes mandatory. Permission architecture must support future multi-user approval workflows.

### D6 — Near-expiry warning period
- Question: When do lots warn before expiry?
- Recommendation: 30-day watch band + 7-day action band.
- Alternatives: single threshold / per-category bands.
- Owner selection: [x] Recommendation — APPROVED OWNER DECISION 2026-09-21
- Notes: 30-day watch band and 7-day action band.

### D7 — Provisional invoice-numbering UX
- Question: What does the customer see before server validation?
- Recommendation: provisional numbers watermarked "UNSYNCED — not final".
- Alternatives: hide until synced / show provisional as final.
- Owner selection: [x] Recommendation — APPROVED OWNER DECISION 2026-09-21
- Notes: Watermarked provisional invoice numbers "UNSYNCED — NOT FINAL".

### D8 — Server-authoritative time
- Question: Whose clock governs business timestamps?
- Recommendation: server authoritative; device time informational only.
- Alternatives: trust device time.
- Owner selection: [x] Recommendation — APPROVED OWNER DECISION 2026-09-21
- Notes: Server-authoritative business timestamps; device time remains informational metadata.

## C. Plain-text response template (copy, fill, return)
```
V1 OWNER APPROVAL RESPONSE — date: __________
D1 offline cash: [Recommendation / (a) forbid / (b) immediate-recognize / Amended: ___]
D2 fulfilment: [All-or-nothing / Partial / Amended: ___]
D3 reservation TTL: [24h / Amended: ___]
D4 retry: [As proposed / Amended: ___]
D5 approval expiry: [As proposed / Amended: ___]
D6 near-expiry: [30+7-day / Amended: ___]
D7 provisional UX: [Watermarked / Amended: ___]
D8 server time: [Authoritative / Amended: ___]
D9 back-entry: [Mini-spec first / Amended: ___]
D10 fields — AEPS: [As proposed / Amended: ___]
D10 fields — DMT: [As proposed / Amended: ___]
D10 fields — UPI: [As proposed / Amended: ___]
D10 fields — Recharge: [As proposed / Amended: ___]
D10 fields — BBPS: [As proposed / Amended: ___]
D11 GST seams: [Masters+flags only / Amended: ___]
Approver name: __________  Signature/date: __________
```

## OWNER APPROVAL RECORD — APPROVED 2026-09-21
All D1–D11 approved as stated below (D5 as APPROVED — OWNER AMENDMENT, unchanged).
A2 locked decisions preserved. D9 requires a detailed back-entry mini-spec before implementation; BBPS field uncertainty is preserved as a documentation-level ambiguity.

- D1: APPROVED — record-only offline cash claims; recognized only after server validation; unvalidated cash in operator-liability window.
- D2: APPROVED — all-or-nothing fulfilment per document for V1; no partial fulfilment or backorders.
- D3: APPROVED — 24-hour provisional reservations; auto-release; reserved quantity exposed.
- D4: APPROVED — 30s ×2 backoff, 15-min cap, 48h max age; semantic rejections never auto-retry.
- D5: APPROVED — OWNER AMENDMENT (unchanged): sole-Admin self-approval permitted with complete audit logs; separation of duties mandatory once additional users exist.
- D6: APPROVED — 30-day watch band and 7-day action band.
- D7: APPROVED — watermarked provisional numbers "UNSYNCED — NOT FINAL".
- D8: APPROVED — server-authoritative timestamps; device time informational metadata.
- D9: APPROVED — dedicated back-entry mini-spec before schema finalization. NOT an approval of unspecified future back-entry rules.
- D10: APPROVED — record-only field lists for AEPS, DMT, UPI, Recharge, BBPS as proposed; BBPS uncertainty preserved; no live API in V1.
- D11: APPROVED — HSN/SAC masters, effective-dated rates, supply-type references, B2B/B2C flags only; no V1 tax computation or GST returns.

Original questionnaire items (§A–§B above) and the response template are preserved unchanged.
