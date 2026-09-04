-- Prevent recursive UPI QR <-> payment-instrument bootstrap inserts.

CREATE OR REPLACE FUNCTION public.sync_upi_merchant_qr_to_payment_instrument()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_name text := btrim(NEW.display_name);
  v_upi text := lower(btrim(NEW.upi_id));
  v_instrument_id uuid;
  v_instrument_type text;
  v_match_count integer := 0;
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'UPI QR display name is required';
  END IF;
  IF v_upi = '' THEN
    RAISE EXCEPTION 'UPI ID is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('upi-qr:' || v_upi, 0));
  NEW.display_name := v_name;
  NEW.upi_id := v_upi;

  IF NEW.payment_instrument_id IS NOT NULL THEN
    SELECT lower(type) INTO v_instrument_type
    FROM public.payment_instruments
    WHERE id = NEW.payment_instrument_id;
    IF v_instrument_type IS NULL THEN
      RAISE EXCEPTION 'UPI payment account % not found', NEW.payment_instrument_id;
    END IF;
    IF v_instrument_type NOT IN ('upi','upi_qr') THEN
      RAISE EXCEPTION 'Payment account % is not a UPI account', NEW.payment_instrument_id;
    END IF;
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_match_count
  FROM public.payment_instruments
  WHERE lower(type) IN ('upi','upi_qr')
    AND lower(btrim(COALESCE(details->>'upi_id',''))) = v_upi;
  IF v_match_count > 1 THEN
    RAISE EXCEPTION 'Multiple UPI payment accounts already use UPI ID %', v_upi;
  END IF;

  IF v_match_count = 1 THEN
    SELECT id INTO v_instrument_id
    FROM public.payment_instruments
    WHERE lower(type) IN ('upi','upi_qr')
      AND lower(btrim(COALESCE(details->>'upi_id',''))) = v_upi
    ORDER BY created_at, id
    LIMIT 1;
  ELSE
    SELECT id INTO v_instrument_id
    FROM public.payment_instruments
    WHERE lower(type) IN ('upi','upi_qr')
      AND lower(btrim(name)) = lower(v_name)
    ORDER BY created_at, id
    LIMIT 1;
  END IF;

  IF v_instrument_id IS NULL THEN
    PERFORM set_config('app.upi_qr_bootstrap', 'on', true);
    BEGIN
      INSERT INTO public.payment_instruments
        (name, type, is_active, created_by, details, opening_balance, current_balance)
      VALUES
        (v_name, 'upi_qr', COALESCE(NEW.is_active, true), auth.uid(), jsonb_build_object('upi_id', v_upi), 0, 0)
      RETURNING id INTO v_instrument_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_instrument_id
      FROM public.payment_instruments
      WHERE lower(type) IN ('upi','upi_qr')
        AND (lower(btrim(COALESCE(details->>'upi_id',''))) = v_upi OR lower(btrim(name)) = lower(v_name))
      ORDER BY created_at, id
      LIMIT 1;
      IF v_instrument_id IS NULL THEN
        RAISE;
      END IF;
    END;
    PERFORM set_config('app.upi_qr_bootstrap', 'off', true);
  END IF;

  NEW.payment_instrument_id := v_instrument_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_upi_payment_instrument_to_qr()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_upi text := lower(btrim(COALESCE(NEW.details->>'upi_id','')));
  v_qr_id uuid;
BEGIN
  IF current_setting('app.upi_qr_bootstrap', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF lower(COALESCE(NEW.type,'')) NOT IN ('upi','upi_qr') OR v_upi = '' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('upi-qr:' || v_upi, 0));

  SELECT id INTO v_qr_id
  FROM public.upi_merchant_qrs
  WHERE payment_instrument_id = NEW.id
  LIMIT 1;

  IF v_qr_id IS NOT NULL THEN
    UPDATE public.upi_merchant_qrs
       SET display_name = btrim(NEW.name),
           upi_id = v_upi,
           is_active = NEW.is_active
     WHERE id = v_qr_id;
    RETURN NEW;
  END IF;

  SELECT id INTO v_qr_id
  FROM public.upi_merchant_qrs
  WHERE lower(btrim(upi_id)) = v_upi
  LIMIT 1;

  IF v_qr_id IS NOT NULL THEN
    UPDATE public.upi_merchant_qrs
       SET payment_instrument_id = NEW.id,
           display_name = btrim(NEW.name),
           is_active = NEW.is_active
     WHERE id = v_qr_id;
    RETURN NEW;
  END IF;

  INSERT INTO public.upi_merchant_qrs
    (display_name, upi_id, is_active, payment_instrument_id)
  VALUES
    (btrim(NEW.name), v_upi, NEW.is_active, NEW.id);

  RETURN NEW;
END;
$function$;
