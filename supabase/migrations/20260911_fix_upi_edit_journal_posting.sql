-- Ensure update_business_txn explicitly reverses the prior service journal and posts a current snapshot.
-- The financial edit guard intentionally suppresses the UPDATE trigger, so journal correction must be explicit.

DO $do$
DECLARE
  v_fn text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_fn
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='update_business_txn'
    AND pg_get_function_identity_arguments(p.oid) = 'p_txn_id uuid, p_transaction_date date, p_transaction_timestamp timestamp with time zone, p_customer_id uuid, p_customer_mobile text, p_reference text, p_remarks text, p_bank_id uuid, p_portal_id uuid, p_merchant_qr_id uuid, p_aadhaar_last4 text, p_transfer_method text, p_sender_name text, p_sender_mobile text, p_beneficiary_name text, p_beneficiary_mobile text, p_beneficiary_bank text, p_beneficiary_ifsc text, p_beneficiary_account text, p_upi_id text, p_amount numeric, p_service_fee numeric, p_portal_commission numeric, p_fee_source text, p_paid_from text, p_customer_pay_method text, p_pay_from_instrument_id uuid, p_pay_from_method text, p_receiver_name text';
  IF v_fn IS NULL THEN RAISE EXCEPTION 'Canonical update_business_txn function not found'; END IF;
  IF position('v_old_journal uuid' in v_fn)=0 THEN
    v_fn := replace(v_fn,'v_prev_balance numeric := 0; v_new_balance numeric := 0; r record;','v_prev_balance numeric := 0; v_new_balance numeric := 0; v_old_journal uuid; r record;');
  END IF;
  v_fn := replace(
    v_fn,
    '  return (select to_jsonb(t.*) from public.transactions t where t.id=p_txn_id);',
    $patch$
  select je.id into v_old_journal
  from public.journal_entries je
  where je.source_id=p_txn_id
    and je.source_type in ('service_transaction','service_transaction_edit')
  order by je.created_at desc,je.id desc
  limit 1;

  if v_old_journal is not null then
    perform public.append_journal_mirror_reversal(
      v_old_journal,
      'service_transaction_reversal',
      'Reversal on edit: '||coalesce(v_txn.transaction_number,p_txn_id::text)
    );
  end if;

  perform public.post_service_transaction_journal_snapshot(
    p_txn_id,
    'service_transaction_edit',
    'Corrected '||coalesce(v_txn.service_type,'service')||' '||coalesce(v_txn.transaction_number,p_txn_id::text)
  );

  return (select to_jsonb(t.*) from public.transactions t where t.id=p_txn_id);$patch$
  );
  EXECUTE v_fn;
END;
$do$;