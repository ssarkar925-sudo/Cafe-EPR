# V1 H1–H5 Verification Log
Date: 2026-09-21 · Status: **DOCUMENTATION ONLY — no SQL, code, tests, objects, or database contact.**

## H1 — R1–R6 transcription
- Issue: approved retention values missing from design spec.
- Correction: §14c rewritten around R1 (2y keys), R2 (archive-audit/purge-operational), R3 (holds), R4 (rotation + reconciliation), R5 (per-tenant), R6 (audited purges).
- Affected: retention columns, outbox, audit, devices. Consistency check: matches register §7 + retention form approvals verbatim. Status: DONE.

## H2 — Lock taxonomy
- Issue: three lock concepts confusable.
- Correction: §12b defines back-entry lock, period locks, record guards with owner/scope/purpose.
- Affected: locks, periods, journals. Consistency check: aligns with locked-period rule (§8) and single-lock approval (D9.2). Status: DONE.

## H3 — Lot granularity
- Issue: granularity unstated across lots/allocations/reservations/movements.
- Correction: one lot per purchase line; per-(line,lot) allocations; per-(lot,document) reservations; per-(lot,reason,qty) movements.
- Affected: lots, allocations, reservations. Consistency check: preserves FIFO + expiry blocking + posting coherence. Status: DONE.

## H4 — Outbox uniqueness
- Issue: (device, sequence) uniqueness + duplicate behavior unstated.
- Correction: three uniques + replay/ambiguous/stale-epoch rules in §5.
- Affected: outbox, devices. Consistency check: agrees with UUIDv7, watermarks, validation, epochs. Status: DONE.

## H5 — FK deferral recorded
- Issue: absent per-entity FK lists with no recorded deferral.
- Correction: explicit deferral note in §14; targets final, columns at baseline.
- Affected: all entities. Consistency check: honest scope statement; baseline must honor. Status: DONE.

No approved decision altered. No implementation authorized or performed.
