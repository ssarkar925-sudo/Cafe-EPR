-- Migration: 20260920000000_canonical_transactions_recovery.sql
-- Description: Canonical recovery of public.transactions table, constraints, indexes, RLS, and triggers
-- Source: Production schema dump (prod_schema_public_20260920.sql) from project tvxehxnvuwojjbhysajp
-- Date: 2026-09-20
-- Status: REVIEWED & CONFIRMED (Zero invented schema details)

-- 1. Sequence
CREATE SEQUENCE IF NOT EXISTS public.transaction_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- 2. Base Table (Exact 66-column canonical definition from production dump)
CREATE TABLE IF NOT EXISTS public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_number text NOT NULL,
    service_type text NOT NULL,
    direction text NOT NULL,
    transaction_date date DEFAULT CURRENT_DATE NOT NULL,
    customer_id uuid,
    customer_name text,
    phone text,
    aadhaar_last4 text,
    bank_name text,
    account_last4 text,
    reference text,
    amount numeric(15,2) NOT NULL,
    commission numeric(15,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_by uuid,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    customer_mobile text,
    bank_id uuid,
    portal_id uuid,
    merchant_qr_id uuid,
    transfer_method text,
    sender_name text,
    sender_mobile text,
    beneficiary_name text,
    beneficiary_mobile text,
    beneficiary_bank text,
    beneficiary_ifsc text,
    beneficiary_account text,
    upi_id text,
    service_fee numeric(15,2) DEFAULT 0 NOT NULL,
    portal_commission numeric(15,2) DEFAULT 0 NOT NULL,
    remarks text,
    reversed_at timestamp with time zone,
    reversed_by uuid,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    transaction_timestamp timestamp with time zone,
    fee_source text,
    paid_from text,
    customer_pay_method text,
    cash_out numeric(15,2) DEFAULT 0 NOT NULL,
    cash_in numeric(15,2) DEFAULT 0 NOT NULL,
    bank_out numeric(15,2) DEFAULT 0 NOT NULL,
    bank_in numeric(15,2) DEFAULT 0 NOT NULL,
    pool_out numeric(15,2) DEFAULT 0 NOT NULL,
    pool_credit numeric(15,2) DEFAULT 0 NOT NULL,
    pool_credit_type text,
    upi_fee numeric(15,2) DEFAULT 0 NOT NULL,
    provider_id uuid,
    instrument_id uuid,
    pay_from_instrument_id uuid,
    pay_from_method text DEFAULT 'bank'::text,
    receiver_name text,
    portal_charge numeric DEFAULT 0 NOT NULL,
    service_id uuid,
    subservice_id uuid,
    total_amount numeric GENERATED ALWAYS AS (amount) STORED,
    customer_collected_amount numeric DEFAULT 0 NOT NULL,
    customer_due_amount numeric DEFAULT 0 NOT NULL,
    customer_collection_method text,
    customer_collection_instrument_id uuid,
    customer_payment_allocations jsonb DEFAULT '[]'::jsonb NOT NULL
);

-- 3. Primary Key & Unique Constraints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE contype = 'p' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_transaction_number_key' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_transaction_number_key UNIQUE (transaction_number);
    END IF;
END $$;

