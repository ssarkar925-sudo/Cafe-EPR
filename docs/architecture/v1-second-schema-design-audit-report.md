# V1 Second Schema Design Audit Report
Scope: design spec (corrected) vs audit report, correction log, decision register, readiness report, back-entry mini-spec, sync spec.
Status: **DOCUMENTATION ONLY — no SQL, code, tests, objects, or database contact.**

## A. Approval reflection — VERIFIED
- F1 single-table: reflected (§7 claims, §3 inventory, entity list; no standalone `payments` anywhere — swept).
- F2 uniform path: model agreed, but legs not enumerated (see G1).
- F3 retention tiers: policy consistent with minimization notes (§7 service limits); structural columns missing (see G3).
- D9/D5/GST-dormant preserved; baseline hashes of decisions unchanged; no approved decision altered.

## B. Correction completeness (F4–F14) — VERIFIED PRESENT AND CONSISTENT
F4 join entity (+ list) · F5 §14b schedule · F6 §15b bootstrap · F7/F8 lifecycle + sweeper · F9 epoch rotation · F10 locked-period rule + named linkage · F11 SoD activation + grandfathering · F12 backward link, settlement legs, derived aging, provisional scope · F13 three definitions · F14 locality/scope/validation/tuning. Cross-checks pass: uniques consistent (§5 vs §14), watermark single-homed on `devices`, status enumerations complete for all stateful entities.

## C. New findings
### G1 — HIGH — documentation correction required — service journal legs not enumerated
Fee/commission/income legs per service type are implied by F2 but never listed; baseline cannot post service money without them. Correction: add per-type leg table (service → debit/credit heads). No owner input needed (follows F2).
### G2 — HIGH — documentation correction required — day-close records missing
Approved ₹1 variance workflow has no entity/process (expected vs actual per instrument, variance journal ref, closer, lock). Correction: add day-close record design. No owner input needed.
### G3 — HIGH — documentation correction required — retention columns absent
Approved F3 tiers need `retain_until`/`purge_state` columns + purge-job design; outbox device-prune rule (sync+30d) unreferenced. Correction: add both. No owner input needed.
### G4 — MEDIUM — documentation correction required — lock-entity ambiguity
`period_locks` (recurring day-close) vs back-entry single atomic lock record overlap. Correction: name them distinct entities with distinct rules.
### G5 — MEDIUM — documentation correction required — lot-creation granularity
State lot-per-purchase-line rule explicitly. No owner input needed.
### G6 — MEDIUM — documentation correction required — outbox (device, sequence) uniqueness
Ordering + replay safety imply it; state it (or justify append-only log semantics).
### G7 — LOW — documentation correction required — per-entity FK enumeration + `current_tenant()` mechanism note deferred to baseline; record the deferral explicitly.
### G8 — INFO — implementation-time validation — concurrency serialization, sweeper scheduling, token issuance flow correctly deferred to baseline tests; no doc action.

## D. Explicit verification checklist (§6 of task)
- No stale standalone `payments`: PASS (swept, two occurrences both intentional).
- `invoice_line_lots` multi-lot correct: PASS (unique + sum rule).
- F1/F2 agreement: CONDITIONAL PASS (models agree; legs pending G1).
- F3/minimization consistency: CONDITIONAL PASS (policy consistent; columns pending G3).
- D9 preserved: PASS. GST disabled: PASS (no computation/filing entities).

## E. Standing items (unchanged, owner/mini-spec track)
D9 detailed mini-spec · BBPS field freeze · GST-seam baseline review.

## Verdict: CONDITIONALLY READY
Baseline drafting may begin for unblocked domains once G1–G3 corrections are applied; back-entry structures, service columns, and tax seams remain NOT READY pending standing items. No implementation is authorized by this verdict — separate explicit instruction still required.

## Confirmation of zero implementation changes
No SQL, migrations, code, tests, database objects, configuration, or application files created or modified. No database or external system contacted. Nothing committed or branched.
