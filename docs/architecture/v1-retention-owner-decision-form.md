# V1 Retention Owner Decision Form
ERP: CyberCafe & Digital Services ERP · Source: G3 correction (tiered retention approved in F3; periods below were proposals, not approvals).
Status: **APPROVED BY OWNER — 2026-09-21 (all recommendations).** Design only; no SQL, code, or DB work.
Preserved: tiered retention, journals never purged, outbox prune after sync+30d, PII minimization rules, Admin-gated purge. No statutory period is stated anywhere — owner/legal input required.

## R1 — Key-retention period
- Current proposal exactly: idempotency keys retained beyond payloads; exact period OPEN (design spec §14c carries proposal: 2 years).
- Schema/operational impact: fixes key-table growth and replay horizon; longer windows consume storage, shorter windows break late replays.
- Alternatives: (a) 2 years (proposal) · (b) match audit retention (7 years, maximum safety, maximum storage) · (c) 1 year (leanest defensible window).
- Recommendation: (a) 2 years — covers the 48h sync age and realistic dispute windows without indefinite growth.
- Owner decision: [x] (a) — APPROVED OWNER DECISION 2026-09-21.
- Approval status: APPROVED — 2-year key retention.

## R2 — Archive-vs-delete behavior
- Current proposal exactly: audit 7 years then read-only archive (not delete); operational rows purge after retention.
- Schema/operational impact: archive needs read-only stores + access paths; delete needs purge jobs; mixing them up destroys evidence or bloats live tables.
- Alternatives: (a) as proposed · (b) delete everything post-retention including audit (simplest, destroys evidence) · (c) archive everything, purge nothing (safest, unbounded growth).
- Recommendation: (a) — money-truth and audit permanence preserved; operational tables stay lean.
- Owner decision: [x] (a) — APPROVED OWNER DECISION 2026-09-21.
- Approval status: APPROVED — archive audit, purge operational rows.

## R3 — Legal/audit hold interaction
- Current proposal exactly: hold flag per entity suspends purge; holds are Admin-set, reason-coded, audited.
- Schema/operational impact: hold columns + hold-aware purge queries; held rows skip rotation until released.
- Alternatives: (a) as proposed · (b) no holds (purge runs blind — evidence risk under dispute).
- Recommendation: (a) — disputes and inspections require freezing specific records.
- Owner decision: [x] (a) — APPROVED OWNER DECISION 2026-09-21.
- Approval status: APPROVED — per-entity holds, Admin-set, reason-coded, audited.

## R4 — Backup interaction
- Current proposal exactly: backups retain purged data until backup rotation ages them out; restores re-run purge reconciliation.
- Schema/operational impact: purge is meaningless without rotation-aware restores; restore runbooks must include the reconciliation step.
- Alternatives: (a) as proposed · (b) purge backups aggressively (complex, risks recovery integrity).
- Recommendation: (a) — recovery integrity outranks purge speed; document the lag honestly.
- Owner decision: [x] (a) — APPROVED OWNER DECISION 2026-09-21.
- Approval status: APPROVED — rotation-aged backups with purge reconciliation on restore.

## R5 — Tenant isolation
- Current proposal exactly: all retention/purge scoped per `tenant_id`; cross-tenant purge impossible by constraint.
- Schema/operational impact: purge jobs take tenant scope as a mandatory parameter; RLS policies mirror it.
- Alternatives: none viable — isolation is architectural law, not a tunable.
- Recommendation: as proposed (no alternative offered).
- Owner decision: [x] Confirmed — APPROVED OWNER DECISION 2026-09-21.
- Approval status: APPROVED — per-tenant retention/purge with cross-tenant purge impossible by constraint.

## R6 — Auditability of purge/archive operations
- Current proposal exactly: purges are Admin-gated, reason-coded, audited jobs; the retention schedule itself is audited.
- Schema/operational impact: purge log + schedule tables; every destroyed or archived row traceable to actor + reason + policy version.
- Alternatives: (a) as proposed · (b) unaudited automated purge (simplest, unaccountable — not recommended).
- Recommendation: (a).
- Owner decision: [x] (a) — APPROVED OWNER DECISION 2026-09-21.
- Approval status: APPROVED — Admin-gated, reason-coded, audited purges; schedule itself audited.

## Plain-text response template (copy, fill, return)
```
RETENTION DECISIONS — date: __________
R1 key period: [(a) 2 years / (b) 7 years / (c) 1 year / Amended: ___]
R2 archive-vs-delete: [(a) as proposed / (b) delete-all / (c) archive-all / Amended: ___]
R3 holds: [(a) as proposed / (b) no holds / Amended: ___]
R4 backups: [(a) as proposed / (b) aggressive-purge / Amended: ___]
R5 tenant isolation: [Confirmed / Amended: ___]
R6 purge audit: [(a) as proposed / (b) unaudited / Amended: ___]
Approver name: __________  Signature/date: __________
```
