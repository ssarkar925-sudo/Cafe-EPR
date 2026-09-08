-- Permanent settlement hardening: normalize direction at the DB boundary,
-- make cash adjustments atomic, and enforce supported pool/instrument routing.

ALTER TABLE public.settlements
  DROP CONSTRAINT IF EXISTS settlements_direction_check;

ALTER TABLE public.settlements
  ADD CONSTRAINT settlements_direction_check
  CHECK (direction IS NULL OR direction IN ('in','out'));

CREATE OR REPLACE FUNCTION public.normalize_settlement_direction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.settlement_type = 'cash_adjustment' THEN
    NEW.direction := lower(trim(coalesce(NEW.direction,'')));
    IF NEW.direction NOT IN ('in','out') THEN
      RAISE EXCEPTION 'Select Add Cash or Remove Cash';
    END IF;
  ELSE
    NEW.direction := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aaa_normalize_settlement_direction ON public.settlements;
CREATE TRIGGER aaa_normalize_settlement_direction
BEFORE INSERT OR UPDATE OF settlement_type, direction ON public.settlements
FOR EACH ROW EXECUTE FUNCTION public.normalize_settlement_direction();

CREATE OR REPLACE FUNCTION public.validate_settlement_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_src_type text;
BEGIN
  IF coalesce(NEW.amount,0) <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be positive';
  END IF;

  IF lower(coalesce(NEW.status,'')) IN ('success','successful','completed','posted') THEN
    IF NEW.source_instrument_id IS NULL OR NEW.dest_instrument_id IS NULL THEN
      RAISE EXCEPTION 'Successful settlement requires source and destination instruments';
    END IF;

    IF NEW.settlement_type = 'cash_adjustment' THEN
      IF NEW.source_instrument_id IS DISTINCT FROM NEW.dest_instrument_id THEN
        RAISE EXCEPTION 'Cash adjustment must use the canonical Cash account';
      END IF;
      SELECT lower(type) INTO v_src_type
      FROM public.payment_instruments
      WHERE id=NEW.source_instrument_id AND is_active;
      IF v_src_type IS DISTINCT FROM 'cash' THEN
        RAISE EXCEPTION 'Cash adjustment must use an active Cash payment account';
      END IF;
      IF NEW.direction NOT IN ('in','out') THEN
        RAISE EXCEPTION 'Cash adjustment direction must be in or out';
      END IF;
    ELSE
      IF NEW.source_instrument_id = NEW.dest_instrument_id THEN
        RAISE EXCEPTION 'Settlement source and destination cannot be the same account';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_settlement_operational_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_src_type text;
  v_dst_type text;
  v_expected_from text;
  v_expected_to text;
  v_from_type text;
  v_to_type text;
  v_reversal boolean := coalesce(NEW.remarks,'') LIKE 'Reversal of %';
