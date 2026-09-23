# V1 Final Architecture Blocker Review
ERP: CyberCafe & Digital Services ERP · Date: 2026-09-21
Status: **APPROVED BY OWNER — 2026-09-21 (D9, BBPS, GST recommendations).** Documentation only; no SQL, code, tests, objects, or database contact.
Scope: ONLY the three remaining architecture blockers. Everything else is recorded as resolved in the cited sources; nothing here re-decides approved items.

## A. D9 — Detailed historical back-entry specification
1. **Approved:** 12-month lookback (from 2025-01-01); single atomic lock; reject unknown expiry; suspense-as-proposed (evidence, authorized clearing, balanced journals, complete audit); admin-only entry + lock; cancel-and-recreate corrections; dual timestamps; idempotent batches.
2. **Unresolved:** the detailed mini-spec itself — eligible source-record rules, lot-absorption mapping, suspense execution mechanics, closure acceptance procedure, back-entry execution method.
3. **Affected entities/relationships:** `back_entry_batches → back_entry_lines`, suspense records, lot/opening links, lock record, origin-flagged journals.
4. **Proposed final design:** mini-spec fills exactly the §16-pending structures of the design spec; no other entity changes.
5. **Implications:** financial (opening journals must balance), sync (history is read-only reference), audit (per-record actor/reason/source), minimization (source refs only, no PII beyond dues necessity).
6. **Blocks schema:** YES — back-entry structures cannot be finalized.
7. **Owner decision:** [x] Approve mini-spec draft when presented — APPROVED OWNER DECISION 2026-09-21 (proceed per recommended design; detailed mini-spec returns for its own review).
8. **Status:** APPROVED (recommendation).
9. **Consistency verified:** lookback ✓ · single lock ✓ · reject-unknown-expiry ✓ · suspense mechanism ✓ · locked-period rules ✓ · reversal linkage ✓ — all preserved, no drift. No business or legal requirements invented.

## B. BBPS — Final V1 record-only field freeze
1. **Approved:** record-only in V1; questionnaire §12 proposal list; BBPS uncertainty preserved; no live API.
2. **Unresolved:** exact bill-reference fields (biller ref, consumer number, bill amount, fee confirmed in proposal; bill date/reference number need confirmation).
3. **Affected entities/relationships:** `service_transactions` BBPS columns; claim linkage; fee legs.
4. **Proposed final design:** freeze the §12 list; any unconfirmed field is OMITTED (never speculative), addable later by migration.
5. **Implications:** financial (fee legs post like Recharge); sync (unknown fields reject at intake — freeze prevents this); audit (standard events); minimization (biller/consumer refs only — no credentials, no full account data).
6. **Blocks schema:** YES — service columns cannot freeze with open fields.
7. **Owner decision:** [x] Freeze §12 list as-is — APPROVED OWNER DECISION 2026-09-21.
8. **Status:** APPROVED (recommendation).
9. **Constraints honored:** record-only (no live API introduced); confirmed vs proposed fields distinguished (§12 proposal vs owner freeze); no unnecessary sensitive financial/customer credentials stored.

## C. GST — Dormant-seam baseline review
1. **Approved:** masters + flags only; computation disabled.
2. **Unresolved:** baseline review confirming the seam set (no more, no less).
3. **Affected entities/relationships:** `hsn_codes`, `tax_rates` (effective-dated), document flags; HSN snapshot on lines (data, not computation).
4. **Proposed final design:** ship exactly the approved set; dormant flags validated against known values; zero computation/filing columns.
5. **Implications:** financial (none at launch — totals exclude tax math); sync (flags validate, never compute); audit (flag changes logged); minimization (no taxpayer IDs beyond approved flags).
6. **Blocks schema:** PARTIAL — masters shippable; review gates baseline sign-off, not structure.
7. **Owner decision:** [x] Confirm seam set — APPROVED OWNER DECISION 2026-09-21.
8. **Status:** APPROVED (recommendation).
9. **Constraints honored:** computation DISABLED; no tax posting; no GST-dependent invoice totals. Future activation fields required: `hsn_code`, `gst_rate`, `rate_effective_from/to`, `supply_type`, `b2b_or_b2c`, `place_of_supply`, `reverse_charge_flag` — reference only.

## Implementation Authorization Gate
**Schema/migration implementation remains UNAUTHORIZED until ALL of the following hold:** (1) D9 mini-spec resolved and approved; (2) BBPS fields frozen; (3) GST seams reviewed; (4) a final schema audit passes on the completed baseline design; (5) explicit owner authorization for baseline work is given in writing. No partial implementation, no representative subset, no provisional DDL before the gate clears.
