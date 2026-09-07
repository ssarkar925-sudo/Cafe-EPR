-- 20260907_04_post_audit_trigger_followup.sql
-- Tightens the posted-transaction update guard and marks legitimate internal
-- transaction-updates explicitly. No historical row mutations.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.adjust_customer_ledger(
  uuid,date,text,text,numeric,text,text,uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_customer_ledger(
  uuid,date,text,text,numeric,text,text,uuid
) TO authenticated, service_role;

DO $do$
DECLARE
  r record;
  v_def text;
  v_pos integer;
  v_flag text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.prosecdef
      AND p.proname IN (
        'update_recharge',
        'edit_bill_payment',
        'update_business_txn',
        'reverse_business_txn',
        'delete_business_txn',
        'create_dmt_business_txn',
        'apply_transaction_customer_payment_split'
      )
      AND lower(pg_get_functiondef(p.oid)) LIKE '%update public.transactions%'
  LOOP
    v_flag := CASE
      WHEN r.proname='reverse_business_txn' OR r.proname='delete_business_txn'
        THEN 'erp.skip_financial_update_audit'
      ELSE 'erp.financial_edit_in_progress'
    END;

    SELECT pg_get_functiondef(r.oid) INTO v_def;
    v_pos := position(E'\nBEGIN' IN upper(v_def));

    IF v_pos = 0 THEN
      v_pos := position('BEGIN' IN upper(v_def));
      IF v_pos = 0 THEN
        RAISE EXCEPTION 'Could not locate BEGIN in %', r.oid::regprocedure;
      END IF;
      v_def := substr(v_def,1,v_pos+5)
        || E'\n  PERFORM set_config(''' || v_flag || ''',''on'',true);'
        || substr(v_def,v_pos+6);
    ELSE
      v_def := substr(v_def,1,v_pos+5)
        || E'\n  PERFORM set_config(''' || v_flag || ''',''on'',true);'
        || substr(v_def,v_pos+6);
    END IF;

    EXECUTE v_def;
  END LOOP;
END
$do$;

DO $do$
DECLARE
  r record;
  v_def text;
  v_pos integer;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname='sync_service_transaction_money_legs'
  LOOP
    SELECT pg_get_functiondef(r.oid) INTO v_def;
    v_pos := position(E'\nBEGIN' IN upper(v_def));
    IF v_pos = 0 THEN
      v_pos := position('BEGIN' IN upper(v_def));
    END IF;
    IF v_pos = 0 THEN
      RAISE EXCEPTION 'Could not locate BEGIN in %', r.oid::regprocedure;
    END IF;

    v_def := substr(v_def,1,v_pos+5)
      || E'\n  PERFORM set_config(''erp.skip_financial_update_audit'',''on'',true);'
      || substr(v_def,v_pos+6);

    EXECUTE v_def;
  END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION public.trg_block_posted_transaction_financial_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('erp.skip_financial_update_audit', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.status='success'
     AND NEW.status='success'
     AND auth.role() <> 'service_role'
     AND current_setting('erp.financial_edit_in_progress', true) <> 'on'
  THEN
    IF
         NEW.transaction_date IS DISTINCT FROM OLD.transaction_date
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
        USING ERRCODE='42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
