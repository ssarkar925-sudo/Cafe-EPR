-- 20260907_07_finalize_advance_journal_path.sql
-- Prevents customer advance cash entries from receiving an extra generic
-- suspense journal when the advance RPC posts its canonical AR journal.

BEGIN;

CREATE OR REPLACE FUNCTION public.trg_post_cash_entry_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_asset text; v_dr text; v_cr text; v_desc text; v_source uuid; v_amount numeric;
BEGIN
  IF NEW.amount <= 0 THEN RETURN NEW; END IF;
  IF NEW.ref_type IN (
    'invoice','purchase','quick_sale','expense','transaction',
    'transaction_correction','settlement','customer_advance',
    'customer_advance_return'
  ) THEN RETURN NEW; END IF;
  IF NEW.instrument_id IS NOT NULL THEN v_asset:=public.accounting_instrument_account_code(NEW.instrument_id); END IF;
  IF v_asset IS NULL THEN v_asset:=public.accounting_asset_code(NEW.method); END IF;
  v_amount:=round(NEW.amount,2); v_source:=NEW.id;
  IF NEW.direction='in' THEN
    v_dr:=v_asset;
    v_cr:=CASE
      WHEN NEW.ref_type IN ('customer_payment','due_collection') THEN '1300'
      WHEN NEW.ref_type='return' THEN '5100'
      WHEN NEW.ref_type='purchase_return' THEN '2000'
      WHEN NEW.ref_type='day_close' THEN '3000'
      WHEN NEW.ref_type IN ('capital','owner_equity') THEN '3000'
      WHEN NEW.ref_type IN ('cash_variance','cash_overage') THEN '5210'
      ELSE '1400'
    END;
  ELSE
    v_cr:=v_asset;
    v_dr:=CASE
      WHEN NEW.ref_type IN ('supplier_payment','purchase_payment') THEN '2000'
      WHEN NEW.ref_type IN ('customer_payment','due_collection') THEN '1300'
      WHEN NEW.ref_type='return' THEN '5100'
      WHEN NEW.ref_type='purchase_return' THEN '2000'
      WHEN NEW.ref_type='day_close' THEN '3000'
      WHEN NEW.ref_type IN ('capital','owner_equity') THEN '3000'
      WHEN NEW.ref_type IN ('cash_variance','cash_shortage') THEN '5210'
      ELSE '1400'
    END;
  END IF;
  v_desc:=coalesce(NEW.description,'Cash movement');
  PERFORM public.post_journal_entry(
    NEW.entry_date,'cash_entry',v_source,v_desc,
    jsonb_build_array(
      jsonb_build_object('account_code',v_dr,'debit',v_amount,'credit',0),
      jsonb_build_object('account_code',v_cr,'debit',0,'credit',v_amount)
    ),NULL
  );
  RETURN NEW;
END;
$function$;

COMMIT;