BEGIN
  CASE NEW.settlement_type
    WHEN 'aeps_to_bank' THEN v_expected_from:='aeps'; v_expected_to:='bank';
    WHEN 'bank_to_aeps' THEN v_expected_from:='bank'; v_expected_to:='aeps';
    WHEN 'bank_to_dmt' THEN v_expected_from:='bank'; v_expected_to:='dmt';
    WHEN 'wallet_to_dmt' THEN v_expected_from:='wallet'; v_expected_to:='dmt';
    WHEN 'upi_qr_to_wallet' THEN v_expected_from:='upi_qr'; v_expected_to:='wallet';
    WHEN 'upi_qr_to_bank' THEN v_expected_from:='upi_qr'; v_expected_to:='bank';
    WHEN 'wallet_to_bank' THEN v_expected_from:='wallet'; v_expected_to:='bank';
    WHEN 'bank_to_wallet' THEN v_expected_from:='bank'; v_expected_to:='wallet';
    WHEN 'bank_to_recharge' THEN v_expected_from:='bank'; v_expected_to:='recharge';
    WHEN 'recharge_to_bank' THEN v_expected_from:='recharge'; v_expected_to:='bank';
    WHEN 'recharge_to_wallet' THEN v_expected_from:='recharge'; v_expected_to:='wallet';
    WHEN 'bank_to_credit_card' THEN v_expected_from:='bank'; v_expected_to:='credit_card';
    WHEN 'cash_to_credit_card' THEN v_expected_from:='cash'; v_expected_to:='credit_card';
    WHEN 'credit_card_to_bank' THEN v_expected_from:='credit_card'; v_expected_to:='bank';
    WHEN 'bank_withdrawal' THEN v_expected_from:='bank'; v_expected_to:='cash';
    WHEN 'add_cash_to_bank' THEN v_expected_from:='cash'; v_expected_to:='bank';
    WHEN 'cash_adjustment' THEN v_expected_from:='cash'; v_expected_to:='cash';
    ELSE RETURN NEW;
  END CASE;

  IF v_reversal THEN
    v_from_type := v_expected_to;
    v_to_type := v_expected_from;
  ELSE
    v_from_type := v_expected_from;
    v_to_type := v_expected_to;
  END IF;

  IF NEW.from_pool <> v_from_type OR NEW.to_pool <> v_to_type THEN
    RAISE EXCEPTION 'Settlement routing mismatch for %: expected % -> %, got % -> %',
      NEW.settlement_type, v_from_type, v_to_type, NEW.from_pool, NEW.to_pool;
  END IF;

  IF NEW.source_instrument_id IS NOT NULL THEN
    SELECT lower(type) INTO v_src_type
    FROM public.payment_instruments
    WHERE id=NEW.source_instrument_id AND is_active;
  END IF;
  IF NEW.dest_instrument_id IS NOT NULL THEN
    SELECT lower(type) INTO v_dst_type
    FROM public.payment_instruments
    WHERE id=NEW.dest_instrument_id AND is_active;
  END IF;

  IF NEW.source_instrument_id IS NOT NULL AND v_from_type <> 'recharge' THEN
    IF v_from_type='cash' AND v_src_type <> 'cash' THEN
      RAISE EXCEPTION 'Settlement source must be Cash';
    ELSIF v_from_type='bank' AND v_src_type <> 'bank' THEN
      RAISE EXCEPTION 'Settlement source must be a Bank account';
    ELSIF v_from_type='wallet' AND v_src_type <> 'wallet' THEN
      RAISE EXCEPTION 'Settlement source must be a Wallet account';
    ELSIF v_from_type='dmt' AND v_src_type NOT IN ('dmt','dmt_portal') THEN
      RAISE EXCEPTION 'Settlement source must be a DMT account';
    ELSIF v_from_type='aeps' AND v_src_type NOT IN ('aeps','aeps_portal') THEN
      RAISE EXCEPTION 'Settlement source must be an AEPS account';
    ELSIF v_from_type='upi_qr' AND v_src_type NOT IN ('upi','upi_qr') THEN
      RAISE EXCEPTION 'Settlement source must be a UPI/QR account';
    ELSIF v_from_type='credit_card' AND v_src_type <> 'credit_card' THEN
      RAISE EXCEPTION 'Settlement source must be a Credit Card';
    END IF;
  END IF;

  IF NEW.dest_instrument_id IS NOT NULL AND v_to_type <> 'recharge' THEN
    IF v_to_type='cash' AND v_dst_type <> 'cash' THEN
      RAISE EXCEPTION 'Settlement destination must be Cash';
    ELSIF v_to_type='bank' AND v_dst_type <> 'bank' THEN
      RAISE EXCEPTION 'Settlement destination must be a Bank account';
    ELSIF v_to_type='wallet' AND v_dst_type <> 'wallet' THEN
      RAISE EXCEPTION 'Settlement destination must be a Wallet account';
    ELSIF v_to_type='dmt' AND v_dst_type NOT IN ('dmt','dmt_portal') THEN
      RAISE EXCEPTION 'Settlement destination must be a DMT account';
    ELSIF v_to_type='aeps' AND v_dst_type NOT IN ('aeps','aeps_portal') THEN
      RAISE EXCEPTION 'Settlement destination must be an AEPS account';
    ELSIF v_to_type='upi_qr' AND v_dst_type NOT IN ('upi','upi_qr') THEN
      RAISE EXCEPTION 'Settlement destination must be a UPI/QR account';
    ELSIF v_to_type='credit_card' AND v_dst_type <> 'credit_card' THEN
      RAISE EXCEPTION 'Settlement destination must be a Credit Card';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_settlement_instrument_movements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_method text;
