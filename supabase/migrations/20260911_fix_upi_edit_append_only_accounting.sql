-- Fix UPI transaction edits so historical money legs remain append-only and Reconciliation sees the corrected state.
-- Also repairs the known production UPI-0016 edit (1000 -> 700) without mutating history.

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

  v_fn := replace(
    v_fn,
    $$  for r in select * from public.cash_entries where ref_type='transaction' and ref_id=p_txn_id loop
    insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id) values(coalesce(v_txn.transaction_date,current_date),r.method,case when r.direction='out' then 'in' else 'out' end,r.amount,'Reversal on edit: '||coalesce(r.description,upper(v_txn.service_type)||' '||v_txn.transaction_number),'transaction',p_txn_id,r.instrument_id);
  end loop;$$,
    $$  for r in
    select instrument_id, min(method) as method,
           round(sum(case when direction in ('in','deposit') then amount else -amount end),2) as net_amount
    from public.cash_entries
    where ref_id=p_txn_id
      and ref_type in ('transaction','transaction_correction')
      and instrument_id is not null
    group by instrument_id
    having abs(round(sum(case when direction in ('in','deposit') then amount else -amount end),2))>0.005
  loop
    insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
    values(
      coalesce(v_txn.transaction_date,current_date),
      r.method,
      case when r.net_amount>0 then 'out' else 'in' end,
      abs(r.net_amount),
      'Correction neutralization on edit: '||v_txn.transaction_number,
      'transaction_correction',
      p_txn_id,
      r.instrument_id
    );
  end loop;$$
  );

  v_fn := replace(v_fn, ',''transaction'',p_txn_id,', ',''transaction_correction'',p_txn_id,');

  EXECUTE v_fn;
END;
$do$;

DO $repair$
DECLARE
  v_txn record;
  v_cash_id uuid;
  v_old_journal uuid;
  r record;
BEGIN
  SELECT * INTO v_txn
  FROM public.transactions
  WHERE transaction_number='UPI-0016'
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'UPI-0016 not found; refusing repair'; END IF;
  IF v_txn.status <> 'success' OR round(coalesce(v_txn.amount,0),2) <> 700.00 OR round(coalesce(v_txn.cash_out,0),2) <> 690.00 THEN
    RAISE EXCEPTION 'UPI-0016 is not in expected edited state (700 / 690); refusing repair';
  END IF;

  PERFORM set_config('erp.financial_edit_in_progress','on',true);
  PERFORM set_config('erp.internal_cash_mutation_authorized','on',true);
  PERFORM pg_advisory_xact_lock(hashtextextended('erp:transaction-repair:'||v_txn.id::text,0));

  SELECT id INTO v_cash_id
  FROM public.payment_instruments
  WHERE is_active=true AND lower(type)='cash'
  ORDER BY created_at ASC
  LIMIT 1;
  IF v_cash_id IS NULL THEN RAISE EXCEPTION 'Cash instrument not found'; END IF;

  FOR r IN
    SELECT instrument_id, min(method) AS method,
           round(sum(case when direction in ('in','deposit') then amount else -amount end),2) AS net_amount
    FROM public.cash_entries
    WHERE ref_id=v_txn.id
      AND ref_type IN ('transaction','transaction_correction')
      AND instrument_id IS NOT NULL
    GROUP BY instrument_id
    HAVING abs(round(sum(case when direction in ('in','deposit') then amount else -amount end),2))>0.005
  LOOP
    INSERT INTO public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
    VALUES(
      coalesce(v_txn.transaction_date,current_date),
      r.method,
      case when r.net_amount>0 then 'out' else 'in' end,
      abs(r.net_amount),
      'Correction neutralization on repair: '||v_txn.transaction_number,
      'transaction_correction',v_txn.id,r.instrument_id
    );
  END LOOP;

  IF coalesce(v_txn.pool_credit,0)>0 AND v_txn.instrument_id IS NOT NULL THEN
    INSERT INTO public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
    VALUES(v_txn.transaction_date,'upi','in',round(v_txn.pool_credit,2),'UPI '||v_txn.transaction_number||' corrected QR receipt','transaction_correction',v_txn.id,v_txn.instrument_id);
  END IF;
  IF coalesce(v_txn.cash_in,0)>0 THEN
    INSERT INTO public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
    VALUES(v_txn.transaction_date,'cash','in',round(v_txn.cash_in,2),'UPI '||v_txn.transaction_number||' corrected cash receipt','transaction_correction',v_txn.id,v_cash_id);
  END IF;
  IF coalesce(v_txn.cash_out,0)>0 THEN
    INSERT INTO public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
    VALUES(v_txn.transaction_date,'cash','out',round(v_txn.cash_out,2),'UPI '||v_txn.transaction_number||' corrected cash payout','transaction_correction',v_txn.id,v_cash_id);
  END IF;
  IF coalesce(v_txn.upi_fee,0)>0 AND v_txn.instrument_id IS NOT NULL THEN
    INSERT INTO public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
    VALUES(v_txn.transaction_date,'upi','in',round(v_txn.upi_fee,2),'UPI '||v_txn.transaction_number||' corrected fee via UPI','transaction_correction',v_txn.id,v_txn.instrument_id);
  END IF;

  SELECT je.id INTO v_old_journal
  FROM public.journal_entries je
  WHERE je.source_id=v_txn.id
    AND je.source_type IN ('service_transaction','service_transaction_edit')
  ORDER BY je.created_at DESC,je.id DESC
  LIMIT 1;
  IF v_old_journal IS NOT NULL THEN
    PERFORM public.append_journal_mirror_reversal(v_old_journal,'service_transaction_reversal','Reversal on repair: '||v_txn.transaction_number);
  END IF;
  PERFORM public.post_service_transaction_journal_snapshot(v_txn.id,'service_transaction_edit','Corrected '||v_txn.transaction_number||' accounting');
END;
$repair$;