-- 4. Check Constraints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_amount_check' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_amount_check CHECK ((amount > (0)::numeric));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_amount_positive_chk' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_amount_positive_chk CHECK ((amount > (0)::numeric));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_commission_check' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_commission_check CHECK ((commission >= (0)::numeric));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_customer_collection_amounts_chk' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_customer_collection_amounts_chk CHECK (((customer_collected_amount >= (0)::numeric) AND (customer_due_amount >= (0)::numeric) AND ((customer_collected_amount + customer_due_amount) <= (((amount + COALESCE(service_fee, (0)::numeric)) + COALESCE(portal_charge, (0)::numeric)) + 0.01))));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_customer_collection_method_chk' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_customer_collection_method_chk CHECK (((customer_collection_method IS NULL) OR (customer_collection_method = ANY (ARRAY['cash'::text, 'bank'::text, 'upi'::text, 'qr'::text, 'due'::text, 'wallet'::text, 'card'::text, 'debit_card'::text, 'credit_card'::text]))));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_customer_pay_method_check' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_customer_pay_method_check CHECK (((customer_pay_method IS NULL) OR (customer_pay_method = ANY (ARRAY['cash'::text, 'bank'::text, 'upi'::text, 'qr'::text, 'due'::text, 'wallet'::text, 'card'::text, 'debit_card'::text, 'credit_card'::text]))));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_direction_check' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text])));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_fee_source_check' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_fee_source_check CHECK (((fee_source IS NULL) OR (fee_source = ANY (ARRAY['cut_from_withdrawal'::text, 'cut_from_payment'::text, 'separate_cash'::text, 'upi'::text]))));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_financial_fields_nonnegative_chk' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_financial_fields_nonnegative_chk CHECK (((COALESCE(service_fee, (0)::numeric) >= (0)::numeric) AND (COALESCE(portal_commission, (0)::numeric) >= (0)::numeric) AND (COALESCE(commission, (0)::numeric) >= (0)::numeric) AND (COALESCE(cash_in, (0)::numeric) >= (0)::numeric) AND (COALESCE(cash_out, (0)::numeric) >= (0)::numeric) AND (COALESCE(bank_in, (0)::numeric) >= (0)::numeric) AND (COALESCE(bank_out, (0)::numeric) >= (0)::numeric) AND (COALESCE(pool_out, (0)::numeric) >= (0)::numeric) AND (COALESCE(pool_credit, (0)::numeric) >= (0)::numeric)));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_paid_from_check' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_paid_from_check CHECK (((paid_from IS NULL) OR (paid_from = ANY (ARRAY['bank'::text, 'portal'::text]))));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_pay_method_check' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_pay_method_check CHECK (((customer_pay_method IS NULL) OR (customer_pay_method = ANY (ARRAY['cash'::text, 'bank'::text, 'upi'::text, 'qr'::text, 'due'::text, 'wallet'::text, 'card'::text, 'debit_card'::text, 'credit_card'::text]))));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_service_type_check' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_service_type_check CHECK ((service_type = ANY (ARRAY['aeps'::text, 'dmt'::text, 'upi'::text, 'recharge'::text, 'recharge_due'::text, 'due'::text, 'bill_payment'::text, 'utility_bill'::text, 'google_play_recharge'::text, 'google_play'::text])));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_status_check' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_status_check CHECK ((status = ANY (ARRAY['success'::text, 'pending'::text, 'failed'::text, 'reversed'::text, 'deleted'::text])));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_transfer_method_check' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_transfer_method_check CHECK (((transfer_method IS NULL) OR (transfer_method = ANY (ARRAY['bank_account'::text, 'upi'::text]))));
    END IF;
END $$;

