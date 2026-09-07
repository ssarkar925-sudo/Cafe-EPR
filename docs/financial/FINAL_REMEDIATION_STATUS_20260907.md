# CafeERP Financial Remediation — Final Engineering Gate

## Scope

This branch contains repository-side hardening that is independent of the approved production remediation migration `20260907_01_controlled_financial_remediation.sql`.

## Production state

- Project: `tvxehxnvuwojjbhysajp`
- Production migration history: 262 applied migrations
- Latest production migration: `20260906173737_allow_due_only_transaction_collection`
- `20260907_01` has not been applied
- The approved `20260907_01` SHA-256 is `8dd84fb143c60878324bd37a91f1c6f5785ee5fc62ad54720ffee2f7376f341f`
- `20260907_02_historical_batch_correction.sql` is rejected and must remain outside `supabase/migrations/`

## Current engineering decision

Normal `supabase db push` is not approved for this repository because the local migration chain is not the same migration-version set as production.

The deployment plan therefore requires:

1. production snapshot and read-only baseline;
2. execution of the exact approved remediation SQL only;
3. post-change catalog/permission verification;
4. migration-history recording only after the SQL succeeds;
5. controlled financial smoke tests;
6. independent operational-versus-GL reconciliation.

## Repository hardening in this branch

- Direct client DML against core financial ledgers is removed at the database privilege boundary.
- Anonymous execution of sensitive DMT/edit/recharge mutation overloads is removed.
- Server admin client configuration fails closed when the service-role secret is absent.
- The approved `20260907_01` migration remains immutable and is not recreated or replaced here.

## Outstanding certification gates

Production remains `NOT CERTIFIED — DEPLOYMENT FROZEN` until the physical database snapshot, exact migration execution, and post-deployment smoke tests have all passed.
