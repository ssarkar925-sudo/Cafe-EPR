# V1 Owner Decision Questionnaire
ERP: CyberCafe & Digital Services ERP · Companion to `v1-transaction-sync-spec.md` (§10–§11)
Status: **ALL ITEMS PENDING — nothing below is approved.** Design proposals only; no code, migrations, or DB changes.

A2 locked context (preserved, not re-decided): roles Admin/Manager/Staff/Restricted Cashier; admin-only approvals (any discount, all returns/refunds, variance >₹1); FIFO with batches + expiry; GST dormant; offline required at launch; AEPS/DMT/UPI/Recharge/BBPS record-only v1; single tenant with `tenant_id`; fresh data; opening 01-01-2026; cancel-and-recreate; ₹0.01 half-up; RPO 24h/RTO 4h.

## D1 — Offline cash acceptance policy [SCHEMA BLOCKER — partial]
- **Question:** May cash be accepted offline, and when is offline cash recognized in the books?
- **★ PROPOSAL:** Yes, as record-only claims; recognized only after server validation; unvalidated cash is an explicit operator-liability window with next-day reconciliation.
- **Alternatives:** (a) Forbid offline cash entirely (safest, loses sales during outages). (b) Recognize immediately on sync without review (simplest, highest fraud surface).
- **Operational impact:** Defines cashier procedure during outages, day-close exception handling, and liability assignment.
- **Schema impact:** Requires payment claim-state columns (`recorded` vs `recognized`) if allowed; none if forbidden.
- **RECOMMENDATION (not approved):** the ★ PROPOSAL — preserves sales with a bounded, auditable risk window.
- **Approval:** PENDING.

## D2 — Fulfilment mode [SCHEMA BLOCKER]
- **Question:** All-or-nothing documents, or partial fulfilment with backorders?
- **★ PROPOSAL:** All-or-nothing per document in v1.
- **Alternatives:** Partial fulfilment (needs backorder rows, split lots, partial journals — large schema).
- **Operational impact:** Strict mode rejects whole documents on any short line; partial mode saves sales but complicates ledger and UX.
- **Schema impact:** Partial mode adds line-level status + backorder structures; strict mode needs none.
- **RECOMMENDATION (not approved):** all-or-nothing — ledger simplicity for v1.
- **Approval:** PENDING.

## D3 — Reservation TTL
- **Question:** How long do offline stock reservations hold?
- **★ PROPOSAL:** 24h provisional holds, auto-released, visible as `reserved_qty`.
- **Alternatives:** Shorter (4h — frees stock fast, loses queued sales) / longer (72h — protects sales, starves others).
- **Operational impact:** Balances sale protection against stock availability across devices.
- **Schema impact:** None beyond the reservation columns (TTL itself is configuration).
- **RECOMMENDATION (not approved):** 24h.
- **Approval:** PENDING.

## D4 — Sync retry limits
- **Question:** Retry schedule and abandonment age for queued items?
- **★ PROPOSAL:** Exponential backoff base 30s ×2, 15-min cap, 48h max age; semantic rejections never auto-retry.
- **Alternatives:** Aggressive (fast, bandwidth-heavy) / conservative (slow dead-lettering).
- **Operational impact:** Time-to-sync vs battery/bandwidth; age cap defines when items need manual handling.
- **Schema impact:** None (outbox columns already cover attempts/next-retry).
- **RECOMMENDATION (not approved):** the ★ PROPOSAL.
- **Approval:** PENDING.

## D5 — Approval expiry
- **Question:** How long is an admin approval valid, and must approver differ from requester?
- **★ PROPOSAL:** 15-min expiry; approver must differ from requester (separation of duties); approval binds identity + timestamp + scope hash.
- **Alternatives:** No expiry (stale approvals executable late) / self-approval allowed (weaker control).
- **Operational impact:** Counter procedure for discounts/returns (admin presence or timely override).
- **Schema impact:** Approval record columns (approver, timestamp, scope, expiry).
- **RECOMMENDATION (not approved):** the ★ PROPOSAL.
- **Approval:** PENDING.

## D6 — Near-expiry warning period
- **Question:** When should lots warn before expiry?
- **★ PROPOSAL:** 30-day watch band + 7-day action band.
- **Alternatives:** Single threshold / per-category bands (more config work).
- **Operational impact:** Staff workload vs wastage prevention.
- **Schema impact:** None (bands are configuration, not structure).
- **RECOMMENDATION (not approved):** 30/7-day bands.
- **Approval:** PENDING.

## D7 — Provisional invoice-numbering UX
- **Question:** What does the customer see before server validation assigns the canonical number?
- **★ PROPOSAL:** Provisional numbers watermarked "UNSYNCED — not final"; canonical numbers only post-validation.
- **Alternatives:** Hide numbers until synced (confusing at handover) / show provisional as final (dispute risk on change).
- **Operational impact:** Receipt design, customer-dispute handling, thermal-printer layout.
- **Schema impact:** None (display-level; canonical number column already planned).
- **RECOMMENDATION (not approved):** watermarked provisional numbers.
- **Approval:** PENDING.

