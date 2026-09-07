BEGIN;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS customer_collected_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_due_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_collection_method text,
  ADD COLUMN IF NOT EXISTS customer_collection_instrument_id uuid;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_customer_collection_amounts_chk;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_customer_collection_amounts_chk CHECK (
  customer_collected_amount >= 0 AND customer_due_amount >= 0 AND
  customer_collected_amount + customer_due_amount <= amount + COALESCE(service_fee,0) + COALESCE(portal_charge,0) + 0.01
);

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_customer_collection_method_chk;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_customer_collection_method_chk CHECK (
  customer_collection_method IS NULL OR customer_collection_method = ANY (ARRAY[
    'cash','bank','upi','qr','due','wallet','card','debit_card','credit_card'
  ])
);

CREATE INDEX IF NOT EXISTS idx_transactions_customer_collection_instrument
  ON public.transactions(customer_collection_instrument_id);

COMMIT;
