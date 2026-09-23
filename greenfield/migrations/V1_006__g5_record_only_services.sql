-- ============================================================================
-- V1 BASELINE — G5: record-only service transactions (AEPS/DMT/UPI/Recharge/
-- BBPS) with F2 uniform money-path linkage.
-- Depends on: G0 (tenant/roles/numbering), G1 (customers/instruments),
--             G4 (payment_claims single-table model).
-- Record-only: NO live provider APIs, webhooks, credential vaults,
-- settlement integrations, or external calls. No journal posting (G6);
-- service rows link to claims, and claims post in G6.
-- BBPS columns are exactly the frozen approved set; nothing speculative.
-- G0 completion inside: numbering_sequences gains 'service' (+ seed rows
-- for active tenants; future tenant provisioning must seed sequences —
-- documented operational procedure, out of scope here).
-- G4 completion inside: payment_claims gains nullable service_transaction_id
-- (uniform path linkage; claims predate it, hence nullable + no backfill
-- needed — no existing claim references a service).
-- Single transaction, fail-closed.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. G0/G4 completions (documented dependency closures, additive only)
-- --------------------------------------------------------------------------
ALTER TABLE public.numbering_sequences
  DROP CONSTRAINT numbering_sequences_seq_name_check;
ALTER TABLE public.numbering_sequences
  ADD CONSTRAINT numbering_sequences_seq_name_check
  CHECK (seq_name IN ('invoice','settlement','closing','service'));

INSERT INTO public.numbering_sequences (tenant_id, seq_name)
SELECT t.id, 'service'
FROM public.tenants t
WHERE t.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM public.numbering_sequences s
                  WHERE s.tenant_id = t.id AND s.seq_name = 'service');

-- --------------------------------------------------------------------------
-- 2. service_transactions (record-only; per-type frozen columns)
-- --------------------------------------------------------------------------
CREATE TABLE public.service_transactions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES public.tenants (id)
                         ON DELETE RESTRICT,
  service_type         text        NOT NULL
                       CHECK (service_type IN
                              ('aeps','dmt','upi','recharge','bbps')),
  client_uuid          uuid        NOT NULL,
  idempotency_key      text,
  transaction_number   text        NOT NULL,
  transaction_date     date        NOT NULL,
  amount               numeric(18,2) NOT NULL CHECK (amount > 0),
  fee                  numeric(18,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  commission           numeric(18,2) NOT NULL DEFAULT 0 CHECK (commission >= 0),
  status               text        NOT NULL DEFAULT 'recorded'
                       CHECK (status IN ('recorded','reversed','cancelled')),
  reverses             uuid        REFERENCES public.service_transactions (id)
                         ON DELETE RESTRICT,
  reversed_by          uuid        REFERENCES public.service_transactions (id)
                         ON DELETE RESTRICT,
  recorded_by_profile  uuid        NOT NULL REFERENCES public.profiles (id)
                         ON DELETE RESTRICT,
  recorded_at          timestamptz NOT NULL DEFAULT now(),
  -- AEPS (record-only; Aadhaar last-4 maximum — minimization rule)
  aadhaar_last4        text        CHECK (aadhaar_last4 IS NULL
                                         OR aadhaar_last4 ~ '^[0-9]{4}$'),
  bank_ref             text,
  portal_ref           text,
  aeps_txn_type        text        CHECK (aeps_txn_type IS NULL
                                         OR aeps_txn_type IN
                                            ('cash_out','balance_enquiry',
                                             'mini_statement')),
  -- DMT (operational refs only; no credential storage)
  sender_name          text,
  sender_mobile        text,
  beneficiary_name     text,
  beneficiary_mobile   text,
  beneficiary_bank     text,
  beneficiary_ifsc     text,
  beneficiary_account  text,
  transfer_method      text        CHECK (transfer_method IS NULL
                                         OR transfer_method IN
                                            ('bank_account','upi')),
  -- UPI (refs only)
  upi_id               text,
  merchant_qr_ref      text,
  -- Recharge (refs only)
  provider_ref         text,
  receiver_number      text,
  plan_ref             text,
  -- BBPS frozen set (owner-confirmed; nothing speculative)
  biller_ref           text,
  consumer_number      text,
  bill_amount          numeric(18,2) CHECK (bill_amount IS NULL
                                           OR bill_amount >= 0),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_uuid),
  UNIQUE (tenant_id, transaction_number)
);
CREATE INDEX service_txn_tenant_type_status_idx
  ON public.service_transactions (tenant_id, service_type, status);
