-- 20260907_03_post_audit_financial_hardening.sql
-- Post-audit hardening only. No top-level financial DML.
-- Does not recreate or execute 20260907_02.
-- Keeps 20260907_01 untouched and independent.

BEGIN;

-- ============================================================
-- 1. Fix SECURITY DEFINER caller checks
-- ============================================================
-- SECURITY DEFINER functions execute with the owner's current_user.
-- Replace the legacy "current_user <> 'postgres'" comparison with
-- the trusted JWT role check. This preserves intended service_role
-- bypasses while forcing authenticated callers through role checks.
DO $do$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND pg_get_functiondef(p.oid) ~* 'current_user\s*<>\s*''postgres'''
  LOOP
    SELECT pg_get_functiondef(r.oid) INTO v_def;
    v_def := regexp_replace(
      v_def,
      'current_user\s*<>\s*''postgres''',
      'auth.role() <> ''service_role''',
      'gi'
    );
    EXECUTE v_def;
  END LOOP;
END
$do$;

-- These SECURITY DEFINER functions are internal mutation engines.
-- Keep them callable only by postgres/service_role.
REVOKE EXECUTE ON FUNCTION public.create_sale_internal(
  uuid,date,numeric,numeric,numeric,jsonb,jsonb,numeric,text,uuid,numeric,text,text,text,text,numeric,numeric,numeric,numeric,boolean
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.record_quick_sale_internal(
  date,numeric,numeric,uuid,uuid,uuid,text,numeric,jsonb,jsonb
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.record_invoice_payment_internal(
  uuid,text,numeric,uuid
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.post_journal_entry(
  date,text,uuid,text,jsonb,uuid
) FROM PUBLIC, anon, authenticated;

-- High-risk wrappers must never be anonymously callable.
REVOKE EXECUTE ON FUNCTION public.record_invoice_multi_payment(uuid,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_customer_multi_payment(uuid,date,jsonb,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_transaction_customer_payment_split(uuid,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_dmt_business_txn_multi_collection(
  text,date,timestamptz,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,uuid,text,text,numeric,jsonb
) FROM PUBLIC, anon;

-- ============================================================
-- 2. Protect direct transaction writes
-- ============================================================
DROP POLICY IF EXISTS "transactions insert" ON public.transactions;
DROP POLICY IF EXISTS "transactions update" ON public.transactions;

-- Client code must use the audited SECURITY DEFINER mutation RPCs.
CREATE POLICY "transactions insert denied" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "transactions update denied" ON public.transactions
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

-- Keep back-office read access intact; transaction DELETE is already
-- blocked by the existing financial-delete trigger/policy.

-- ============================================================
-- 3. Invoice accounting bridge: include real advance application
-- ============================================================
CREATE OR REPLACE FUNCTION public.post_invoice_accounting_bridge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lines jsonb := '[]'::jsonb;
  v_pay record;
  v_tax numeric;
  v_sales numeric;
  v_payment_total numeric := 0;
  v_advance_used numeric := 0;
BEGIN
  IF NEW.status NOT IN ('unpaid','partial','paid') THEN
    RETURN NEW;
  END IF;

  -- On initial INSERT the invoice has not yet received its payments/due.
  -- Wait for the subsequent UPDATE performed by the sale/payment RPC.
  SELECT coalesce(sum(p.amount),0)
    INTO v_payment_total
  FROM public.payments p
  WHERE p.invoice_id = NEW.id;

  IF coalesce(NEW.paid,0) = 0
     AND coalesce(NEW.due,0) = 0
     AND v_payment_total = 0 THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.journal_entries
    WHERE source_type = 'invoice'
      AND source_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  v_tax := coalesce(NEW.total_cgst,0)
         + coalesce(NEW.total_sgst,0)
         + coalesce(NEW.total_igst,0);

  v_sales := coalesce(
    NEW.total_taxable_value,
    NEW.total - v_tax
  );

  -- Actual tendered payments are debits to their real instruments.
  FOR v_pay IN
    SELECT p.instrument_id, sum(p.amount) AS amount
    FROM public.payments p
    WHERE p.invoice_id = NEW.id
    GROUP BY p.instrument_id
  LOOP
    IF v_pay.instrument_id IS NULL THEN
      RAISE EXCEPTION 'Invoice % has a payment without an instrument', NEW.invoice_number;
    END IF;

    IF public.accounting_instrument_account_code(v_pay.instrument_id) IS NULL THEN
      RAISE EXCEPTION 'Invoice % has an unmapped payment instrument', NEW.invoice_number;
    END IF;

    v_lines := v_lines || jsonb_build_object(
      'account_code',
      public.accounting_instrument_account_code(v_pay.instrument_id),
      'debit',
      round(v_pay.amount,2),
      'credit',
      0
    );
  END LOOP;

  -- Advance applied = invoice paid amount less actual payment rows.
  -- It is backed by a customer credit balance by the create_sale wrapper.
  v_advance_used := greatest(
    0,
    round(coalesce(NEW.paid,0) - v_payment_total, 2)
  );

  IF v_advance_used > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code','1300',
      'debit',v_advance_used,
      'credit',0,
      'description','Customer advance applied to ' || NEW.invoice_number
    );
  END IF;

  IF coalesce(NEW.due,0) > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code','1300',
      'debit',round(NEW.due,2),
      'credit',0
    );
  END IF;

  IF v_sales > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code','4000',
      'debit',0,
      'credit',round(v_sales,2)
    );
  END IF;

  IF v_tax > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code','2100',
      'debit',0,
      'credit',round(v_tax,2)
    );
  END IF;

  IF jsonb_array_length(v_lines) = 0 THEN
    RETURN NEW;
  END IF;

  PERFORM public.post_journal_entry(
    NEW.invoice_date,
    'invoice',
    NEW.id,
    'Sale ' || NEW.invoice_number,
    v_lines,
    NEW.created_by
  );

  RETURN NEW;
END;
$function$;

-- ============================================================
-- 4. Append-only journal reversal helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.append_journal_mirror_reversal(
  p_original_journal_id uuid,
  p_source_type text,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_original record;
  v_new_id uuid;
  v_num text;
  v_line record;
  v_no integer := 0;
BEGIN
  SELECT * INTO v_original
  FROM public.journal_entries
  WHERE id = p_original_journal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original journal % not found', p_original_journal_id;
  END IF;

  SELECT id INTO v_new_id
  FROM public.journal_entries
  WHERE source_type = p_source_type
    AND source_id = p_original_journal_id
  LIMIT 1;

  IF v_new_id IS NOT NULL THEN
    RETURN v_new_id;
  END IF;

  v_num := 'JE-' || lpad(nextval('public.journal_entry_seq')::text,8,'0');

  INSERT INTO public.journal_entries(
    entry_number,
    entry_date,
    source_type,
    source_id,
    description,
    posted_by
  )
  VALUES(
    v_num,
    current_date,
    p_source_type,
    p_original_journal_id,
    p_description,
    auth.uid()
  )
  RETURNING id INTO v_new_id;

  FOR v_line IN
    SELECT
      jl.account_id,
      jl.debit,
      jl.credit,
      jl.description
    FROM public.journal_lines jl
    WHERE jl.journal_entry_id = p_original_journal_id
    ORDER BY jl.line_no
  LOOP
    v_no := v_no + 1;
    INSERT INTO public.journal_lines(
      journal_entry_id,
      account_id,
      line_no,
      debit,
      credit,
      description
    )
    VALUES(
      v_new_id,
      v_line.account_id,
      v_no,
      round(coalesce(v_line.credit,0),2),
      round(coalesce(v_line.debit,0),2),
      'Reversal: ' || coalesce(v_line.description,p_description)
    );
  END LOOP;

  RETURN v_new_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.append_journal_mirror_reversal(uuid,text,text)
  FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 5. Canonical service-transaction journal snapshot
-- ============================================================
CREATE OR REPLACE FUNCTION public.post_service_transaction_journal_snapshot(
  p_txn_id uuid,
  p_source_type text,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_txn record;
  v_lines jsonb := '[]'::jsonb;
  v_net numeric;
  v_code text;
  v_due numeric;
  v_fee numeric;
  v_commission numeric;
  v_entry_id uuid;
  v_num text;
  v_line jsonb;
  v_no integer := 0;
  v_debit numeric := 0;
  v_credit numeric := 0;
BEGIN
  SELECT * INTO v_txn
  FROM public.transactions
  WHERE id = p_txn_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF lower(coalesce(v_txn.status,'')) NOT IN ('success','successful','completed','posted') THEN
    RETURN NULL;
  END IF;

  -- Rebuild the operational money legs from the immutable cash trail.
  -- Each instrument's net movement is the corresponding GL asset leg.
  v_lines := '[]'::jsonb;
  FOR v_net, v_code IN
    SELECT
      round(sum(CASE WHEN ce.direction='in' THEN ce.amount ELSE -ce.amount END),2),
      public.accounting_instrument_account_code(ce.instrument_id)
    FROM public.cash_entries ce
    WHERE ce.ref_type='transaction'
      AND ce.ref_id=p_txn_id
      AND ce.instrument_id IS NOT NULL
    GROUP BY ce.instrument_id
    HAVING abs(round(sum(CASE WHEN ce.direction='in' THEN ce.amount ELSE -ce.amount END),2)) > 0.005
  LOOP
    IF v_code IS NULL THEN
      RAISE EXCEPTION 'Transaction % has an unmapped money instrument', v_txn.transaction_number;
    END IF;

    IF v_net > 0 THEN
      v_lines := v_lines || jsonb_build_object(
        'account_code',v_code,
        'debit',v_net,
        'credit',0
      );
      v_debit := v_debit + v_net;
    ELSE
      v_lines := v_lines || jsonb_build_object(
        'account_code',v_code,
        'debit',0,
        'credit',abs(v_net)
      );
      v_credit := v_credit + abs(v_net);
    END IF;
  END LOOP;

  v_due := greatest(0,coalesce(v_txn.customer_due_amount,0));
  IF v_due > 0 AND v_txn.customer_id IS NOT NULL THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code','1300',
      'debit',v_due,
      'credit',0,
      'description','Customer due'
    );
    v_debit := v_debit + v_due;
  END IF;

  v_fee := coalesce(v_txn.service_fee,0) + coalesce(v_txn.portal_charge,0);
  IF v_fee > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code','4020',
      'debit',0,
      'credit',round(v_fee,2),
      'description','Service fee'
    );
    v_credit := v_credit + v_fee;
  END IF;

  v_commission := coalesce(v_txn.portal_commission,0);
  IF v_commission > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code','4030',
      'debit',0,
      'credit',round(v_commission,2),
      'description','Commission income'
    );
    v_credit := v_credit + v_commission;
  END IF;

  IF abs(round(v_debit-v_credit,2)) > 0.005 THEN
    RAISE EXCEPTION
      'Service transaction % produced unbalanced journal snapshot: debit %, credit %',
      v_txn.transaction_number, round(v_debit,2), round(v_credit,2);
  END IF;

  IF jsonb_array_length(v_lines) = 0 THEN
    RETURN NULL;
  END IF;

  v_num := 'JE-' || lpad(nextval('public.journal_entry_seq')::text,8,'0');

  INSERT INTO public.journal_entries(
    entry_number,
    entry_date,
    source_type,
    source_id,
    description,
    posted_by
  )
  VALUES(
    v_num,
    v_txn.transaction_date,
    p_source_type,
    p_txn_id,
    p_description,
    v_txn.created_by
  )
  RETURNING id INTO v_entry_id;

  FOR v_line IN
    SELECT value
    FROM jsonb_array_elements(v_lines)
  LOOP
    v_no := v_no + 1;
    INSERT INTO public.journal_lines(
      journal_entry_id,
      account_id,
      line_no,
      debit,
      credit,
      description
    )
    SELECT
      v_entry_id,
      aa.id,
      v_no,
      round(coalesce((v_line->>'debit')::numeric,0),2),
      round(coalesce((v_line->>'credit')::numeric,0),2),
      v_line->>'description'
    FROM public.accounting_accounts aa
    WHERE aa.code = v_line->>'account_code'
      AND aa.is_active;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unknown accounting account %', v_line->>'account_code';
    END IF;
  END LOOP;

  RETURN v_entry_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.post_service_transaction_journal_snapshot(uuid,text,text)
  FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 6. Transaction UPDATE accounting: reverse old journal + post new
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_service_transaction_edit_accounting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_journal uuid;
BEGIN
  IF OLD.status <> 'success' OR NEW.status <> 'success' THEN
    RETURN NEW;
  END IF;

  IF
       NEW.transaction_date IS NOT DISTINCT FROM OLD.transaction_date
   AND NEW.transaction_timestamp IS NOT DISTINCT FROM OLD.transaction_timestamp
   AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
   AND NEW.amount IS NOT DISTINCT FROM OLD.amount
   AND NEW.service_fee IS NOT DISTINCT FROM OLD.service_fee
   AND NEW.portal_charge IS NOT DISTINCT FROM OLD.portal_charge
   AND NEW.portal_commission IS NOT DISTINCT FROM OLD.portal_commission
   AND NEW.cash_in IS NOT DISTINCT FROM OLD.cash_in
   AND NEW.cash_out IS NOT DISTINCT FROM OLD.cash_out
   AND NEW.bank_in IS NOT DISTINCT FROM OLD.bank_in
   AND NEW.bank_out IS NOT DISTINCT FROM OLD.bank_out
   AND NEW.pool_out IS NOT DISTINCT FROM OLD.pool_out
   AND NEW.pool_credit IS NOT DISTINCT FROM OLD.pool_credit
   AND NEW.pool_credit_type IS NOT DISTINCT FROM OLD.pool_credit_type
   AND NEW.upi_fee IS NOT DISTINCT FROM OLD.upi_fee
   AND NEW.pay_from_instrument_id IS NOT DISTINCT FROM OLD.pay_from_instrument_id
   AND NEW.pay_from_method IS NOT DISTINCT FROM OLD.pay_from_method
   AND NEW.customer_pay_method IS NOT DISTINCT FROM OLD.customer_pay_method
   AND NEW.paid_from IS NOT DISTINCT FROM OLD.paid_from
   AND NEW.fee_source IS NOT DISTINCT FROM OLD.fee_source
   AND NEW.provider_id IS NOT DISTINCT FROM OLD.provider_id
   AND NEW.bank_id IS NOT DISTINCT FROM OLD.bank_id
   AND NEW.portal_id IS NOT DISTINCT FROM OLD.portal_id
   AND NEW.merchant_qr_id IS NOT DISTINCT FROM OLD.merchant_qr_id
  THEN
    RETURN NEW;
  END IF;

  SELECT je.id
  INTO v_old_journal
  FROM public.journal_entries je
  WHERE je.source_type IN ('service_transaction','service_transaction_edit')
    AND je.source_id = NEW.id
  ORDER BY je.created_at DESC, je.id DESC
  LIMIT 1;

  IF v_old_journal IS NOT NULL THEN
    PERFORM public.append_journal_mirror_reversal(
      v_old_journal,
      'service_transaction_reversal',
      'Reversal of service transaction journal for edit ' || NEW.transaction_number
    );
  END IF;

  PERFORM public.post_service_transaction_journal_snapshot(
    NEW.id,
    'service_transaction_edit',
    'Edited service transaction ' || NEW.transaction_number
  );

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_service_transaction_edit_accounting() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_service_transaction_edit_accounting ON public.transactions;

CREATE TRIGGER trg_service_transaction_edit_accounting
AFTER UPDATE OF
  transaction_date,
  transaction_timestamp,
  customer_id,
  amount,
  service_fee,
  portal_charge,
  portal_commission,
  cash_in,
  cash_out,
  bank_in,
  bank_out,
  pool_out,
  pool_credit,
  pool_credit_type,
  upi_fee,
  pay_from_instrument_id,
  pay_from_method,
  customer_pay_method,
  paid_from,
  fee_source,
  provider_id,
  bank_id,
  portal_id,
  merchant_qr_id
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.trg_service_transaction_edit_accounting();

-- ============================================================
-- 7. Make successful transaction financial fields immutable
--    outside an authorized SECURITY DEFINER function.
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_block_posted_transaction_financial_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'success' AND current_user <> 'postgres' AND auth.role() <> 'service_role' THEN
    IF
         NEW.status IS DISTINCT FROM OLD.status
      OR NEW.transaction_date IS DISTINCT FROM OLD.transaction_date
      OR NEW.transaction_timestamp IS DISTINCT FROM OLD.transaction_timestamp
      OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.service_fee IS DISTINCT FROM OLD.service_fee
      OR NEW.portal_charge IS DISTINCT FROM OLD.portal_charge
      OR NEW.portal_commission IS DISTINCT FROM OLD.portal_commission
      OR NEW.cash_in IS DISTINCT FROM OLD.cash_in
      OR NEW.cash_out IS DISTINCT FROM OLD.cash_out
      OR NEW.bank_in IS DISTINCT FROM OLD.bank_in
      OR NEW.bank_out IS DISTINCT FROM OLD.bank_out
      OR NEW.pool_out IS DISTINCT FROM OLD.pool_out
      OR NEW.pool_credit IS DISTINCT FROM OLD.pool_credit
      OR NEW.pool_credit_type IS DISTINCT FROM OLD.pool_credit_type
      OR NEW.upi_fee IS DISTINCT FROM OLD.upi_fee
      OR NEW.pay_from_instrument_id IS DISTINCT FROM OLD.pay_from_instrument_id
      OR NEW.pay_from_method IS DISTINCT FROM OLD.pay_from_method
      OR NEW.customer_pay_method IS DISTINCT FROM OLD.customer_pay_method
      OR NEW.paid_from IS DISTINCT FROM OLD.paid_from
      OR NEW.fee_source IS DISTINCT FROM OLD.fee_source
      OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
      OR NEW.bank_id IS DISTINCT FROM OLD.bank_id
      OR NEW.portal_id IS DISTINCT FROM OLD.portal_id
      OR NEW.merchant_qr_id IS DISTINCT FROM OLD.merchant_qr_id
    THEN
      RAISE EXCEPTION
        'Posted successful transaction financial fields are immutable. Use the audited reversal/correction workflow.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================
-- 8. Secure create_sale + enforce backed customer advance
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_sale(
  p_customer_id uuid,
  p_invoice_date date,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_payments jsonb,
  p_items jsonb,
  p_previous_due numeric DEFAULT 0,
  p_previous_due_method text DEFAULT 'cash',
  p_previous_due_instrument_id uuid DEFAULT NULL,
  p_advance_used numeric DEFAULT 0,
  p_place_of_supply text DEFAULT NULL,
  p_supply_type text DEFAULT 'intra_state',
  p_customer_gstin text DEFAULT NULL,
  p_b2b_or_b2c text DEFAULT 'B2C_SMALL',
  p_total_taxable_value numeric DEFAULT NULL,
  p_total_cgst numeric DEFAULT 0,
  p_total_sgst numeric DEFAULT 0,
  p_total_igst numeric DEFAULT 0,
  p_is_reverse_charge boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_prev_balance numeric;
  v_advance numeric := round(coalesce(p_advance_used,0),2);
  v_ledger_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF NOT public.is_back_office() THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  IF coalesce(p_previous_due,0) < 0 THEN
    RAISE EXCEPTION 'Previous due cannot be negative';
  END IF;
  IF coalesce(p_previous_due,0) > 0 AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required for previous due collection';
  END IF;
  IF v_advance < 0 THEN
    RAISE EXCEPTION 'Advance used cannot be negative';
  END IF;

  IF v_advance > 0 THEN
    IF p_customer_id IS NULL THEN
      RAISE EXCEPTION 'Customer is required when using an advance';
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended('erp:customer:' || p_customer_id::text,0)
    );

    SELECT coalesce(balance,0)
      INTO v_prev_balance
    FROM public.customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Customer not found';
    END IF;

    IF v_prev_balance >= -0.005 THEN
      RAISE EXCEPTION 'Customer has no available advance';
    END IF;

    IF v_advance > abs(least(v_prev_balance,0)) + 0.005 THEN
      RAISE EXCEPTION
        'Advance used (%) exceeds available customer advance (%)',
        v_advance,
        abs(least(v_prev_balance,0));
    END IF;
  END IF;

  v_result := public.create_sale_internal(
    p_customer_id,
    p_invoice_date,
    p_subtotal,
    p_discount,
    p_total,
    p_payments,
    p_items,
    p_previous_due,
    p_previous_due_method,
    p_previous_due_instrument_id,
    v_advance,
    p_place_of_supply,
    p_supply_type,
    p_customer_gstin,
    p_b2b_or_b2c,
    p_total_taxable_value,
    p_total_cgst,
    p_total_sgst,
    p_total_igst,
    p_is_reverse_charge
  );

  -- create_sale_internal historically added advance to invoice paid but did
  -- not consume the customer's stored credit. Do that atomically now.
  IF v_advance > 0 THEN
    UPDATE public.customers
    SET balance = round(coalesce(balance,0) + v_advance,2),
        updated_at = now()
    WHERE id = p_customer_id
      AND coalesce(balance,0) <= -v_advance + 0.005;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Customer advance changed during sale; transaction rolled back';
    END IF;

    INSERT INTO public.customer_ledger(
      customer_id,
      entry_date,
      type,
      description,
      debit,
      credit,
      balance_after,
      ref_id
    )
    VALUES(
      p_customer_id,
      coalesce(p_invoice_date,current_date),
      'advance',
      'Advance applied to ' || coalesce(v_result->>'invoice_number','POS sale'),
      v_advance,
      0,
      (SELECT balance FROM public.customers WHERE id=p_customer_id),
      (v_result->>'invoice_id')::uuid
    )
    RETURNING id INTO v_ledger_id;
  END IF;

  IF coalesce(p_previous_due,0) > 0 THEN
    PERFORM public.apply_previous_due_collection(
      p_customer_id,
      p_previous_due,
      p_previous_due_method,
      p_previous_due_instrument_id,
      (v_result ->> 'invoice_id')::uuid,
      v_result ->> 'invoice_number',
      p_invoice_date,
      coalesce((v_result ->> 'due')::numeric,0)
    );
  END IF;

  RETURN v_result || jsonb_build_object(
    'previous_due_collected', coalesce(p_previous_due,0),
    'advance_used', v_advance,
    'customer_balance_due_after_sale', coalesce((v_result ->> 'due')::numeric,0)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_sale(
  uuid,date,numeric,numeric,numeric,jsonb,jsonb,numeric,text,uuid,numeric,text,text,text,text,numeric,numeric,numeric,numeric,boolean
) TO authenticated, service_role;

-- ============================================================
-- 9. Correct advance receipt/return GL for future transactions
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_advance(
  p_customer_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_note text DEFAULT NULL,
  p_method text DEFAULT 'cash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_amount numeric := round(coalesce(p_amount,0),2);
  v_method text := lower(coalesce(nullif(btrim(p_method),''),'cash'));
  v_balance numeric;
  v_name text;
  v_ledger_id uuid;
  v_journal_id uuid;
  v_code text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT public.is_back_office() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  END IF;

  IF p_customer_id IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Customer and positive amount are required';
  END IF;

  IF v_method NOT IN ('cash','upi','card','bank','wallet','debit_card','credit_card') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('erp:customer:'||p_customer_id::text,0)
  );

  SELECT coalesce(balance,0), name
    INTO v_balance, v_name
  FROM public.customers
  WHERE id=p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  UPDATE public.customers
  SET balance=round(coalesce(balance,0)-v_amount,2),
      updated_at=now()
  WHERE id=p_customer_id
  RETURNING balance INTO v_balance;

  INSERT INTO public.customer_ledger(
    customer_id,entry_date,type,description,debit,credit,balance_after
  )
  VALUES(
    p_customer_id,
    coalesce(p_entry_date,current_date),
    'advance',
    coalesce(p_note,'Advance received'),
    0,
    v_amount,
    v_balance
  )
  RETURNING id INTO v_ledger_id;

  INSERT INTO public.cash_entries(
    entry_date,method,direction,amount,description,ref_type,ref_id
  )
  VALUES(
    coalesce(p_entry_date,current_date),
    v_method,
    'in',
    v_amount,
    'Advance received from '||v_name,
    'customer_advance',
    p_customer_id
  );

  v_code := public.accounting_asset_code(v_method);

  v_journal_id := public.post_journal_entry(
    coalesce(p_entry_date,current_date),
    'customer_advance',
    v_ledger_id,
    'Advance received from '||v_name,
    jsonb_build_array(
      jsonb_build_object('account_code',v_code,'debit',v_amount,'credit',0),
      jsonb_build_object('account_code','1300','debit',0,'credit',v_amount)
    ),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'ok',true,
    'balance',v_balance,
    'ledger_id',v_ledger_id,
    'journal_id',v_journal_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.return_advance(
  p_customer_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_note text DEFAULT NULL,
  p_method text DEFAULT 'cash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_amount numeric := round(coalesce(p_amount,0),2);
  v_method text := lower(coalesce(nullif(btrim(p_method),''),'cash'));
  v_balance numeric;
  v_name text;
  v_ledger_id uuid;
  v_journal_id uuid;
  v_code text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT public.is_back_office() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  END IF;

  IF p_customer_id IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Customer and positive amount are required';
  END IF;

  IF v_method NOT IN ('cash','upi','card','bank','wallet','debit_card','credit_card') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('erp:customer:'||p_customer_id::text,0)
  );

  SELECT coalesce(balance,0), name
    INTO v_balance, v_name
  FROM public.customers
  WHERE id=p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  IF v_balance > -v_amount + 0.005 THEN
    RAISE EXCEPTION 'Return exceeds available customer advance';
  END IF;

  UPDATE public.customers
  SET balance=round(coalesce(balance,0)+v_amount,2),
      updated_at=now()
  WHERE id=p_customer_id
  RETURNING balance INTO v_balance;

  INSERT INTO public.customer_ledger(
    customer_id,entry_date,type,description,debit,credit,balance_after
  )
  VALUES(
    p_customer_id,
    coalesce(p_entry_date,current_date),
    'advance',
    coalesce(p_note,'Advance returned'),
    v_amount,
    0,
    v_balance
  )
  RETURNING id INTO v_ledger_id;

  INSERT INTO public.cash_entries(
    entry_date,method,direction,amount,description,ref_type,ref_id
  )
  VALUES(
    coalesce(p_entry_date,current_date),
    v_method,
    'out',
    v_amount,
    'Advance returned to '||v_name,
    'customer_advance_return',
    p_customer_id
  );

  v_code := public.accounting_asset_code(v_method);

  v_journal_id := public.post_journal_entry(
    coalesce(p_entry_date,current_date),
    'customer_advance_return',
    v_ledger_id,
    'Advance returned to '||v_name,
    jsonb_build_array(
      jsonb_build_object('account_code','1300','debit',v_amount,'credit',0),
      jsonb_build_object('account_code',v_code,'debit',0,'credit',v_amount)
    ),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'ok',true,
    'balance',v_balance,
    'ledger_id',v_ledger_id,
    'journal_id',v_journal_id
  );
END;
$function$;

-- ============================================================
-- 10. Secure reporting and correct credit-card semantics
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_pool_balances(
  p_as_of date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_credit_limit numeric := 0;
  v_used_credit numeric := 0;
  v_available_credit numeric := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT public.is_back_office() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  END IF;

  v_result := public.get_pool_balances_internal(p_as_of);

  SELECT
    coalesce(sum(coalesce((pi.details->>'credit_limit')::numeric,0)),0),
    coalesce(sum(coalesce((pi.details->>'used_limit')::numeric,0)),0)
  INTO v_credit_limit, v_used_credit
  FROM public.payment_instruments pi
  WHERE pi.is_active
    AND lower(pi.type)='credit_card';

  v_available_credit := greatest(0, v_credit_limit-v_used_credit);

  v_result := jsonb_set(
    v_result,
    '{credit_card}',
    jsonb_build_object(
      'opening',
      coalesce((v_result->'credit_card'->>'opening')::numeric,0),
      'movements',
      coalesce((v_result->'credit_card'->>'movements')::numeric,0),
      'credit_limit',
      v_credit_limit,
      'used_credit',
      v_used_credit,
      'available_credit',
      v_available_credit,
      'current',
      v_available_credit,
      'seed_date',
      v_result->'credit_card'->'seed_date'
    ),
    true
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_financial_integrity_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_mismatch bigint := 0;
  v_customer_unseeded bigint := 0;
  v_unbalanced_journals bigint := 0;
  v_orphan_invoice_journals bigint := 0;
  v_orphan_service_journals bigint := 0;
  v_cancelled_unreversed_invoices bigint := 0;
  v_service_current_journal_missing bigint := 0;
  v_pnl_gl jsonb := '{}'::jsonb;
  v_pool jsonb := '{}'::jsonb;
  v_healthy boolean;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT public.is_back_office() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  END IF;

  SELECT
    count(*) FILTER (WHERE status='mismatch'),
    count(*) FILTER (WHERE status='unseeded' AND abs(stored_balance) > 0.01)
  INTO v_customer_mismatch, v_customer_unseeded
  FROM public.get_customer_ledger_reconciliation(NULL);

  SELECT count(*)
  INTO v_unbalanced_journals
  FROM (
    SELECT je.id
    FROM public.journal_entries je
    JOIN public.journal_lines jl ON jl.journal_entry_id=je.id
    WHERE je.status='posted'
    GROUP BY je.id
    HAVING abs(sum(coalesce(jl.debit,0))-sum(coalesce(jl.credit,0))) > 0.01
  ) x;

  SELECT count(*)
  INTO v_orphan_invoice_journals
  FROM public.journal_entries je
  LEFT JOIN public.invoices i ON i.id=je.source_id
  LEFT JOIN public.journal_source_corrections jsc ON jsc.journal_entry_id=je.id
  WHERE je.status='posted'
    AND je.source_type='invoice'
    AND i.id IS NULL
    AND jsc.id IS NULL;

  SELECT count(*)
  INTO v_orphan_service_journals
  FROM public.journal_entries je
  LEFT JOIN public.transactions t ON t.id=je.source_id
  LEFT JOIN public.journal_source_corrections jsc ON jsc.journal_entry_id=je.id
  WHERE je.status='posted'
    AND je.source_type='service_transaction'
    AND t.id IS NULL
    AND jsc.id IS NULL;

  SELECT count(*)
  INTO v_cancelled_unreversed_invoices
  FROM public.invoices i
  JOIN public.journal_entries je
    ON je.source_type='invoice'
   AND je.source_id=i.id
   AND je.status='posted'
  WHERE i.status='cancelled'
    AND NOT EXISTS (
      SELECT 1
      FROM public.journal_entries r
      WHERE r.source_type='invoice_cancellation_reversal'
        AND r.source_id=je.id
        AND r.status='posted'
    );

  SELECT count(*)
  INTO v_service_current_journal_missing
  FROM public.transactions t
  WHERE t.status='success'
    AND lower(coalesce(t.service_type,'')) IN ('aeps','dmt','upi','recharge','bill_payment','mobile_recharge','dth','utility','google_play','bbps')
    AND NOT EXISTS (
      SELECT 1
      FROM public.journal_entries je
      WHERE je.status='posted'
        AND je.source_type IN ('service_transaction','service_transaction_edit')
        AND je.source_id=t.id
    );

  BEGIN
    v_pnl_gl := public.get_pnl_gl_reconciliation(date '1900-01-01', date '2999-12-31');
  EXCEPTION WHEN OTHERS THEN
    v_pnl_gl := jsonb_build_object('status','error','message',SQLERRM);
  END;

  v_pool := public.get_pool_balances(current_date);

  v_healthy :=
       v_customer_mismatch = 0
   AND v_customer_unseeded = 0
   AND v_unbalanced_journals = 0
   AND v_orphan_invoice_journals = 0
   AND v_orphan_service_journals = 0
   AND v_cancelled_unreversed_invoices = 0
   AND v_service_current_journal_missing = 0
   AND coalesce(v_pnl_gl->>'status','mismatch') = 'ok';

  RETURN jsonb_build_object(
    'customers',
      jsonb_build_object(
        'mismatches',v_customer_mismatch,
        'unseeded_nonzero',v_customer_unseeded
      ),
    'journals',
      jsonb_build_object(
        'unbalanced_posted',v_unbalanced_journals,
        'orphan_posted_invoice_journals',v_orphan_invoice_journals,
        'orphan_posted_service_journals',v_orphan_service_journals,
        'cancelled_invoices_without_reversal',v_cancelled_unreversed_invoices,
        'service_transactions_without_current_journal',v_service_current_journal_missing
      ),
    'pnl_gl',v_pnl_gl,
    'pool_balances',v_pool,
    'healthy',v_healthy
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_pool_balances(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_financial_integrity_snapshot() TO authenticated, service_role;

-- ============================================================
-- 11. Fix invoice cancellation: append GL reversal
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_invoice(
  p_invoice_id uuid,
  p_reason text DEFAULT 'Cancelled by Administrator'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv record;
  v_item record;
  v_due numeric;
  v_original_journal uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Admin can cancel/void invoices';
  END IF;

  PERFORM set_config('erp.internal_stock_mutation_authorized','on',true);
  PERFORM pg_advisory_xact_lock(hashtextextended('erp:invoice:'||p_invoice_id::text,0));

  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id=p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.status='cancelled' THEN RAISE EXCEPTION 'Invoice already cancelled'; END IF;
  IF v_inv.status='returned' OR coalesce(v_inv.returned,0)>0 THEN
    RAISE EXCEPTION 'Cannot cancel an invoice that has sales returns; use the return/reversal workflow';
  END IF;

  SELECT je.id INTO v_original_journal
  FROM public.journal_entries je
  WHERE je.source_type='invoice'
    AND je.source_id=p_invoice_id
    AND je.status='posted'
  ORDER BY je.created_at DESC
  LIMIT 1;

  FOR v_item IN
    SELECT *
    FROM public.invoice_items
    WHERE invoice_id=p_invoice_id
  LOOP
    IF v_item.product_id IS NOT NULL THEN
      UPDATE public.products
      SET stock_qty=stock_qty+v_item.qty,
          updated_at=now()
      WHERE id=v_item.product_id;
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT *
    FROM public.cash_entries
    WHERE ref_type='invoice'
      AND ref_id=p_invoice_id
      AND direction='in'
  LOOP
    IF v_item.instrument_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(
        hashtextextended('erp:financial-instrument:'||v_item.instrument_id::text,0)
      );
    END IF;

    INSERT INTO public.cash_entries(
      entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id
    )
    VALUES(
      current_date,
      v_item.method,
      'out',
      v_item.amount,
      'Invoice '||v_inv.invoice_number||' Cancelled: payment reversal',
      'invoice',
      p_invoice_id,
      v_item.instrument_id
    );
  END LOOP;

  v_due:=greatest(0,coalesce(v_inv.due,0));

  IF v_due>0 AND v_inv.customer_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('erp:customer:'||v_inv.customer_id::text,0)
    );

    UPDATE public.customers
    SET balance=balance-v_due,
        updated_at=now()
    WHERE id=v_inv.customer_id;

    INSERT INTO public.customer_ledger(
      customer_id,entry_date,type,description,credit,debit,balance_after,ref_id
    )
    VALUES(
      v_inv.customer_id,
      current_date,
      'return',
      'Invoice '||v_inv.invoice_number||' Voided: '||coalesce(p_reason,'Admin Cancel'),
      v_due,
      0,
      (SELECT balance FROM public.customers WHERE id=v_inv.customer_id),
      p_invoice_id
    );
  END IF;

  UPDATE public.invoices
  SET status='cancelled',
      paid=0,
      due=0
  WHERE id=p_invoice_id;

  IF v_original_journal IS NOT NULL THEN
    PERFORM public.append_journal_mirror_reversal(
      v_original_journal,
      'invoice_cancellation_reversal',
      'Reversal of cancelled invoice '||v_inv.invoice_number
    );
  END IF;

  INSERT INTO public.audit_logs(
    user_id,action,entity,entity_id,description,details
  )
  VALUES(
    auth.uid(),
    'cancel',
    'invoices',
    p_invoice_id::text,
    'Invoice '||v_inv.invoice_number||' cancelled ('||v_inv.total||')',
    jsonb_build_object(
      'reason',p_reason,
      'total',v_inv.total,
      'original_journal_id',v_original_journal
    )
  );

  RETURN jsonb_build_object(
    'status','success',
    'invoice_id',p_invoice_id,
    'invoice_number',v_inv.invoice_number
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cancel_invoice(uuid,text) TO authenticated, service_role;

-- ============================================================
-- 12. Historical correction helper for the verified RCH-0006 case
-- ============================================================
CREATE OR REPLACE FUNCTION public.correct_verified_recharge_funding(
  p_txn_id uuid,
  p_bad_cash_entry_id uuid,
  p_note text DEFAULT 'Verified funding-source correction'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_txn record;
  v_bad record;
  v_old_journal uuid;
  v_new_journal uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required'; END IF;
  END IF;

  SELECT * INTO v_txn
  FROM public.transactions
  WHERE id=p_txn_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  SELECT * INTO v_bad
  FROM public.cash_entries
  WHERE id=p_bad_cash_entry_id
    AND ref_type='transaction'
    AND ref_id=p_txn_id
    AND direction='out'
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Target cash entry not found'; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payment_instruments
    WHERE id=v_txn.pay_from_instrument_id
      AND is_active
  ) THEN
    RAISE EXCEPTION 'Transaction funding instrument is missing/inactive';
  END IF;

  SELECT je.id INTO v_old_journal
  FROM public.journal_entries je
  WHERE je.source_type IN ('service_transaction','service_transaction_edit')
    AND je.source_id=p_txn_id
  ORDER BY je.created_at DESC
  LIMIT 1;

  -- Reverse the erroneous cash leg; do not delete or overwrite it.
  INSERT INTO public.cash_entries(
    entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id
  )
  VALUES(
    current_date,
    v_bad.method,
    'in',
    v_bad.amount,
    'Correction reversal: '||coalesce(v_bad.description,p_note),
    'transaction',
    p_txn_id,
    v_bad.instrument_id
  );

  IF v_old_journal IS NOT NULL THEN
    PERFORM public.append_journal_mirror_reversal(
      v_old_journal,
      'service_transaction_reversal',
      'Correction reversal for '||v_txn.transaction_number||' funding source'
    );
  END IF;

  v_new_journal := public.post_service_transaction_journal_snapshot(
    p_txn_id,
    'service_transaction_edit',
    'Verified funding-source correction '||v_txn.transaction_number
  );

  INSERT INTO public.audit_logs(
    user_id,user_name,action,entity,entity_id,description,details
  )
  VALUES(
    auth.uid(),
    NULL,
    'financial_correction',
    'transactions',
    p_txn_id::text,
    p_note,
    jsonb_build_object(
      'bad_cash_entry_id',p_bad_cash_entry_id,
      'old_journal_id',v_old_journal,
      'new_journal_id',v_new_journal
    )
  );

  RETURN jsonb_build_object(
    'ok',true,
    'transaction_id',p_txn_id,
    'reversed_cash_entry_id',p_bad_cash_entry_id,
    'new_journal_id',v_new_journal
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.correct_verified_recharge_funding(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 13. Existing financial RPCs stay authenticated/back-office
-- ============================================================
GRANT EXECUTE ON FUNCTION public.record_invoice_multi_payment(uuid,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_customer_multi_payment(uuid,date,jsonb,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_transaction_customer_payment_split(uuid,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_dmt_business_txn_multi_collection(
  text,date,timestamptz,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,uuid,text,text,numeric,jsonb
) TO authenticated, service_role;

COMMIT;
