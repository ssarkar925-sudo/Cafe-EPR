# V1 Schema Correction Log (F4–F14)
Basis: schema design audit report. Status: **DOCUMENTATION ONLY — no SQL, code, tests, objects, or database contact.**
All corrections preserve approved A2, D1–D11, D9.1–D9.4, F1–F3, and the D5 amendment. Columns: finding · original issue · correction · affected entities · remaining risk · owner approval needed · status.

## F4 — Multi-lot join entity — CORRECTED, no owner approval needed
- Issue: single lot ref cannot model multi-lot FIFO allocation.
- Correction: added `invoice_line_lots(line, lot, qty, unit_cost)`, unique `(line, lot)`, sums enforced at posting.
- Affects: invoice_lines, stock_lots. Risk: none beyond baseline review. Status: DONE.

## F5 — Per-entity index/CHECK schedule — CORRECTED, no owner approval needed
- Issue: principles only, no per-entity schedule.
- Correction: added §14b with index list + status enumerations for all stateful entities.
- Affects: outbox, lots, journals, audit, approvals, invoices, claims, devices, back-entry. Risk: none. Status: DONE.

## F6 — Enrollment/requester paths — CORRECTED, no owner approval needed
- Issue: deny-default RLS left device enrollment and requester inserts without a path.
- Correction: added §15b (short-lived enrollment tokens, 15-min; requester-scoped inserts; no anonymous/cross-tenant path).
- Affects: devices, approvals, RLS design. Risk: token-issuance flow needs detailed design at baseline. Status: DONE.

## F7 — Lot lifecycle ownership — CORRECTED, no owner approval needed
- Issue: open→exhausted→expired transitions had no owner.
- Correction: event-driven exhaustion + nightly reason-coded sweeper job (audited); quarantine stays Manager+Admin.
- Affects: stock_lots. Risk: sweeper scheduling is implementation detail. Status: DONE.

## F8 — Reservation release executor — CORRECTED, no owner approval needed
- Issue: 24h auto-release had no executor; stuck holds unhandled.
- Correction: sweeper releases expired holds; >2× TTL holds alert Managers; quarantined/expired lots reject reservations.
- Affects: stock_reservations. Risk: none. Status: DONE.

## F9 — Device re-registration invalidation — CORRECTED, no owner approval needed
- Issue: revoked/lost devices could replay old queues.
- Correction: epoch rotation on re-registration; stale-epoch items rejected.
- Affects: devices, outbox. Risk: none. Status: DONE.

## F10 — Locked-period posting rule — CORRECTED, no owner approval needed
- Issue: period_locks had no posting prohibition.
- Correction: no journals dated into locked periods except linked corrections; mirror linkage named (`reverses`/`reversed_by`).
- Affects: journal_entries/lines, period_locks. Risk: none. Status: DONE.

## F11 — SoD activation trigger — CORRECTED, review at baseline
- Issue: transition from sole-Admin self-approval to separation of duties undefined.
- Correction: activation on second active Admin; historical self-approvals grandfathered; approvals single-use and scope-bound.
- Affects: approvals, audit_logs. Risk: edge-case policy; flag for baseline review, no pre-approval needed. Status: DONE.

## F12 — Relationship explicitness — CORRECTED, no owner approval needed
- Issue: missing backward `recreated_by`, implicit settlement legs, stored-vs-derived aging ambiguity.
- Correction: backward link + traversal note; explicit from/to settlement refs; aging stated as derived view; provisional numbers stated non-unique.
- Affects: invoices, settlements, customers. Risk: none. Status: DONE.

## F13 — Undescribed entities — CORRECTED, no owner approval needed
- Issue: collection_allocations, numbering_sequences, suppliers lacked definitions.
- Correction: allocations defined (per-method splits, sum enforced, no NULL instruments); numbering per-tenant sequences; suppliers as vendor masters mirroring khata rules.
- Affects: as listed. Risk: none. Status: DONE.

## F14 — Location/scope clarifications — CORRECTED, no owner approval needed
- Issue: outbox location, numbering scope, dormant-flag validation ambiguous.
- Correction: outbox device-local only (server keeps watermark); numbering per tenant; dormant flags validated against known sets; expiry bands configurable per category (defaults 30/7).
- Affects: outbox, devices, numbering, tax masters. Risk: none. Status: DONE.

## Outstanding items disposition (no spec change required)
- D9 detail, BBPS confirmation, GST-seam review: unchanged blockers; BBPS sensitive-data limits now noted in §7.
- Thermal-printer layout, POS override UX: app-level, carried in §16; needed pre-build, not pre-schema.
- Per-category expiry tuning: configurable with approved defaults; no decision needed.

## Unresolved blockers (unchanged)
F1–F3 resolved; remaining: D9 detailed mini-spec, BBPS field freeze, GST-seam confirmation at baseline, plus this log's review and a second schema design audit before any baseline work.

## H1 — R1–R6 transcription — CORRECTED, no owner approval needed
- Issue: §14c carried R1 period as OPEN although 2 years approved.
- Correction: §14c rewritten around approved R-values, policy distinguished from mechanics.
- Affects: retention columns, outbox, audit, devices. Risk: none. Status: DONE.

## H2 — Lock taxonomy — CORRECTED, no owner approval needed
- Issue: back-entry lock vs period locks vs record guards confusable.
- Correction: new §12b defines all three with owner, scope, purpose.
- Affects: locks, periods, journals. Risk: none. Status: DONE.

## H3 — Lot granularity — CORRECTED, no owner approval needed
- Issue: lot/allocation/reservation/movement granularity unstated.
- Correction: one lot per purchase line; allocations/reservations/movements specified.
- Affects: lots, allocations, reservations. Risk: none. Status: DONE.

## H4 — Outbox uniqueness — CORRECTED, no owner approval needed
- Issue: (device, sequence) uniqueness and duplicate-submission behavior unstated.
- Correction: three uniques stated + replay/ambiguous/stale-epoch rules.
- Affects: outbox, devices. Risk: none. Status: DONE.

## H5 — FK enumeration deferral — CORRECTED (recorded deferral)
- Issue: per-entity FK lists absent without a recorded deferral.
- Correction: explicit deferral note in §14; targets final, columns at baseline.
- Affects: all entities. Risk: baseline must honor it. Status: DONE.

## G1 — Per-service journal legs — CORRECTED, owner review at baseline
- Issue: uniform money path agreed but legs per service unlisted.
- Correction: §7b documents legs for AEPS/DMT/UPI/Recharge/BBPS + common pattern; legacy-derived economics flagged for finance re-verification; BBPS stays OPEN.
- Affects: service_transactions, claims, journals. Risk: legacy formula drift; baseline finance review required. Status: DONE.

## G2 — Day-close records — CORRECTED, no owner approval needed
- Issue: approved ₹1 variance workflow had no entity.
- Correction: `day_closes`/`day_close_lines` added (§8, entity list); tolerance, escalation, lock, offline-watermark and audit rules stated.
- Affects: instruments, journals, locks. Risk: none beyond baseline review. Status: DONE.

## G3 — Retention columns — CORRECTED, no owner approval needed
- Issue: approved tiers had no structural columns.
- Correction: §14c (`retain_until`, `purge_state`, hold flags, Admin-gated per-tenant purge, backup-rotation disclosure); key-retention period left OPEN (proposal 2 years).
- Affects: all operational entities, outbox, audit, devices. Risk: key period + archive-vs-delete edge cases need baseline confirmation. Status: DONE.