-- 5. Foreign Key Constraints (guarded by to_regclass for target table availability)
DO $$
BEGIN
    IF to_regclass('public.aeps_banks') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_bank_id_fkey' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_bank_id_fkey FOREIGN KEY (bank_id) REFERENCES public.aeps_banks(id) ON DELETE SET NULL;
    END IF;
    IF to_regclass('auth.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_cancelled_by_fkey' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
    IF to_regclass('public.profiles') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_created_by_fkey' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;
    IF to_regclass('public.customers') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_customer_id_fkey' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
    END IF;
    IF to_regclass('auth.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_deleted_by_fkey' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
    IF to_regclass('public.payment_instruments') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_instrument_id_fkey' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_instrument_id_fkey FOREIGN KEY (instrument_id) REFERENCES public.payment_instruments(id) ON DELETE SET NULL;
    END IF;
    IF to_regclass('public.upi_merchant_qrs') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_merchant_qr_id_fkey' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_merchant_qr_id_fkey FOREIGN KEY (merchant_qr_id) REFERENCES public.upi_merchant_qrs(id) ON DELETE SET NULL;
    END IF;
    IF to_regclass('public.payment_instruments') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_pay_from_instrument_id_fkey' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_pay_from_instrument_id_fkey FOREIGN KEY (pay_from_instrument_id) REFERENCES public.payment_instruments(id) ON DELETE SET NULL;
    END IF;
    IF to_regclass('public.aeps_portals') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_portal_id_fkey' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_portal_id_fkey FOREIGN KEY (portal_id) REFERENCES public.aeps_portals(id) ON DELETE SET NULL;
    END IF;
    IF to_regclass('public.recharge_providers') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_provider_id_fkey' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.recharge_providers(id) ON DELETE SET NULL;
    END IF;
    IF to_regclass('auth.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_reversed_by_fkey' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_reversed_by_fkey FOREIGN KEY (reversed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
    IF to_regclass('public.services') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_service_id_fkey' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE RESTRICT;
    END IF;
    IF to_regclass('public.services') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_subservice_id_fkey' AND conrelid = 'public.transactions'::regclass) THEN
        ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_subservice_id_fkey FOREIGN KEY (subservice_id) REFERENCES public.services(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_customer_collection_instrument ON public.transactions USING btree (customer_collection_instrument_id);
CREATE INDEX IF NOT EXISTS idx_transactions_pay_from_instrument ON public.transactions USING btree (pay_from_instrument_id);
CREATE INDEX IF NOT EXISTS transactions_bank_idx ON public.transactions USING btree (bank_id);
CREATE INDEX IF NOT EXISTS transactions_cancelled_by_idx ON public.transactions USING btree (cancelled_by);
CREATE INDEX IF NOT EXISTS transactions_created_by_idx ON public.transactions USING btree (created_by);
CREATE INDEX IF NOT EXISTS transactions_customer_idx ON public.transactions USING btree (customer_id);
CREATE INDEX IF NOT EXISTS transactions_date_idx ON public.transactions USING btree (transaction_date DESC);
CREATE INDEX IF NOT EXISTS transactions_deleted_by_idx ON public.transactions USING btree (deleted_by);
CREATE INDEX IF NOT EXISTS transactions_instrument_id_idx ON public.transactions USING btree (instrument_id);
CREATE INDEX IF NOT EXISTS transactions_merchant_qr_idx ON public.transactions USING btree (merchant_qr_id);
CREATE INDEX IF NOT EXISTS transactions_portal_idx ON public.transactions USING btree (portal_id);
CREATE INDEX IF NOT EXISTS transactions_provider_id_idx ON public.transactions USING btree (provider_id);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_reference_uq ON public.transactions USING btree (reference) WHERE (reference IS NOT NULL);
CREATE INDEX IF NOT EXISTS transactions_reversed_by_idx ON public.transactions USING btree (reversed_by);
CREATE INDEX IF NOT EXISTS transactions_service_id_idx ON public.transactions USING btree (service_id);
CREATE INDEX IF NOT EXISTS transactions_service_idx ON public.transactions USING btree (service_type);
CREATE INDEX IF NOT EXISTS transactions_status_idx ON public.transactions USING btree (status);
CREATE INDEX IF NOT EXISTS transactions_subservice_id_idx ON public.transactions USING btree (subservice_id);

-- 7. Row Level Security & Policies
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions insert denied" ON public.transactions;
CREATE POLICY "transactions insert denied" ON public.transactions FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "transactions insert google play backoffice" ON public.transactions;
CREATE POLICY "transactions insert google play backoffice" ON public.transactions FOR INSERT TO authenticated WITH CHECK ((public.is_back_office() AND (service_type = ANY (ARRAY['google_play_recharge'::text, 'google_play'::text])) AND (status = ANY (ARRAY['success'::text, 'pending'::text, 'failed'::text])) AND (amount > (0)::numeric) AND (COALESCE(service_fee, (0)::numeric) >= (0)::numeric) AND (COALESCE(portal_charge, (0)::numeric) = (0)::numeric) AND (COALESCE(portal_commission, (0)::numeric) >= (0)::numeric) AND (COALESCE(portal_commission, (0)::numeric) <= amount) AND (EXISTS ( SELECT 1
   FROM public.payment_instruments pi
  WHERE ((pi.id = COALESCE(transactions.pay_from_instrument_id, transactions.instrument_id)) AND (pi.is_active = true) AND (lower(pi.type) <> 'cash'::text))))));

DROP POLICY IF EXISTS "transactions select" ON public.transactions;
CREATE POLICY "transactions select" ON public.transactions FOR SELECT TO authenticated USING (public.is_back_office());

DROP POLICY IF EXISTS "transactions update denied" ON public.transactions;
CREATE POLICY "transactions update denied" ON public.transactions FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

-- 8. Triggers (conditionally attach if functions exist)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'bind_upi_transaction_to_merchant_qr') THEN
        DROP TRIGGER IF EXISTS trg_000_a_upi_qr_binding ON public.transactions;
        CREATE TRIGGER trg_000_a_upi_qr_binding BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.bind_upi_transaction_to_merchant_qr();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_google_play_funding_account') THEN
        DROP TRIGGER IF EXISTS trg_000_normalize_google_play_funding ON public.transactions;
        CREATE TRIGGER trg_000_normalize_google_play_funding BEFORE INSERT OR UPDATE OF service_type, status, instrument_id, pay_from_instrument_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.validate_google_play_funding_account();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'normalize_transaction_fee_source') THEN
        DROP TRIGGER IF EXISTS trg_000_normalize_transaction_fee_source ON public.transactions;
        CREATE TRIGGER trg_000_normalize_transaction_fee_source BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.normalize_transaction_fee_source();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resolve_transaction_payment_instruments') THEN
        DROP TRIGGER IF EXISTS trg_000_resolve_transaction_payment_instruments ON public.transactions;
        CREATE TRIGGER trg_000_resolve_transaction_payment_instruments BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.resolve_transaction_payment_instruments();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sync_customer_due_from_transaction_update') THEN
        DROP TRIGGER IF EXISTS trg_000_sync_customer_due ON public.transactions;
        CREATE TRIGGER trg_000_sync_customer_due AFTER UPDATE OF customer_id, customer_due_amount, status ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.sync_customer_due_from_transaction_update();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sync_google_play_bank_out') THEN
        DROP TRIGGER IF EXISTS trg_001_google_play_bank_out ON public.transactions;
        CREATE TRIGGER trg_001_google_play_bank_out BEFORE INSERT OR UPDATE OF pool_out, instrument_id, pay_from_instrument_id, service_type ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.sync_google_play_bank_out();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sync_service_transaction_money_legs') THEN
        DROP TRIGGER IF EXISTS trg_001_sync_service_transaction_money_legs ON public.transactions;
        CREATE TRIGGER trg_001_sync_service_transaction_money_legs AFTER INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.sync_service_transaction_money_legs();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_block_posted_transaction_financial_delete') THEN
        DROP TRIGGER IF EXISTS trg_block_posted_transaction_financial_delete ON public.transactions;
        CREATE TRIGGER trg_block_posted_transaction_financial_delete BEFORE DELETE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.trg_block_posted_transaction_financial_delete();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_block_posted_transaction_financial_update') THEN
        DROP TRIGGER IF EXISTS trg_block_posted_transaction_financial_update ON public.transactions;
        CREATE TRIGGER trg_block_posted_transaction_financial_update BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.trg_block_posted_transaction_financial_update();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_online_service_funding_account') THEN
        DROP TRIGGER IF EXISTS trg_enforce_online_service_funding_account ON public.transactions;
        CREATE TRIGGER trg_enforce_online_service_funding_account BEFORE INSERT OR UPDATE OF service_type, instrument_id, pay_from_instrument_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_online_service_funding_account();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_transaction_money_instrument') THEN
        DROP TRIGGER IF EXISTS trg_enforce_transaction_money_instrument ON public.transactions;
        CREATE TRIGGER trg_enforce_transaction_money_instrument BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_transaction_money_instrument();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'mark_nested_transaction_update_internal') THEN
        DROP TRIGGER IF EXISTS trg_mark_nested_transaction_update_internal ON public.transactions;
        CREATE TRIGGER trg_mark_nested_transaction_update_internal BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.mark_nested_transaction_update_internal();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'normalize_google_play_transaction_number') THEN
        DROP TRIGGER IF EXISTS trg_normalize_google_play_transaction_number ON public.transactions;
        CREATE TRIGGER trg_normalize_google_play_transaction_number BEFORE INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.normalize_google_play_transaction_number();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'post_service_transaction_accounting_bridge') THEN
        DROP TRIGGER IF EXISTS trg_post_service_transaction_accounting_bridge ON public.transactions;
        CREATE CONSTRAINT TRIGGER trg_post_service_transaction_accounting_bridge AFTER INSERT ON public.transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.post_service_transaction_accounting_bridge();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_service_transaction_edit_accounting') THEN
        DROP TRIGGER IF EXISTS trg_service_transaction_edit_accounting ON public.transactions;
        CREATE TRIGGER trg_service_transaction_edit_accounting AFTER UPDATE OF transaction_date, transaction_timestamp, customer_id, amount, service_fee, portal_charge, portal_commission, cash_in, cash_out, bank_in, bank_out, pool_out, pool_credit, pool_credit_type, upi_fee, pay_from_instrument_id, pay_from_method, customer_pay_method, paid_from, fee_source, provider_id, bank_id, portal_id, merchant_qr_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.trg_service_transaction_edit_accounting();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_dmt_business_date') THEN
        DROP TRIGGER IF EXISTS trg_set_dmt_business_date ON public.transactions;
        CREATE TRIGGER trg_set_dmt_business_date BEFORE INSERT OR UPDATE OF transaction_timestamp, service_type ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_dmt_business_date();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sync_google_play_money_legs') THEN
        DROP TRIGGER IF EXISTS trg_sync_google_play_money_legs ON public.transactions;
        CREATE TRIGGER trg_sync_google_play_money_legs AFTER INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.sync_google_play_money_legs();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_financial_account_linkage') THEN
        DROP TRIGGER IF EXISTS trg_validate_financial_account_linkage ON public.transactions;
        CREATE TRIGGER trg_validate_financial_account_linkage BEFORE INSERT OR UPDATE OF status, customer_pay_method, instrument_id, pay_from_method, pay_from_instrument_id, amount ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.validate_financial_account_linkage();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_online_service_funding_account') THEN
        DROP TRIGGER IF EXISTS trg_validate_online_service_funding_account ON public.transactions;
        CREATE TRIGGER trg_validate_online_service_funding_account BEFORE INSERT OR UPDATE OF service_type, instrument_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.validate_online_service_funding_account();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_service_payment_instrument') THEN
        DROP TRIGGER IF EXISTS trg_validate_service_payment_instrument ON public.transactions;
        CREATE TRIGGER trg_validate_service_payment_instrument BEFORE INSERT OR UPDATE OF amount, pay_from_instrument_id, pay_from_method, service_type ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.validate_service_payment_instrument();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_service_portal_link') THEN
        DROP TRIGGER IF EXISTS trg_validate_service_portal_link ON public.transactions;
        CREATE TRIGGER trg_validate_service_portal_link BEFORE INSERT OR UPDATE OF service_type, portal_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.validate_service_portal_link();
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_service_transaction_money_trail') THEN
        DROP TRIGGER IF EXISTS trg_validate_service_transaction_money_trail ON public.transactions;
        CREATE CONSTRAINT TRIGGER trg_validate_service_transaction_money_trail AFTER INSERT OR UPDATE OF status, service_type, amount, customer_collected_amount, customer_collection_instrument_id, customer_payment_allocations, pool_out, pay_from_instrument_id, pay_from_method ON public.transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_service_transaction_money_trail();
    END IF;
END $$;
