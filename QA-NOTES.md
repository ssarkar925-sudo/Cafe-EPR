# Cafe ERP QA — Runtime hardening pass

## Fix included in this build

### Transaction cashbook edit safety
`components/business/business-client.tsx` no longer destructively deletes older `cash_entries` rows while synchronizing a transaction after an edit.

This matters because the canonical `update_business_txn()` RPC posts compensating correction legs using the same transaction reference. The previous UI cleanup could mistake those historical correction legs for duplicate current legs and delete them.

The synchronization code now:
- reads `created_at`;
- treats the newest matching leg as the current leg;
- updates that current leg when appropriate;
- preserves older correction/reversal legs;
- never bulk-deletes historical transaction cash legs from the browser.

## Database safety
No production data is changed by this patch. No UPDATE/DELETE/INSERT/TRUNCATE is included in the patch itself.

## Verification
The repository's automated financial invariant suite passes:
- 397 passed
- 0 failed

The local application should still be validated with `npm install`, `npm run build`, and runtime business-flow tests against the user's Supabase project.
