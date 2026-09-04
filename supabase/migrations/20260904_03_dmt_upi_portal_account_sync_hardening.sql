-- DMT + UPI operational/funding identity hardening.
-- payment_instruments remains the authoritative financial source of truth.

ALTER TABLE public.aeps_portals
  ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'aeps';

UPDATE public.aeps_portals
SET service_type = 'aeps'
WHERE service_type IS NULL OR btrim(service_type) = '';

ALTER TABLE public.aeps_portals
  DROP CONSTRAINT IF EXISTS aeps_portals_service_type_check;
ALTER TABLE public.aeps_portals
  ADD CONSTRAINT aeps_portals_service_type_check
  CHECK (service_type IN ('aeps','dmt'));

DROP INDEX IF EXISTS public.aeps_portals_normalized_name_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS aeps_portals_service_normalized_name_uidx
  ON public.aeps_portals (service_type, lower(btrim(name)));

CREATE OR REPLACE FUNCTION public.prevent_portal_service_type_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.service_type IS DISTINCT FROM OLD.service_type THEN
    RAISE EXCEPTION 'Portal service type cannot be changed after creation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_portal_service_type_change ON public.aeps_portals;
CREATE TRIGGER trg_prevent_portal_service_type_change
BEFORE UPDATE OF service_type ON public.aeps_portals
FOR EACH ROW EXECUTE FUNCTION public.prevent_portal_service_type_change();

CREATE OR REPLACE FUNCTION public.sync_aeps_portal_to_payment_instrument()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_name text := btrim(NEW.name); v_instrument_id uuid; v_instrument_name text;
  v_instrument_type text; v_existing_id uuid;
