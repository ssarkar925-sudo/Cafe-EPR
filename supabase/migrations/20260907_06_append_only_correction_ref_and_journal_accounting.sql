-- 20260907_06_append_only_correction_ref_and_journal_accounting.sql
-- Permits append-only historical correction legs without colliding with the
-- legacy one-leg-per-transaction uniqueness constraint.

BEGIN;

-- Correction entries are operational money legs, not generic suspense.
-- The cash-entry journal trigger must therefore leave them to the canonical
-- transaction accounting bridge.
CREATE OR REPLACE FUNCTION public.trg_post_cash_entry_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_asset text; v_dr text; v_cr text; v_desc text; v_source uuid; v_amount numeric;
BEGIN
  IF NEW.amount <= 0 THEN RETURN NEW; END IF;
  IF NEW.ref_type IN ('invoice','purchase','quick_sale','expense','transaction','transaction_correction','settlement') THEN RETURN NEW; END IF;
  IF NEW.instrument_id IS NOT NULL THEN v_asset:=public.accounting_instrument_account_code(NEW.instrument_id); END IF;
  IF v_asset IS NULL THEN v_asset:=public.accounting_asset_code(NEW.method); END IF;
  v_amount:=round(NEW.amount,2); v_source:=NEW.id;
  IF NEW.direction='in' THEN
    v_dr:=v_asset;
    v_cr:=CASE WHEN NEW.ref_type IN ('customer_payment','due_collection') THEN '1300' WHEN NEW.ref_type='return' THEN '5100' WHEN NEW.ref_type='purchase_return' THEN '2000' WHEN NEW.ref_type='day_close' THEN '3000' WHEN NEW.ref_type IN ('capital','owner_equity') THEN '3000' WHEN NEW.ref_type IN ('cash_variance','cash_overage') THEN '5210' ELSE '1400' END;
  ELSE
    v_cr:=v_asset;
    v_dr:=CASE WHEN NEW.ref_type IN ('supplier_payment','purchase_payment') THEN '2000' WHEN NEW.ref_type IN ('customer_payment','due_collection') THEN '1300' WHEN NEW.ref_type='return' THEN '5100' WHEN NEW.ref_type='purchase_return' THEN '2000' WHEN NEW.ref_type='day_close' THEN '3000' WHEN NEW.ref_type IN ('capital','owner_equity') THEN '3000' WHEN NEW.ref_type IN ('cash_variance','cash_shortage') THEN '5210' ELSE '1400' END;
  END IF;
  v_desc:=coalesce(NEW.description,'Cash movement');
  PERFORM public.post_journal_entry(NEW.entry_date,'cash_entry',v_source,v_desc,jsonb_build_array(jsonb_build_object('account_code',v_dr,'debit',v_amount,'credit',0),jsonb_build_object('account_code',v_cr,'debit',0,'credit',v_amount)),null);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_service_transaction_journal_snapshot(p_txn_id uuid,p_source_type text,p_description text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_txn record; v_lines jsonb:='[]'::jsonb; v_net numeric; v_code text; v_due numeric; v_fee numeric; v_commission numeric; v_entry_id uuid; v_num text; v_line jsonb; v_no integer:=0; v_debit numeric:=0; v_credit numeric:=0;
BEGIN
  SELECT * INTO v_txn FROM public.transactions WHERE id=p_txn_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF lower(coalesce(v_txn.status,'')) NOT IN ('success','successful','completed','posted') THEN RETURN NULL; END IF;

  FOR v_net,v_code IN
    SELECT round(sum(CASE WHEN ce.direction='in' THEN ce.amount ELSE -ce.amount END),2),public.accounting_instrument_account_code(ce.instrument_id)
    FROM public.cash_entries ce
    WHERE ce.ref_id=p_txn_id AND ce.ref_type IN ('transaction','transaction_correction') AND ce.instrument_id IS NOT NULL
    GROUP BY ce.instrument_id
    HAVING abs(round(sum(CASE WHEN ce.direction='in' THEN ce.amount ELSE -ce.amount END),2))>0.005
  LOOP
    IF v_code IS NULL THEN RAISE EXCEPTION 'Transaction % has an unmapped money instrument',v_txn.transaction_number; END IF;
    IF v_net>0 THEN v_lines:=v_lines||jsonb_build_object('account_code',v_code,'debit',v_net,'credit',0); v_debit:=v_debit+v_net;
    ELSE v_lines:=v_lines||jsonb_build_object('account_code',v_code,'debit',0,'credit',abs(v_net)); v_credit:=v_credit+abs(v_net); END IF;
  END LOOP;
  v_due:=greatest(0,coalesce(v_txn.customer_due_amount,0));
  IF v_due>0 AND v_txn.customer_id IS NOT NULL THEN v_lines:=v_lines||jsonb_build_object('account_code','1300','debit',v_due,'credit',0); v_debit:=v_debit+v_due; END IF;
  v_fee:=coalesce(v_txn.service_fee,0)+coalesce(v_txn.portal_charge,0);
  IF v_fee>0 THEN v_lines:=v_lines||jsonb_build_object('account_code','4020','debit',0,'credit',round(v_fee,2)); v_credit:=v_credit+v_fee; END IF;
  v_commission:=coalesce(v_txn.portal_commission,0);
  IF v_commission>0 THEN v_lines:=v_lines||jsonb_build_object('account_code','4030','debit',0,'credit',round(v_commission,2)); v_credit:=v_credit+v_commission; END IF;
  IF abs(round(v_debit-v_credit,2))>0.005 THEN RAISE EXCEPTION 'Service transaction % produced unbalanced journal snapshot: debit %, credit %',v_txn.transaction_number,round(v_debit,2),round(v_credit,2); END IF;
  IF jsonb_array_length(v_lines)=0 THEN RETURN NULL; END IF;
  v_num:='JE-'||lpad(nextval('public.journal_entry_seq')::text,8,'0');
  INSERT INTO public.journal_entries(entry_number,entry_date,source_type,source_id,description,posted_by) VALUES(v_num,v_txn.transaction_date,p_source_type,p_txn_id,p_description,v_txn.created_by) RETURNING id INTO v_entry_id;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    v_no:=v_no+1;
    INSERT INTO public.journal_lines(journal_entry_id,account_id,line_no,debit,credit,description)
    SELECT v_entry_id,aa.id,v_no,round(coalesce((v_line->>'debit')::numeric,0),2),round(coalesce((v_line->>'credit')::numeric,0),2),v_line->>'description'
    FROM public.accounting_accounts aa WHERE aa.code=v_line->>'account_code' AND aa.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown accounting account %',v_line->>'account_code'; END IF;
  END LOOP;
  RETURN v_entry_id;
END;
$function$;

-- The canonical transaction bridge now understands transaction_correction legs.
COMMIT;