## D8 — Server-authoritative time
- **Question:** Whose clock governs business timestamps?
- **★ PROPOSAL:** Server time authoritative; device timestamps informational only.
- **Alternatives:** Device time trusted (breaks ordering/expiry under skew).
- **Operational impact:** Ordering, expiry, and day-close boundaries stay consistent.
- **Schema impact:** None (a validation rule, not structure).
- **RECOMMENDATION (not approved):** server-authoritative.
- **Approval:** PENDING.

## D9 — Historical back-entry mini-spec [SCHEMA BLOCKER]
- **Question:** How are pre-2026-01-01 transactions back-entered against FIFO lots and opening balances?
- **★ PROPOSAL:** No back-entry schema until a dedicated mini-spec exists; proposal direction is lot-aware backfill tied to the opening-balance window.
- **Alternatives:** Free-form back-entry (corrupts FIFO/ledger) / no back-entry (opening balances only).
- **Operational impact:** Determines what history exists on day one and how opening position is constructed.
- **Schema impact:** Backfill structures, date handling, opening/lot linkage — all downstream of this spec.
- **RECOMMENDATION (not approved):** write the mini-spec first; block related schema until then.
- **Approval:** PENDING.

## D10 — Record-only field lists per service [SCHEMA BLOCKER]
- **Question:** Exact recorded fields for AEPS, DMT, UPI, Recharge, BBPS?
- **★ PROPOSAL:** The field lists in §12 below (grounded in observed legacy columns; trimmed to record-only needs).
- **Alternatives:** Superset capture (stores speculative columns) / minimal refs (risks missing data at intake).
- **Operational impact:** What counter staff must capture per transaction; sync rejection surface.
- **Schema impact:** Directly defines `service_transactions` columns per type — nothing speculative ships.
- **RECOMMENDATION (not approved):** §12 lists, pending owner confirmation per service.
- **Approval:** PENDING (per service).

## D11 — GST dormant seam list [SCHEMA BLOCKER]
- **Question:** Which tax tables/columns ship in V1 vs later?
- **★ PROPOSAL:** V1 ships HSN/rate masters with effective dating + supply-type/B2B flags only (§12); computation and filing stay out.
- **Alternatives:** Full tax engine now (scope explosion) / no tax structures at all (guaranteed retrofit).
- **Operational impact:** None at launch (dormant); decides retrofit cost later.
- **Schema impact:** Fixes the V1 tax table/column set (§12).
- **RECOMMENDATION (not approved):** masters + flags only.
- **Approval:** PENDING.

## 12. Concrete field-level proposals (all ★ PROPOSAL, all PENDING)
Types: `uuid` references, `text` identifiers, `numeric(18,2)` money, `timestamptz` times, `date` dates. Common to all services: `tenant_id, client_uuid, idempotency_key, service_type, transaction_number (server-assigned), transaction_date, status, customer_id?, created_by_device, synced_at`.

- **AEPS:** `aadhaar_last4 (text), bank_ref (text), portal_ref (text), txn_type (text: cash-out/balance/mini-statement), amount, fee, commission, cash_out, float_credit, customer_mobile?` — grounded in legacy AEPS float-credit columns.
- **DMT:** `sender_name, sender_mobile, beneficiary_name, beneficiary_mobile, beneficiary_bank, beneficiary_ifsc, beneficiary_account, transfer_method (bank_account|upi), amount, fee, pay_from_ref` — grounded in legacy DMT sender/beneficiary columns.
- **UPI:** `upi_id (payer), merchant_qr_ref, amount, fee, collection_method, customer_mobile?` — grounded in legacy UPI/QR columns.
- **Recharge:** `provider_ref, receiver_number (mobile/DTH/consumer no.), plan_ref?, amount, commission` — grounded in legacy provider/receiver columns.
- **BBPS:** `biller_ref, consumer_number, bill_amount, fee, bill_date?, bill_ref_number?` — bill-reference fields are the least evidenced in legacy and most need owner confirmation.
- **Payment claims:** `method, amount, instrument_ref?, claim_state (recorded|recognized), recorded_at, recognized_at?, recognized_by?` — claim states exist only if D1 allows offline cash.
- **Back-entry records:** structure deferred to the D9 mini-spec; proposal direction is `source_period, lot_link?, opening_link?, entered_by, back_entry_reason` — not final.
- **GST dormant references:** `hsn_code, gst_rate, rate_effective_from, rate_effective_to, supply_type, b2b_or_b2c, place_of_supply, reverse_charge_flag` — masters + flags only, no computation columns.

## 13. Owner approval checklist (reply Yes/No per line; silence is not approval)
- [ ] D1 offline cash: record-only claims + operator-liability window?
- [ ] D2 fulfilment: all-or-nothing v1?
- [ ] D3 reservation TTL: 24h?
- [ ] D4 retry: 30s×2 / 15-min cap / 48h max; semantic never retry?
- [ ] D5 approvals: 15-min expiry + approver≠requester?
- [ ] D6 near-expiry: 30-day watch + 7-day action?
- [ ] D7 provisional numbers watermarked UNSYNCED?
- [ ] D8 server time authoritative?
- [ ] D9 back-entry: mini-spec first, schema blocked till then?
- [ ] D10 field lists: AEPS / DMT / UPI / Recharge / BBPS §12 confirmed (or amended per service)?
- [ ] D11 GST seams: masters + flags only?
