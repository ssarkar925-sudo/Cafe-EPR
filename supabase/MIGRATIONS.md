# CafeERP database migration policy

## Production source of truth

`supabase/migrations/` is the only deployable schema and database-function history.

Apply migrations in filename order with the Supabase migration tooling. Never paste a
root-level SQL file into production as an ad-hoc repair.

## Root-level SQL files

SQL files directly under `supabase/` are legacy/reference material unless explicitly
identified as a migration. They are not part of the production migration chain.

## Financial data policy

- Never delete or overwrite posted financial records to correct a mistake.
- Use reversal/correction workflows and preserve the audit trail.
- Do not create a second balance engine or a second general ledger.
- `accounting_accounts.system_key` is the stable accounting role; `code` is a presentation identifier.
- Operational subledgers (customer ledger, inventory, cash entries, payment instruments)
  feed the accounting engine; they are not alternative P&Ls.
- Reports must use posted journal entries for formal accounting statements.

## Migration safety

Before production deployment, verify the migration against a disposable database replay.
For financial migrations, also run the financial invariant suite and the production smoke
matrix documented in the repository audit.