CREATE INDEX service_txn_tenant_date_idx
  ON public.service_transactions (tenant_id, transaction_date);
CREATE TRIGGER trg_service_txn_updated_at
  BEFORE UPDATE ON public.service_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Uniform-path linkage (G4 completion): claims may reference the service
-- they collect for. Pre-existing claims predate the column (all NULL);
-- no backfill needed or performed.
ALTER TABLE public.payment_claims
  ADD COLUMN service_transaction_id uuid
    REFERENCES public.service_transactions (id)
    ON DELETE RESTRICT;

-- --------------------------------------------------------------------------
-- 3. record_service_txn (any active role records; optional linked collection)
--    p_details carries ONLY the frozen per-type fields; unknown keys in the
--    JSON are ignored (never stored) so speculative data cannot accumulate.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_service_txn(
  p_service_type text, p_transaction_date date, p_amount numeric,
  p_fee numeric DEFAULT 0, p_commission numeric DEFAULT 0,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_collect_method text DEFAULT NULL,
  p_collect_instrument_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_replay boolean; v_resp jsonb;
  v_number text;
  v_svc_id uuid;
  v_claim  uuid;
  d jsonb := coalesce(p_details, '{}'::jsonb);
BEGIN
  -- NOTE: per-type fields are extracted inline below with nullif(btrim())
  -- guards; unknown JSON keys are ignored (never stored).
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.user_id = auth.uid() AND p.is_active
                   AND p.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'No active profile for caller';
  END IF;
  IF p_service_type NOT IN ('aeps','dmt','upi','recharge','bbps') THEN
    RAISE EXCEPTION 'Unsupported service type';
  END IF;
  IF p_transaction_date IS NULL THEN
    RAISE EXCEPTION 'Transaction date required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  p_fee := coalesce(p_fee, 0);
  p_commission := coalesce(p_commission, 0);
  IF p_fee < 0 OR p_commission < 0 THEN
    RAISE EXCEPTION 'Fee/commission must be non-negative';
  END IF;

  SELECT * INTO v_replay, v_resp
  FROM public.idempotency_begin('record_service', p_idempotency_key);
  IF v_replay THEN RETURN v_resp; END IF;

  -- Per-type required-field validation (frozen sets; BBPS exactly as approved)
  IF p_service_type = 'aeps' THEN
    IF nullif(btrim(d->>'aadhaar_last4'), '') IS NULL
       OR btrim(d->>'aadhaar_last4') !~ '^[0-9]{4}$' THEN
      RAISE EXCEPTION 'AEPS requires 4-digit aadhaar_last4';
    END IF;
    IF nullif(btrim(d->>'aeps_txn_type'), '') IS NULL
       OR btrim(d->>'aeps_txn_type') NOT IN
          ('cash_out','balance_enquiry','mini_statement') THEN
      RAISE EXCEPTION 'AEPS requires a valid aeps_txn_type';
    END IF;
  ELSIF p_service_type = 'dmt' THEN
    IF nullif(btrim(d->>'sender_name'), '') IS NULL
       OR nullif(btrim(d->>'beneficiary_name'), '') IS NULL
       OR nullif(btrim(d->>'beneficiary_account'), '') IS NULL THEN
      RAISE EXCEPTION 'DMT requires sender/beneficiary identity fields';
    END IF;
    IF nullif(btrim(d->>'transfer_method'), '') IS NOT NULL
       AND btrim(d->>'transfer_method') NOT IN ('bank_account','upi') THEN
      RAISE EXCEPTION 'DMT transfer_method must be bank_account or upi';
    END IF;
  ELSIF p_service_type = 'upi' THEN
    IF nullif(btrim(d->>'upi_id'), '') IS NULL THEN
      RAISE EXCEPTION 'UPI requires upi_id';
    END IF;
    IF nullif(btrim(d->>'merchant_qr_ref'), '') IS NULL THEN
      RAISE EXCEPTION 'UPI requires merchant_qr_ref';
    END IF;
  ELSIF p_service_type = 'recharge' THEN
    IF nullif(btrim(d->>'provider_ref'), '') IS NULL
       OR nullif(btrim(d->>'receiver_number'), '') IS NULL THEN
      RAISE EXCEPTION 'Recharge requires provider_ref and receiver_number';
    END IF;
  ELSIF p_service_type = 'bbps' THEN
    IF nullif(btrim(d->>'biller_ref'), '') IS NULL
       OR nullif(btrim(d->>'consumer_number'), '') IS NULL THEN
      RAISE EXCEPTION 'BBPS requires biller_ref and consumer_number';
    END IF;
    IF (d->>'bill_amount') IS NULL
       OR coalesce((d->>'bill_amount')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'BBPS requires non-negative bill_amount';
    END IF;
  END IF;

  IF (p_collect_method IS NULL) <> (p_collect_instrument_id IS NULL) THEN
    RAISE EXCEPTION 'Collection needs both method and instrument, or neither';
  END IF;
  IF p_collect_method IS NOT NULL
     AND p_collect_method NOT IN ('cash','upi','card','wallet','credit') THEN
    RAISE EXCEPTION 'Unsupported collection method';
  END IF;
  IF p_collect_instrument_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.payment_instruments pi
      WHERE pi.id = p_collect_instrument_id AND pi.tenant_id = v_tenant
        AND pi.is_active) THEN
    RAISE EXCEPTION 'Unknown or inactive collection instrument';
  END IF;

  v_number := 'SRV-' || lpad(public.next_canonical_number('service')::text, 6, '0');
  INSERT INTO public.service_transactions
    (tenant_id, service_type, client_uuid, idempotency_key,
     transaction_number, transaction_date, amount, fee, commission,
     aadhaar_last4, bank_ref, portal_ref, aeps_txn_type,
     sender_name, sender_mobile, beneficiary_name, beneficiary_mobile,
     beneficiary_bank, beneficiary_ifsc, beneficiary_account, transfer_method,
     upi_id, merchant_qr_ref, provider_ref, receiver_number, plan_ref,
     biller_ref, consumer_number, bill_amount, recorded_by_profile)
  VALUES (
    v_tenant, p_service_type, gen_random_uuid(), nullif(btrim(p_idempotency_key), ''),
    v_number, p_transaction_date, p_amount, p_fee, p_commission,
    nullif(btrim(d->>'aadhaar_last4'), ''), nullif(btrim(d->>'bank_ref'), ''),
    nullif(btrim(d->>'portal_ref'), ''), nullif(btrim(d->>'aeps_txn_type'), ''),
    nullif(btrim(d->>'sender_name'), ''), nullif(btrim(d->>'sender_mobile'), ''),
    nullif(btrim(d->>'beneficiary_name'), ''), nullif(btrim(d->>'beneficiary_mobile'), ''),
    nullif(btrim(d->>'beneficiary_bank'), ''), nullif(btrim(d->>'beneficiary_ifsc'), ''),
    nullif(btrim(d->>'beneficiary_account'), ''),
    nullif(btrim(d->>'transfer_method'), ''),
    nullif(btrim(d->>'upi_id'), ''), nullif(btrim(d->>'merchant_qr_ref'), ''),
    nullif(btrim(d->>'provider_ref'), ''), nullif(btrim(d->>'receiver_number'), ''),
    nullif(btrim(d->>'plan_ref'), ''),
    nullif(btrim(d->>'biller_ref'), ''), nullif(btrim(d->>'consumer_number'), ''),
    CASE WHEN d ? 'bill_amount' THEN (d->>'bill_amount')::numeric END,
    (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()))
  RETURNING id INTO v_svc_id;

  -- Uniform money path: optional linked claim (recorded; recognition is a
  -- separate back-office step per G4). Journals post in G6.
  IF p_collect_method IS NOT NULL THEN
    INSERT INTO public.payment_claims
      (tenant_id, method, amount, instrument_id, recorded_by_profile,
       service_transaction_id)
    SELECT v_tenant, p_collect_method, p_amount, p_collect_instrument_id,
           p.id, v_svc_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
    RETURNING id INTO v_claim;
  END IF;

  v_resp := jsonb_build_object('id', v_svc_id, 'transaction_number', v_number,
                               'claim_id', v_claim);
  PERFORM public.idempotency_commit('record_service', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;
REVOKE ALL ON FUNCTION public.record_service_txn(text,date,numeric,numeric,numeric,jsonb,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_service_txn(text,date,numeric,numeric,numeric,jsonb,text,uuid,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 4. reverse_service_txn (back-office): mirror reversal record, linked both
--    ways. Cancel-and-recreate doctrine; originals are never edited.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_service_txn(
  p_service_id uuid, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_replay boolean; v_resp jsonb;
  v_old    record;
  v_number text;
  v_new_id uuid;
BEGIN
  IF NOT public.is_back_office() THEN
    RAISE EXCEPTION 'Back-office authorization required';
  END IF;
  v_tenant := public.current_tenant();
  SELECT * INTO v_replay, v_resp
  FROM public.idempotency_begin('reverse_service', p_idempotency_key);
  IF v_replay THEN RETURN v_resp; END IF;

  SELECT * INTO v_old FROM public.service_transactions s
  WHERE s.id = p_service_id AND s.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service transaction not found in tenant';
  END IF;
  IF v_old.status <> 'recorded' THEN
    RAISE EXCEPTION 'Only recorded transactions can be reversed (status=%)',
      v_old.status;
  END IF;

  v_number := 'SRV-' || lpad(public.next_canonical_number('service')::text, 6, '0');
  INSERT INTO public.service_transactions
    (tenant_id, service_type, client_uuid, transaction_number,
     transaction_date, amount, fee, commission, status, reverses,
     aadhaar_last4, bank_ref, portal_ref, aeps_txn_type,
     sender_name, sender_mobile, beneficiary_name, beneficiary_mobile,
     beneficiary_bank, beneficiary_ifsc, beneficiary_account, transfer_method,
     upi_id, merchant_qr_ref, provider_ref, receiver_number, plan_ref,
     biller_ref, consumer_number, bill_amount, recorded_by_profile)
  VALUES (
    v_tenant, v_old.service_type, gen_random_uuid(), v_number,
    CURRENT_DATE, v_old.amount, v_old.fee, v_old.commission,
    'reversed', v_old.id,
    v_old.aadhaar_last4, v_old.bank_ref, v_old.portal_ref, v_old.aeps_txn_type,
    v_old.sender_name, v_old.sender_mobile, v_old.beneficiary_name,
    v_old.beneficiary_mobile, v_old.beneficiary_bank, v_old.beneficiary_ifsc,
    v_old.beneficiary_account, v_old.transfer_method,
    v_old.upi_id, v_old.merchant_qr_ref, v_old.provider_ref,
    v_old.receiver_number, v_old.plan_ref,
    v_old.biller_ref, v_old.consumer_number, v_old.bill_amount,
    (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()))
  RETURNING id INTO v_new_id;

  UPDATE public.service_transactions
  SET status = 'reversed', reversed_by = v_new_id
  WHERE id = p_service_id;

  v_resp := jsonb_build_object('id', v_new_id, 'reverses', p_service_id);
  PERFORM public.idempotency_commit('reverse_service', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;
REVOKE ALL ON FUNCTION public.reverse_service_txn(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_service_txn(uuid,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 5. RLS: deny-default; operational reads scoped; all writes via RPCs
-- --------------------------------------------------------------------------
ALTER TABLE public.service_transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.service_transactions
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.service_transactions TO authenticated;
CREATE POLICY service_txn_scope_select ON public.service_transactions
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

COMMIT;
