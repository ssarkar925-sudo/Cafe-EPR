# V1 G1–G3 Correction Log
Status: **DOCUMENTATION ONLY — no SQL, code, tests, objects, or database contact.**
Leg economics below are derived from observed legacy behavior and marked as such; they require finance re-verification at baseline. Nothing here approves unspecified policy. Preserved: A2, D1–D11, D9.1–D9.4, F1–F3, D5 amendment.

## G1 — Per-service journal legs (uniform money path, F2)
Common pattern: service sale → payment claim (single-table, F1) → server validation → balanced journal batch with `(source_type='service_transaction', source_id)` → settlement/reconciliation refs. Posting occurs only on recognition; failures pre-posting leave no legs; reversals are full mirror entries.

- **AEPS** (legacy-derived; re-verify at baseline): cash withdrawal — customer receives `cash_out = amount − fee`; float credited `pool_credit = amount + commission`. Legs: Dr Float Clearing (pool_credit) / Cr Cash Drawer (cash_out) / Cr Fee Income (service_fee) / Cr Commission Income (portal_commission). Settlement linkage: float vs portal settlement records by source ref. Required: aadhaar_last4 (max), amount, portal/bank refs. Sensitive: Aadhaar last-4 maximum; no full identity numbers.
- **DMT**: sender-funded transfer to beneficiary. Legs: Dr Funding Clearing (bank/portal out + fee) / Cr Bank/Portal payout / Cr Fee Income. Required: sender + beneficiary identity fields, transfer method, pay-from ref. Sensitive: beneficiary account/IFSC operational only.
- **UPI**: merchant-QR collection. Legs: Dr Bank/UPI clearing (gross) / Cr takings or customer dues / Cr or Dr fee per fee-source rule (cut-from-payment vs separate). Required: payer UPI ref, merchant QR ref, amount. Sensitive: UPI IDs as refs only.
- **Recharge**: provider-funded top-up. Legs: Dr Cash/Provider Clearing / Cr Provider Payable / Cr Commission Income. Required: provider ref, receiver number, amount. Sensitive: receiver numbers operational only.
- **BBPS** (thinnest evidence — OPEN for owner confirmation): biller ref, consumer number, bill amount, fee; legs analogous to Recharge. Owner must confirm field list before baseline.
- **Other record-only services:** follow the common pattern above; no service posts outside claims→journals.
- Offline: service sales sync as claims; numbers provisional until validation; failed validations route to the exception queue, never partial-posts.

## G2 — Day-close records
- **day_closes** (new entity): `(tenant_id, business_date)` unique; scope tenant-wide; status (open, balanced, variance_pending, locked); closer + approver refs; variance journal ref; lock timestamp.
- **day_close_lines**: per instrument (and per device count sheet): opening, expected (server-computed), counted (entered), variance = counted − expected in ₹0.01 half-up.
- Tolerance: |variance| ≤ ₹1 auto-accepts with variance journal to cash over/short; over-tolerance escalates to Admin with approval record (admin final authority preserved).
- Reopen: prohibited after lock; corrections via linked live-period entries only (locked-period rule).
- Offline: close requires all devices synced (watermark check) — proposal; provisional offline counts are claims, not close inputs.
- Audit: every count, approval, variance journal, and lock event recorded with actor + timestamp.

## G3 — Retention and purge design (tiers approved in F3)
- **Classes:** journals = permanent, never purged. Audit = 7 years, then read-only archive (not delete) — proposal within approved tier. Idempotency keys: retained beyond payloads; exact period OPEN (proposal: 2 years). Outbox payloads: pruned after sync+30d (approved). Device tokens: dropped on revocation/expiry. Customer PII: kept only while dues active or statute requires.
- **Legal/audit hold:** hold flag per entity suspends purge; holds are Admin-set, reason-coded, audited — proposal.
- **Archive vs purge:** journals/audit archive read-only; operational rows purge after retention; purges are Admin-gated jobs, reason-coded, audited.
- **Minimization:** as approved (no card/PIN/MPIN/full-account/Aadhaar-beyond-last-4/biometric data; refs only).
- **Tenant isolation:** all retention/purge scoped per `tenant_id`; cross-tenant purge impossible by constraint.
- **Backup implications (disclosure):** backups retain purged data until backup rotation ages them out; restores must re-run purge reconciliation — proposal, needs backup-procedure update.

## Consistency checklist
- G1 legs balance per service (Dr=Cr shown); uniform path preserved; BBPS marked OPEN.
- G2 tolerance/approval rules match A2 (₹1, admin-final); locked-period and reversal rules consistent.
- G3 tiers match approved F3; journals permanent; minimization rules match register.
- No approved decision altered; D5/D9/BBPS/GST notes intact.
