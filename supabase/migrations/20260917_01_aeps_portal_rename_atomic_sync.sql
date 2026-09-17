-- AEPS Portal & Payment Instrument Atomic Sync Migration
-- Ensures portal rename is display metadata only and preserves stable financial identity (UUIDs).
-- Mirrors DMT and UPI bidirectional synchronization.

BEGIN;

-- 1. Replace sync_aeps_portal_to_payment_instrument with atomic rename sync
CREATE OR REPLACE FUNCTION public.sync_aeps_portal_to_payment_instrument()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text := btrim(NEW.name);
  v_instrument_id uuid;
  v_instrument_name text;
  v_instrument_type text;
  v_existing_id uuid;
BEGIN
  IF COALESCE(NEW.service_type, 'aeps') <> 'aeps' THEN RETURN NEW; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'AEPS portal name is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('portal:aeps:' || lower(v_name), 0));
  NEW.name := v_name;

  IF NEW.payment_instrument_id IS NOT NULL THEN
    SELECT id, name, type INTO v_instrument_id, v_instrument_name, v_instrument_type
    FROM public.payment_instruments WHERE id = NEW.payment_instrument_id;
    IF v_instrument_id IS NULL THEN RAISE EXCEPTION 'AEPS payment account % not found', NEW.payment_instrument_id; END IF;
    IF v_instrument_type <> 'aeps_portal' THEN RAISE EXCEPTION 'Payment account % is not an AEPS portal account', NEW.payment_instrument_id; END IF;

    -- Ensure no other portal is linked to this payment account
    SELECT id INTO v_existing_id FROM public.aeps_portals
    WHERE payment_instrument_id = NEW.payment_instrument_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND COALESCE(service_type, 'aeps') = 'aeps' LIMIT 1;
    IF v_existing_id IS NOT NULL THEN RAISE EXCEPTION 'AEPS payment account is already linked to another portal'; END IF;

    -- Ensure no other portal has this same name
    SELECT id INTO v_existing_id FROM public.aeps_portals
    WHERE service_type = 'aeps' AND lower(btrim(name)) = lower(v_name)
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid) LIMIT 1;
    IF v_existing_id IS NOT NULL THEN RAISE EXCEPTION 'AEPS portal % already exists', v_name; END IF;

    -- ATOMIC RENAME: If portal name changed, propagate to linked payment account without changing UUID
    IF lower(btrim(v_instrument_name)) <> lower(v_name) THEN
      IF current_setting('app.aeps_portal_bootstrap', true) <> 'on' THEN
        PERFORM set_config('app.aeps_portal_bootstrap', 'on', true);
        UPDATE public.payment_instruments
        SET name = v_name, is_active = COALESCE(NEW.is_active, is_active)
        WHERE id = NEW.payment_instrument_id;
        PERFORM set_config('app.aeps_portal_bootstrap', 'off', true);
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF current_setting('app.aeps_portal_bootstrap', true) = 'on' THEN RETURN NEW; END IF;

  -- If payment_instrument_id is null, find by name or create a new instrument
  SELECT id INTO v_instrument_id FROM public.payment_instruments
  WHERE type = 'aeps_portal' AND lower(btrim(name)) = lower(v_name) ORDER BY created_at, id LIMIT 1;
  IF v_instrument_id IS NOT NULL THEN NEW.payment_instrument_id := v_instrument_id; RETURN NEW; END IF;

  PERFORM set_config('app.aeps_portal_bootstrap', 'on', true);
  BEGIN
    INSERT INTO public.payment_instruments(name, type, is_active, created_by, details, opening_balance, current_balance)
    VALUES(v_name, 'aeps_portal', COALESCE(NEW.is_active, true), auth.uid(), '{}'::jsonb, 0, 0)
    RETURNING id INTO v_instrument_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_instrument_id FROM public.payment_instruments
    WHERE type = 'aeps_portal' AND lower(btrim(name)) = lower(v_name) ORDER BY created_at, id LIMIT 1;
    IF v_instrument_id IS NULL THEN RAISE; END IF;
  END;
  PERFORM set_config('app.aeps_portal_bootstrap', 'off', true);
  NEW.payment_instrument_id := v_instrument_id;
  RETURN NEW;
END;
$$;

-- 2. Create reverse sync trigger from payment_instruments to aeps_portals
CREATE OR REPLACE FUNCTION public.sync_aeps_payment_instrument_to_portal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text := btrim(NEW.name);
  v_portal_id uuid;
  v_linked_instrument_id uuid;
BEGIN
  IF lower(COALESCE(NEW.type, '')) <> 'aeps_portal' THEN
    IF TG_OP = 'UPDATE' THEN
      SELECT id INTO v_linked_instrument_id FROM public.aeps_portals
      WHERE payment_instrument_id = NEW.id AND service_type = 'aeps' LIMIT 1;
      IF v_linked_instrument_id IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot change AEPS payment account type while it is linked to a portal';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF v_name = '' THEN RAISE EXCEPTION 'AEPS payment account name is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('portal:aeps:' || lower(v_name), 0));
  NEW.name := v_name;

  IF current_setting('app.aeps_portal_bootstrap', true) = 'on' THEN RETURN NEW; END IF;

  -- 1. If portal already linked to this instrument, update name and active status
  SELECT id INTO v_portal_id FROM public.aeps_portals
  WHERE service_type = 'aeps' AND payment_instrument_id = NEW.id LIMIT 1;
  IF v_portal_id IS NOT NULL THEN
    PERFORM set_config('app.aeps_portal_bootstrap', 'on', true);
    UPDATE public.aeps_portals SET name = v_name, is_active = NEW.is_active WHERE id = v_portal_id;
    PERFORM set_config('app.aeps_portal_bootstrap', 'off', true);
    RETURN NEW;
  END IF;

  -- 2. If an unlinked portal with same name exists, link it
  SELECT id INTO v_portal_id FROM public.aeps_portals
  WHERE service_type = 'aeps' AND lower(btrim(name)) = lower(v_name) AND payment_instrument_id IS NULL LIMIT 1;
  IF v_portal_id IS NOT NULL THEN
    PERFORM set_config('app.aeps_portal_bootstrap', 'on', true);
    UPDATE public.aeps_portals SET payment_instrument_id = NEW.id, is_active = NEW.is_active WHERE id = v_portal_id;
    PERFORM set_config('app.aeps_portal_bootstrap', 'off', true);
    RETURN NEW;
  END IF;

  -- 3. Check for conflict
  SELECT id INTO v_portal_id FROM public.aeps_portals
  WHERE service_type = 'aeps' AND lower(btrim(name)) = lower(v_name) LIMIT 1;
  IF v_portal_id IS NOT NULL THEN
    RAISE EXCEPTION 'AEPS portal % is already linked to another payment account', v_name;
  END IF;

  -- 4. Otherwise create portal
  PERFORM set_config('app.aeps_portal_bootstrap', 'on', true);
  INSERT INTO public.aeps_portals(name, service_type, is_active, payment_instrument_id)
  VALUES (v_name, 'aeps', NEW.is_active, NEW.id);
  PERFORM set_config('app.aeps_portal_bootstrap', 'off', true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_aeps_payment_instrument_to_portal ON public.payment_instruments;
CREATE TRIGGER trg_sync_aeps_payment_instrument_to_portal
AFTER INSERT OR UPDATE OF name, type, is_active ON public.payment_instruments
FOR EACH ROW EXECUTE FUNCTION public.sync_aeps_payment_instrument_to_portal();

COMMIT;
