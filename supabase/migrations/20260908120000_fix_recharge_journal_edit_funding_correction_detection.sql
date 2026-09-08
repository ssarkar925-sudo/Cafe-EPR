-- Permanent fix for recharge edit/reconcile journals.
-- During an edit the old provider funding is neutralized with a
-- transaction_correction entry and the new provider funding is appended as
-- another transaction_correction entry. The snapshot must detect funding from
-- the funding-leg entries across BOTH transaction and transaction_correction
-- history. Counting only ref_type='transaction' makes an edit from one funding
-- account to another look like missing funding and posts the provider cost twice.

CREATE OR REPLACE FUNCTION public.post_service_transaction_journal_snapshot(
  p_txn_id uuid,
  p_source_type text,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  v_funding_expected numeric := 0;
  v_funding_out numeric := 0;
  v_funding_code text;
  r record;
BEGIN
  SELECT * INTO v_txn FROM public.transactions WHERE id = p_txn_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF lower(coalesce(v_txn.status,'')) NOT IN ('success','successful','completed','posted') THEN
    RETURN NULL;
  END IF;

  -- The cash/money trail is the primary source of truth. Include both original
  -- transaction rows and append-only correction rows so an edit replaces the
  -- old leg economically instead of making the correction invisible.
  FOR r IN
    SELECT ce.instrument_id,
           round(sum(CASE WHEN ce.direction='in' THEN ce.amount ELSE -ce.amount END),2) net
    FROM public.cash_entries ce
    WHERE ce.ref_id=p_txn_id
      AND ce.ref_type IN ('transaction','transaction_correction')
      AND ce.instrument_id IS NOT NULL
    GROUP BY ce.instrument_id
    HAVING abs(round(sum(CASE WHEN ce.direction='in' THEN ce.amount ELSE -ce.amount END),2))>0.005
  LOOP
    v_net := r.net;
    v_code := public.accounting_instrument_account_code(r.instrument_id);
    IF v_code IS NULL THEN
      RAISE EXCEPTION 'Transaction % has an unmapped money instrument',v_txn.transaction_number;
    END IF;
    IF v_net>0 THEN
      v_lines:=v_lines||jsonb_build_object('account_code',v_code,'debit',v_net,'credit',0);
      v_debit:=v_debit+v_net;
    ELSE
      v_lines:=v_lines||jsonb_build_object('account_code',v_code,'debit',0,'credit',abs(v_net));
      v_credit:=v_credit+abs(v_net);
    END IF;
  END LOOP;

  v_due:=greatest(0,coalesce(v_txn.customer_due_amount,0));
  IF v_due>0 AND v_txn.customer_id IS NOT NULL THEN
    v_lines:=v_lines||jsonb_build_object('account_code','1300','debit',round(v_due,2),'credit',0);
    v_debit:=v_debit+v_due;
  END IF;

  v_fee:=coalesce(v_txn.service_fee,0)+coalesce(v_txn.portal_charge,0);
  IF v_fee>0 THEN
    v_lines:=v_lines||jsonb_build_object('account_code','4020','debit',0,'credit',round(v_fee,2));
    v_credit:=v_credit+v_fee;
  END IF;

  v_commission:=coalesce(v_txn.portal_commission,0);

  IF lower(coalesce(v_txn.service_type,''))='recharge' AND v_txn.pay_from_instrument_id IS NOT NULL THEN
    -- Count only the provider-funding leg, not the customer-collection leg.
    -- Reconciliation edits use transaction_correction for the new funding
    -- entry, so the old transaction-only check was the source of the duplicate
    -- provider credit (e.g. 319.00 + 315.81 = 634.81).
    SELECT greatest(
      0,
      round(
        coalesce(
          sum(
            CASE
              WHEN ce.direction IN ('out','withdrawal') THEN ce.amount
              WHEN ce.direction IN ('in','deposit') THEN -ce.amount
              ELSE 0
            END
          ),
          0
        ),
        2
      )
    )
    INTO v_funding_out
    FROM public.cash_entries ce
    WHERE ce.ref_type IN ('transaction','transaction_correction')
      AND ce.ref_id=v_txn.id
      AND ce.instrument_id=v_txn.pay_from_instrument_id
      AND (
        lower(coalesce(ce.description,'')) LIKE lower('Recharge '||v_txn.transaction_number||'%funded from%')
        OR lower(coalesce(ce.description,'')) LIKE lower('Funding for '||v_txn.transaction_number||'%')
      );

    v_funding_expected:=greatest(0,round(coalesce(nullif(v_txn.pool_out,0),coalesce(v_txn.amount,0)-v_commission),2));
    IF v_funding_expected>0 AND v_funding_out < v_funding_expected-0.005 THEN
      v_funding_code:=public.accounting_instrument_account_code(v_txn.pay_from_instrument_id);
      IF v_funding_code IS NULL THEN
        SELECT public.accounting_asset_code(type) INTO v_funding_code
        FROM public.payment_instruments
        WHERE id=v_txn.pay_from_instrument_id;
      END IF;
      IF v_funding_code IS NULL THEN
        RAISE EXCEPTION 'Recharge % has no accounting mapping for funding instrument',v_txn.transaction_number;
      END IF;
      v_lines:=v_lines||jsonb_build_object(
        'account_code',v_funding_code,
        'debit',0,
        'credit',round(v_funding_expected-v_funding_out,2)
      );
      v_credit:=v_credit+round(v_funding_expected-v_funding_out,2);
    END IF;
  END IF;

  IF v_commission>0 THEN
    v_lines:=v_lines||jsonb_build_object('account_code','4030','debit',0,'credit',round(v_commission,2));
    v_credit:=v_credit+v_commission;
  END IF;

  -- Hard stop: no journal is ever allowed to cross the posting boundary
  -- unless the candidate snapshot is exactly balanced.
  IF abs(round(v_debit-v_credit,2))>0.005 THEN
    RAISE EXCEPTION 'Service transaction % produced unbalanced journal snapshot: debit %, credit %',
      v_txn.transaction_number,round(v_debit,2),round(v_credit,2);
  END IF;
  IF jsonb_array_length(v_lines)=0 THEN RETURN NULL; END IF;

  v_num:='JE-'||lpad(nextval('public.journal_entry_seq')::text,8,'0');
  INSERT INTO public.journal_entries(entry_number,entry_date,source_type,source_id,description,posted_by)
  VALUES(v_num,v_txn.transaction_date,p_source_type,p_txn_id,p_description,v_txn.created_by)
  RETURNING id INTO v_entry_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    v_no:=v_no+1;
    INSERT INTO public.journal_lines(journal_entry_id,account_id,line_no,debit,credit,description)
    SELECT v_entry_id,aa.id,v_no,
      round(coalesce((v_line->>'debit')::numeric,0),2),
      round(coalesce((v_line->>'credit')::numeric,0),2),
      v_line->>'description'
    FROM public.accounting_accounts aa
    WHERE aa.code=v_line->>'account_code' AND aa.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown accounting account %',v_line->>'account_code'; END IF;
  END LOOP;

  RETURN v_entry_id;
END;
$$;

-- Keep the journal sequence ahead of persisted entries.
SELECT setval(
  'public.journal_entry_seq',
  greatest(1, coalesce((
    SELECT max((substring(entry_number from 4))::bigint)
    FROM public.journal_entries
    WHERE entry_number ~ '^JE-[0-9]+$'
  ),0)),
  true
);
