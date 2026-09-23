# V1 Schema Readiness Report
ERP: CyberCafe & Digital Services ERP · Date: 2026-09-21
Status: **SCHEMA DESIGN IS NOT YET IMPLEMENTED.** No code, migrations, schemas, database objects, tests, or configuration created or modified. No database or external environment contacted.

## 1. Approved decisions D1–D11 (owner, 2026-09-21)
- **D1** Offline cash: record-only claims; recognized only after server validation; unvalidated cash in operator-liability window.
- **D2** Fulfilment: all-or-nothing per document; no partial fulfilment or backorders in V1.
- **D3** Reservation TTL: 24h provisional holds; auto-release; `reserved_qty` exposed.
- **D4** Retry: 30s ×2 backoff, 15-min cap, 48h max age; semantic rejections never auto-retry.
- **D5** Approvals: sole-Admin self-approval permitted with complete audit logs (identity, timestamp, reason, transaction, original/approved values); separation of duties mandatory once additional users exist.
- **D6** Near-expiry: 30-day watch + 7-day action bands.
- **D7** Provisional numbering: watermarked "UNSYNCED — NOT FINAL"; canonical numbers post-validation.
- **D8** Server-authoritative timestamps; device time informational metadata.
- **D9** Dedicated back-entry mini-spec before schema finalization (not an approval of unspecified rules).
- **D10** Record-only field lists for AEPS/DMT/UPI/Recharge/BBPS as proposed; BBPS uncertainty preserved; no live API in V1.
- **D11** HSN/SAC masters, effective-dated rates, supply-type references, B2B/B2C flags only; no V1 tax computation or returns.

## 2. A2 locked context (unchanged)
Admin/Manager/Staff/Restricted Cashier; admin-only approvals (any discount, all returns/refunds, variance >₹1); FIFO + batches + expiry; GST dormant; offline at launch; record-only services; single tenant + `tenant_id`; fresh data; opening 01-01-2026; cancel-and-recreate; ₹0.01 half-up; RPO 24h/RTO 4h.

## 3. Schema requirements derived from each approved decision
- **D1:** payment claim-state columns (`recorded` vs `recognized`, timestamps, recognizing actor); unrecognized claims excluded from balances by constraint/view.
- **D2:** document-level atomicity; line items carry no partial states; no backorder structures.
- **D3:** reservation columns (`reserved_qty`, hold expiry, holding device ref); auto-release is application/scheduled logic over these columns.
- **D4:** outbox columns (attempts, next-retry-at); age cap enforced by worker policy, not schema.
- **D5:** approval records (approver identity, timestamp, scope hash, expiry, self-approval flag) + override audit fields (reason, transaction, original/approved values).
- **D6:** `expiry_date` on lots (bands are configuration).
- **D7:** provisional-number (nullable, device-visible) vs canonical-number (server-assigned, unique) columns.
- **D8:** business timestamps defaulting to server time + device-timestamp metadata columns.
- **D9:** deferred — no back-entry structures until the mini-spec exists.
- **D10:** per-service columns exactly per confirmed field lists; nothing speculative.
- **D11:** HSN/rate masters with effective dating + flags; no computation columns.
- **Cross-cutting (from A2 + spec):** `tenant_id` everywhere; UUID PKs; `numeric(18,2)` money; deny-default RLS; `SECURITY DEFINER` RPCs with fixed `search_path`, `REVOKE PUBLIC`, explicit grants; idempotency uniques; balanced immutable journals with mirror reversals; lifecycle state machine; append-only audit.

## 4. Remaining documentation gaps
1. D9 back-entry mini-spec does not exist (blocks related schema).
2. BBPS bill-reference fields are the least-evidenced inputs (owner-correctable at schema review).
3. Thermal-printer receipt layout (required hardware; app-level, needed before POS build, not schema).
4. Admin-override-at-POS UX flow (discount/approval capture at counter).
5. Per-category near-expiry tuning (defaults shippable).
6. Opening back-entry method for the pre-2026-01-01 period (part of D9 scope).

## 5. Required D9 back-entry mini-spec scope
Objectives: lawful reconstruction of pre-opening history without corrupting FIFO lots or opening balances. Must define: eligible source records; lot-aware backfill rules (which lots absorb history); date-handling (business vs entry timestamps); opening-balance linkage; per-record audit (actor, reason, source); acceptance criteria (balanced opening journals, lot integrity, immutability after lock). Explicitly out of scope until written: any unspecified back-entry rule.

## 6. Review checklist before schema design
- [ ] A2 locked context re-confirmed (this report §2).
- [ ] D1–D11 approvals recorded with date (approval form, OWNER APPROVAL RECORD 2026-09-21).
- [ ] D9 mini-spec complete and approved.
- [ ] D10 field lists frozen per service (BBPS gaps closed or explicitly deferred).
- [ ] Conventions agreed: UUID PKs, `numeric(18,2)`, UTC/IST rule, naming standards.
- [ ] RLS + function-ACL model reviewed against §3 cross-cutting rules.
- [ ] Test-plan classes (§8 of sync spec) accepted as CI gates.
- [ ] Explicit authorization to draft the V1 baseline (design review, still no implementation).

## 7. Explicit statement
**Schema design is NOT YET IMPLEMENTED.** This report authorizes nothing beyond review. The next step requires a separate explicit instruction to draft the V1 baseline, followed by its own review before any code, migration, or database work.

## 8. F1–F3 resolution (owner, 2026-09-21)
F1 single-table payment model, F2 uniform posting path, F3 tiered retention with minimization are APPROVED and recorded in the final decision register (§7) and blocker decision form. F4–F14 corrections, G1–G3 corrections, and the second schema design audit are complete (see correction logs). Still outstanding before any baseline work: D9 detailed mini-spec, BBPS field freeze, GST-seam review, and a separate explicit authorization. Implementation is NOT started and the project is NOT marked implementation-ready.

## 9. G1–G3 corrections applied (second-audit follow-through)
Per-service journal legs (§7b of design spec), day-close records (§8, entity list), and retention columns (§14c) are now documented; correction log extended; BBPS and key-period items remain explicitly OPEN. See §8 for remaining blockers.

## 10. H1–H5 corrections applied (final-audit follow-through)
R1–R6 transcribed into §14c; lock taxonomy (§12b); lot granularity (§6); outbox uniqueness (§5); FK deferral recorded (§14). Correction log extended (§H1–H5, all DONE, no owner input required). Remaining before baseline work: D9 detailed mini-spec, BBPS field freeze, GST-seam review, and separate explicit authorization. Implementation is NOT started and the project is NOT marked implementation-ready.