BEGIN
  IF NEW.status <> 'success' THEN
    RETURN NEW;
  END IF;

  IF NEW.settlement_type='cash_adjustment' THEN
    IF NEW.source_instrument_id IS NOT NULL THEN
      SELECT CASE lower(type)
               WHEN 'aeps_portal' THEN 'aeps'
               WHEN 'dmt_portal' THEN 'dmt'
               WHEN 'upi_qr' THEN 'upi'
               ELSE lower(type)
             END
        INTO v_method
        FROM public.payment_instruments
       WHERE id=NEW.source_instrument_id;
      INSERT INTO public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
      SELECT NEW.settlement_date,v_method,NEW.direction,NEW.amount,
             'Cash Adjustment '||NEW.settlement_number||' — '||CASE WHEN NEW.direction='in' THEN 'add' ELSE 'remove' END,
             'settlement',NEW.id,NEW.source_instrument_id
      WHERE NOT EXISTS (
        SELECT 1 FROM public.cash_entries ce
        WHERE ce.ref_type='settlement' AND ce.ref_id=NEW.id
          AND ce.instrument_id=NEW.source_instrument_id AND ce.direction=NEW.direction
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.source_instrument_id IS NOT NULL THEN
    SELECT CASE lower(type)
             WHEN 'aeps_portal' THEN 'aeps'
             WHEN 'dmt_portal' THEN 'dmt'
             WHEN 'upi_qr' THEN 'upi'
             ELSE lower(type)
           END
      INTO v_method
      FROM public.payment_instruments
     WHERE id=NEW.source_instrument_id;
    INSERT INTO public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
    SELECT NEW.settlement_date,v_method,'out',NEW.amount,
           'Settlement '||NEW.settlement_number||' — source: '||pi.name,
           'settlement',NEW.id,NEW.source_instrument_id
    FROM public.payment_instruments pi
    WHERE pi.id=NEW.source_instrument_id
      AND NOT EXISTS (
        SELECT 1 FROM public.cash_entries ce
        WHERE ce.ref_type='settlement' AND ce.ref_id=NEW.id
          AND ce.instrument_id=NEW.source_instrument_id AND ce.direction='out'
      );
  END IF;

  IF NEW.dest_instrument_id IS NOT NULL THEN
    SELECT CASE lower(type)
             WHEN 'aeps_portal' THEN 'aeps'
             WHEN 'dmt_portal' THEN 'dmt'
             WHEN 'upi_qr' THEN 'upi'
             ELSE lower(type)
           END
      INTO v_method
      FROM public.payment_instruments
     WHERE id=NEW.dest_instrument_id;
    INSERT INTO public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
    SELECT NEW.settlement_date,v_method,'in',NEW.amount,
           'Settlement '||NEW.settlement_number||' — destination: '||pi.name,
           'settlement',NEW.id,NEW.dest_instrument_id
    FROM public.payment_instruments pi
    WHERE pi.id=NEW.dest_instrument_id
      AND NOT EXISTS (
        SELECT 1 FROM public.cash_entries ce
        WHERE ce.ref_type='settlement' AND ce.ref_id=NEW.id
          AND ce.instrument_id=NEW.dest_instrument_id AND ce.direction='in'
      );
  END IF;

  RETURN NEW;
END;
$$;

-- Normalize any historical non-adjustment direction values.
UPDATE public.settlements
SET direction=NULL
WHERE settlement_type <> 'cash_adjustment' AND direction IS NOT NULL;
