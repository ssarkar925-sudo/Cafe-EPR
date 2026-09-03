-- Remove a duplicate unique index on transaction cash-entry idempotency.
-- ux_transaction_account_direction_once remains as the canonical constraint.
drop index if exists public.ux_upi_transaction_instrument_direction;