BEGIN
  IF COALESCE(NEW.service_type, 'aeps') <> 'aeps' THEN RETURN NEW; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'AEPS portal name is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('portal:aeps:' || lower(v_name), 0));
  NEW.name := v_name;

  IF NEW.payment_instrument_id IS NOT NULL THEN
    SELECT id,name,type INTO v_instrument_id,v_instrument_name,v_instrument_type
    FROM public.payment_instruments WHERE id=NEW.payment_instrument_id;
    IF v_instrument_id IS NULL THEN RAISE EXCEPTION 'AEPS payment account % not found', NEW.payment_instrument_id; END IF;
    IF v_instrument_type <> 'aeps_portal' THEN RAISE EXCEPTION 'Payment account % is not an AEPS portal account', NEW.payment_instrument_id; END IF;
    IF lower(btrim(v_instrument_name)) <> lower(v_name) THEN RAISE EXCEPTION 'AEPS portal name and payment account name must match'; END IF;
    SELECT id INTO v_existing_id FROM public.aeps_portals
    WHERE payment_instrument_id=NEW.payment_instrument_id AND id<>COALESCE(NEW.id,'00000000-0000-0000-0000-000000000000'::uuid)
      AND COALESCE(service_type,'aeps')='aeps' LIMIT 1;
    IF v_existing_id IS NOT NULL THEN RAISE EXCEPTION 'AEPS payment account is already linked to another portal'; END IF;
    SELECT id INTO v_existing_id FROM public.aeps_portals
    WHERE service_type='aeps' AND lower(btrim(name))=lower(v_name)
      AND id<>COALESCE(NEW.id,'00000000-0000-0000-0000-000000000000'::uuid) LIMIT 1;
    IF v_existing_id IS NOT NULL THEN RAISE EXCEPTION 'AEPS portal % already exists', v_name; END IF;
    RETURN NEW;
  END IF;

  SELECT id INTO v_instrument_id FROM public.payment_instruments
  WHERE type='aeps_portal' AND lower(btrim(name))=lower(v_name) ORDER BY created_at,id LIMIT 1;
  IF v_instrument_id IS NOT NULL THEN NEW.payment_instrument_id:=v_instrument_id; RETURN NEW; END IF;

  PERFORM set_config('app.aeps_portal_bootstrap','on',true);
  BEGIN
    INSERT INTO public.payment_instruments(name,type,is_active,created_by,details,opening_balance,current_balance)
    VALUES(v_name,'aeps_portal',COALESCE(NEW.is_active,true),auth.uid(),'{}'::jsonb,0,0)
    RETURNING id INTO v_instrument_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_instrument_id FROM public.payment_instruments
    WHERE type='aeps_portal' AND lower(btrim(name))=lower(v_name) ORDER BY created_at,id LIMIT 1;
    IF v_instrument_id IS NULL THEN RAISE; END IF;
  END;
  PERFORM set_config('app.aeps_portal_bootstrap','off',true);
  NEW.payment_instrument_id:=v_instrument_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_linked_aeps_portal_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF OLD.payment_instrument_id IS NOT NULL THEN
    IF COALESCE(OLD.service_type,'aeps')='dmt' THEN
      RAISE EXCEPTION 'Cannot delete a DMT portal linked to a payment account; deactivate it instead';
    END IF;
    RAISE EXCEPTION 'Cannot delete an AEPS portal linked to a payment account; deactivate it instead';
  END IF;
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_dmt_payment_instrument_to_portal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_name text:=btrim(NEW.name); v_portal_id uuid; v_linked_instrument_id uuid;
BEGIN
  IF lower(COALESCE(NEW.type,'')) NOT IN ('dmt','dmt_portal') THEN
    IF TG_OP='UPDATE' THEN
      SELECT id INTO v_linked_instrument_id FROM public.aeps_portals
      WHERE payment_instrument_id=NEW.id AND service_type='dmt' LIMIT 1;
      IF v_linked_instrument_id IS NOT NULL THEN RAISE EXCEPTION 'Cannot change DMT payment account type while it is linked to a portal'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF v_name='' THEN RAISE EXCEPTION 'DMT payment account name is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('portal:dmt:'||lower(v_name),0)); NEW.name:=v_name;
  IF current_setting('app.dmt_portal_bootstrap',true)='on' THEN RETURN NEW; END IF;
  SELECT id INTO v_portal_id FROM public.aeps_portals WHERE service_type='dmt' AND payment_instrument_id=NEW.id LIMIT 1;
  IF v_portal_id IS NOT NULL THEN UPDATE public.aeps_portals SET name=v_name,is_active=NEW.is_active WHERE id=v_portal_id; RETURN NEW; END IF;
  SELECT id INTO v_portal_id FROM public.aeps_portals WHERE service_type='dmt' AND lower(btrim(name))=lower(v_name) AND payment_instrument_id IS NULL LIMIT 1;
  IF v_portal_id IS NOT NULL THEN UPDATE public.aeps_portals SET payment_instrument_id=NEW.id,is_active=NEW.is_active WHERE id=v_portal_id; RETURN NEW; END IF;
  SELECT id INTO v_portal_id FROM public.aeps_portals WHERE service_type='dmt' AND lower(btrim(name))=lower(v_name) LIMIT 1;
  IF v_portal_id IS NOT NULL THEN RAISE EXCEPTION 'DMT portal % is already linked to another payment account',v_name; END IF;
  INSERT INTO public.aeps_portals(name,service_type,is_active,payment_instrument_id) VALUES(v_name,'dmt',NEW.is_active,NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_dmt_payment_instrument_to_portal ON public.payment_instruments;
CREATE TRIGGER trg_sync_dmt_payment_instrument_to_portal
AFTER INSERT OR UPDATE OF name,type,is_active ON public.payment_instruments
FOR EACH ROW EXECUTE FUNCTION public.sync_dmt_payment_instrument_to_portal();

CREATE OR REPLACE FUNCTION public.sync_dmt_portal_to_payment_instrument()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_name text:=btrim(NEW.name); v_instrument_id uuid; v_existing_id uuid; v_type text;
BEGIN
  IF COALESCE(NEW.service_type,'aeps')<>'dmt' THEN RETURN NEW; END IF;
  IF v_name='' THEN RAISE EXCEPTION 'DMT portal name is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('portal:dmt:'||lower(v_name),0)); NEW.name:=v_name;
  IF NEW.payment_instrument_id IS NOT NULL THEN
    SELECT id,lower(type) INTO v_instrument_id,v_type FROM public.payment_instruments WHERE id=NEW.payment_instrument_id;
    IF v_instrument_id IS NULL THEN RAISE EXCEPTION 'DMT payment account % not found',NEW.payment_instrument_id; END IF;
    IF v_type NOT IN ('dmt','dmt_portal') THEN RAISE EXCEPTION 'Payment account % is not a DMT account',NEW.payment_instrument_id; END IF;
    SELECT id INTO v_existing_id FROM public.aeps_portals WHERE service_type='dmt' AND payment_instrument_id=NEW.payment_instrument_id AND id<>COALESCE(NEW.id,'00000000-0000-0000-0000-000000000000'::uuid) LIMIT 1;
    IF v_existing_id IS NOT NULL THEN RAISE EXCEPTION 'DMT payment account is already linked to another portal'; END IF;
    RETURN NEW;
  END IF;
  IF current_setting('app.dmt_portal_bootstrap',true)='on' THEN RETURN NEW; END IF;
  SELECT id INTO v_instrument_id FROM public.payment_instruments WHERE lower(type) IN ('dmt','dmt_portal') AND lower(btrim(name))=lower(v_name) ORDER BY created_at,id LIMIT 1;
  IF v_instrument_id IS NULL THEN
    PERFORM set_config('app.dmt_portal_bootstrap','on',true);
    BEGIN
      INSERT INTO public.payment_instruments(name,type,is_active,created_by,details,opening_balance,current_balance)
      VALUES(v_name,'dmt_portal',COALESCE(NEW.is_active,true),auth.uid(),'{}'::jsonb,0,0) RETURNING id INTO v_instrument_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_instrument_id FROM public.payment_instruments WHERE lower(type) IN ('dmt','dmt_portal') AND lower(btrim(name))=lower(v_name) ORDER BY created_at,id LIMIT 1;
      IF v_instrument_id IS NULL THEN RAISE; END IF;
    END;
    PERFORM set_config('app.dmt_portal_bootstrap','off',true);
  END IF;
  NEW.payment_instrument_id:=v_instrument_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_dmt_portal_to_payment_instrument ON public.aeps_portals;
CREATE TRIGGER trg_sync_dmt_portal_to_payment_instrument
BEFORE INSERT OR UPDATE OF name,payment_instrument_id,service_type ON public.aeps_portals
FOR EACH ROW EXECUTE FUNCTION public.sync_dmt_portal_to_payment_instrument();

DROP TRIGGER IF EXISTS trg_sync_aeps_portal_to_payment_instrument ON public.aeps_portals;
CREATE TRIGGER trg_sync_aeps_portal_to_payment_instrument
BEFORE INSERT OR UPDATE OF name,payment_instrument_id ON public.aeps_portals
FOR EACH ROW EXECUTE FUNCTION public.sync_aeps_portal_to_payment_instrument();

CREATE UNIQUE INDEX IF NOT EXISTS aeps_portals_dmt_payment_instrument_uidx
  ON public.aeps_portals(payment_instrument_id) WHERE service_type='dmt' AND payment_instrument_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_service_portal_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_service text:=lower(COALESCE(NEW.service_type,'')); v_portal_service text; v_portal_instrument_type text;
BEGIN
  IF v_service IN ('aeps','dmt') AND NEW.portal_id IS NOT NULL THEN
    SELECT lower(COALESCE(service_type,'aeps')),lower(pi.type) INTO v_portal_service,v_portal_instrument_type
    FROM public.aeps_portals ap LEFT JOIN public.payment_instruments pi ON pi.id=ap.payment_instrument_id WHERE ap.id=NEW.portal_id;
    IF v_portal_service IS NULL THEN RAISE EXCEPTION '% portal not found',upper(v_service); END IF;
    IF v_portal_service<>v_service THEN RAISE EXCEPTION '% transaction cannot reference a % portal',upper(v_service),upper(v_portal_service); END IF;
    IF v_service='aeps' AND v_portal_instrument_type IS NOT NULL AND v_portal_instrument_type<>'aeps_portal' THEN RAISE EXCEPTION 'AEPS portal is not linked to an AEPS payment account'; END IF;
    IF v_service='dmt' AND v_portal_instrument_type IS NOT NULL AND v_portal_instrument_type NOT IN ('dmt','dmt_portal') THEN RAISE EXCEPTION 'DMT portal is not linked to a DMT payment account'; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_service_portal_link ON public.transactions;
CREATE TRIGGER trg_validate_service_portal_link
BEFORE INSERT OR UPDATE OF service_type,portal_id ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.validate_service_portal_link();

CREATE OR REPLACE FUNCTION public.validate_settlement_operational_links()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_src_type text; v_dst_type text;
BEGIN
  IF NEW.settlement_type='aeps_to_bank' AND NEW.source_instrument_id IS NOT NULL THEN
    SELECT lower(type) INTO v_src_type FROM public.payment_instruments WHERE id=NEW.source_instrument_id;
    IF v_src_type NOT IN ('aeps','aeps_portal') THEN RAISE EXCEPTION 'AEPS settlement source must be an AEPS payment account'; END IF;
  END IF;
  IF NEW.settlement_type IN ('bank_to_dmt','wallet_to_dmt') AND NEW.dest_instrument_id IS NOT NULL THEN
    SELECT lower(type) INTO v_dst_type FROM public.payment_instruments WHERE id=NEW.dest_instrument_id;
    IF v_dst_type NOT IN ('dmt','dmt_portal') THEN RAISE EXCEPTION 'DMT settlement destination must be a DMT payment account'; END IF;
  END IF;
  IF NEW.settlement_type IN ('upi_qr_to_bank','upi_qr_to_wallet') AND NEW.source_instrument_id IS NOT NULL THEN
    SELECT lower(type) INTO v_src_type FROM public.payment_instruments WHERE id=NEW.source_instrument_id;
    IF v_src_type NOT IN ('upi','upi_qr') THEN RAISE EXCEPTION 'UPI settlement source must be a UPI payment account'; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_settlement_operational_links ON public.settlements;
CREATE TRIGGER trg_validate_settlement_operational_links
BEFORE INSERT OR UPDATE OF settlement_type,source_instrument_id,dest_instrument_id ON public.settlements
FOR EACH ROW EXECUTE FUNCTION public.validate_settlement_operational_links();

CREATE UNIQUE INDEX IF NOT EXISTS upi_merchant_qrs_normalized_upi_id_uidx
  ON public.upi_merchant_qrs(lower(btrim(upi_id)));
CREATE UNIQUE INDEX IF NOT EXISTS upi_merchant_qrs_payment_instrument_uidx
  ON public.upi_merchant_qrs(payment_instrument_id) WHERE payment_instrument_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_upi_merchant_qr_to_payment_instrument()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_name text:=btrim(NEW.display_name); v_upi text:=lower(btrim(NEW.upi_id)); v_instrument_id uuid; v_instrument_type text; v_match_count integer:=0;
BEGIN
  IF v_name='' THEN RAISE EXCEPTION 'UPI QR display name is required'; END IF;
  IF v_upi='' THEN RAISE EXCEPTION 'UPI ID is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('upi-qr:'||v_upi,0)); NEW.display_name:=v_name; NEW.upi_id:=v_upi;
  IF NEW.payment_instrument_id IS NOT NULL THEN
    SELECT lower(type) INTO v_instrument_type FROM public.payment_instruments WHERE id=NEW.payment_instrument_id;
    IF v_instrument_type IS NULL THEN RAISE EXCEPTION 'UPI payment account % not found',NEW.payment_instrument_id; END IF;
    IF v_instrument_type NOT IN ('upi','upi_qr') THEN RAISE EXCEPTION 'Payment account % is not a UPI account',NEW.payment_instrument_id; END IF;
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_match_count FROM public.payment_instruments
  WHERE lower(type) IN ('upi','upi_qr') AND lower(btrim(COALESCE(details->>'upi_id','')))=v_upi;
  IF v_match_count>1 THEN RAISE EXCEPTION 'Multiple UPI payment accounts already use UPI ID %',v_upi; END IF;
  IF v_match_count=1 THEN
    SELECT id INTO v_instrument_id FROM public.payment_instruments WHERE lower(type) IN ('upi','upi_qr') AND lower(btrim(COALESCE(details->>'upi_id','')))=v_upi ORDER BY created_at,id LIMIT 1;
  ELSE
    SELECT id INTO v_instrument_id FROM public.payment_instruments WHERE lower(type) IN ('upi','upi_qr') AND lower(btrim(name))=lower(v_name) ORDER BY created_at,id LIMIT 1;
  END IF;
  IF v_instrument_id IS NULL THEN
    PERFORM set_config('app.upi_qr_bootstrap','on',true);
    BEGIN
      INSERT INTO public.payment_instruments(name,type,is_active,created_by,details,opening_balance,current_balance)
      VALUES(v_name,'upi_qr',COALESCE(NEW.is_active,true),auth.uid(),jsonb_build_object('upi_id',v_upi),0,0) RETURNING id INTO v_instrument_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_instrument_id FROM public.payment_instruments
      WHERE lower(type) IN ('upi','upi_qr') AND (lower(btrim(COALESCE(details->>'upi_id','')))=v_upi OR lower(btrim(name))=lower(v_name)) ORDER BY created_at,id LIMIT 1;
      IF v_instrument_id IS NULL THEN RAISE; END IF;
    END;
    PERFORM set_config('app.upi_qr_bootstrap','off',true);
  END IF;
  NEW.payment_instrument_id:=v_instrument_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_upi_merchant_qr_to_payment_instrument ON public.upi_merchant_qrs;
CREATE TRIGGER trg_sync_upi_merchant_qr_to_payment_instrument
BEFORE INSERT OR UPDATE OF display_name,upi_id,payment_instrument_id ON public.upi_merchant_qrs
FOR EACH ROW EXECUTE FUNCTION public.sync_upi_merchant_qr_to_payment_instrument();

CREATE OR REPLACE FUNCTION public.sync_upi_payment_instrument_to_qr()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_upi text:=lower(btrim(COALESCE(NEW.details->>'upi_id',''))); v_qr_id uuid;
BEGIN
  IF current_setting('app.upi_qr_bootstrap',true)='on' THEN RETURN NEW; END IF;
  IF lower(COALESCE(NEW.type,'')) NOT IN ('upi','upi_qr') OR v_upi='' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('upi-qr:'||v_upi,0));
  SELECT id INTO v_qr_id FROM public.upi_merchant_qrs WHERE payment_instrument_id=NEW.id LIMIT 1;
  IF v_qr_id IS NOT NULL THEN
    UPDATE public.upi_merchant_qrs SET display_name=btrim(NEW.name),upi_id=v_upi,is_active=NEW.is_active WHERE id=v_qr_id;
    RETURN NEW;
  END IF;
  SELECT id INTO v_qr_id FROM public.upi_merchant_qrs WHERE lower(btrim(upi_id))=v_upi LIMIT 1;
  IF v_qr_id IS NOT NULL THEN
    UPDATE public.upi_merchant_qrs SET payment_instrument_id=NEW.id,display_name=btrim(NEW.name),is_active=NEW.is_active WHERE id=v_qr_id;
    RETURN NEW;
  END IF;
  INSERT INTO public.upi_merchant_qrs(display_name,upi_id,is_active,payment_instrument_id) VALUES(btrim(NEW.name),v_upi,NEW.is_active,NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_upi_payment_instrument_to_qr ON public.payment_instruments;
CREATE TRIGGER trg_sync_upi_payment_instrument_to_qr
AFTER INSERT OR UPDATE OF name,type,is_active,details ON public.payment_instruments
FOR EACH ROW EXECUTE FUNCTION public.sync_upi_payment_instrument_to_qr();
