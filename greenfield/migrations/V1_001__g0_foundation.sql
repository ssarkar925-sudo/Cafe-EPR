-- ============================================================================
-- V1 BASELINE — G0: tenant / auth / device foundation
-- CyberCafe & Digital Services ERP (greenfield; approved architecture plan)
--
-- Applies to: empty database (local gate DB or fresh Supabase project).
-- Single transaction: any error rolls everything back (fail-closed).
-- Supabase4681 note: requires auth.users (platform-provided). Local gates
-- provide a stub via greenfield/tests/00_harness_setup.sql (test-only).
-- Initial Admin is operator-provisioned (see bottom); never seeded with secrets.
-- ============================================================================

BEGIN;

-- Token hashing for enrollment (standard contrib module; available on
-- Supabase and vanilla PostgreSQL alike).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- --------------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------------

CREATE TABLE public.tenants (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  status      text        NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'suspended')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Approved rule: at most one ACTIVE tenant in V1 (future multi-shop needs
-- an explicit decision + migration; the tenant_id seam stays regardless).
CREATE UNIQUE INDEX tenants_single_active_uidx ON public.tenants ((1))
  WHERE status = 'active';

CREATE TABLE public.profiles (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL UNIQUE REFERENCES auth.users (id)
                 ON DELETE CASCADE,
  tenant_id    uuid        NOT NULL REFERENCES public.tenants (id)
                 ON DELETE RESTRICT,
  display_name text        NOT NULL,
  role         text        NOT NULL
               CHECK (role IN ('admin', 'manager', 'staff', 'cashier')),
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profiles_tenant_role_active_idx
  ON public.profiles (tenant_id, role) WHERE is_active;

CREATE TABLE public.devices (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES public.tenants (id)
                      ON DELETE RESTRICT,
  owner_profile_id  uuid        NOT NULL REFERENCES public.profiles (id)
                      ON DELETE RESTRICT,
  device_epoch      integer     NOT NULL DEFAULT 1 CHECK (device_epoch >= 1),
  last_watermark    bigint      NOT NULL DEFAULT 0 CHECK (last_watermark >= 0),
  registered_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz,
  status            text        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'revoked')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_owner_status_idx
  ON public.devices (owner_profile_id, status);

CREATE TABLE public.enrollment_tokens (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants (id)
                     ON DELETE RESTRICT,
  user_profile_id  uuid        NOT NULL REFERENCES public.profiles (id)
                     ON DELETE RESTRICT,
  token_hash       text        NOT NULL UNIQUE,
  expires_at       timestamptz NOT NULL,
  consumed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.numbering_sequences (
  tenant_id     uuid   NOT NULL REFERENCES public.tenants (id)
                  ON DELETE RESTRICT,
  seq_name      text   NOT NULL
                CHECK (seq_name IN ('invoice', 'settlement', 'closing')),
  current_value bigint NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  increment_by  integer NOT NULL DEFAULT 1 CHECK (increment_by > 0),
  PRIMARY KEY (tenant_id, seq_name)
);

-- --------------------------------------------------------------------------
-- 2. updated_at maintenance (owner: postgres; no privileges granted)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_devices_updated_at
  BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3. Request context + role helpers (SECURITY DEFINER where table access)
-- --------------------------------------------------------------------------

-- Tenant of the caller, from JWT claim (tests: SET request.jwt.claim.tenant_id).
CREATE OR REPLACE FUNCTION public.current_tenant()
RETURNS uuid
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT nullif(current_setting('request.jwt.claim.tenant_id', true), '')::uuid;
$$;
REVOKE ALL ON FUNCTION public.current_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_tenant() TO authenticated;

-- Back-office = active admin/manager of the caller's tenant.
CREATE OR REPLACE FUNCTION public.is_back_office()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active
      AND p.role IN ('admin', 'manager')
      AND (public.current_tenant() IS NULL OR p.tenant_id = public.current_tenant())
  );
END;
$$;
REVOKE ALL ON FUNCTION public.is_back_office() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_back_office() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active
      AND p.role = 'admin'
      AND (public.current_tenant() IS NULL OR p.tenant_id = public.current_tenant())
  );
END;
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- --------------------------------------------------------------------------
-- 4. Enrollment RPCs (single-use 15-minute tokens; device epoch starts at 1)
-- --------------------------------------------------------------------------

-- Issue a token for the caller's own profile. Returns plaintext token ONCE;
-- only its sha256 is stored. Caller must be an active user of this tenant.
CREATE OR REPLACE FUNCTION public.issue_enrollment_token()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_token   text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT * INTO v_profile FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active profile for caller';
  END IF;
  IF public.current_tenant() IS NOT NULL
     AND v_profile.tenant_id <> public.current_tenant() THEN
    RAISE EXCEPTION 'Tenant mismatch';
  END IF;

  v_token := gen_random_uuid()::text || gen_random_uuid()::text;
  INSERT INTO public.enrollment_tokens
    (tenant_id, user_profile_id, token_hash, expires_at)
  VALUES
    (v_profile.tenant_id, v_profile.id,
     encode(digest(v_token, 'sha256'), 'hex'),
     now() + interval '15 minutes');
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_enrollment_token() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_enrollment_token() TO authenticated;

-- Consume a token: single-use, expiry-checked, tenant-checked; creates the
-- device row atomically. Returns the new device id.
CREATE OR REPLACE FUNCTION public.consume_enrollment_token(p_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tok       public.enrollment_tokens%ROWTYPE;
  v_device_id uuid;
BEGIN
  SELECT * INTO v_tok FROM public.enrollment_tokens t
  WHERE t.token_hash = encode(digest(nullif(p_token, ''), 'sha256'), 'hex')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid enrollment token';
  END IF;
  IF v_tok.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Enrollment token already consumed';
  END IF;
  IF v_tok.expires_at <= now() THEN
    RAISE EXCEPTION 'Enrollment token expired';
  END IF;
  IF public.current_tenant() IS NOT NULL
     AND v_tok.tenant_id <> public.current_tenant() THEN
    RAISE EXCEPTION 'Tenant mismatch';
  END IF;

  UPDATE public.enrollment_tokens
  SET consumed_at = now() WHERE id = v_tok.id;

  INSERT INTO public.devices (tenant_id, owner_profile_id, device_epoch)
  VALUES (v_tok.tenant_id, v_tok.user_profile_id, 1)
  RETURNING id INTO v_device_id;
  RETURN v_device_id;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_enrollment_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_enrollment_token(text) TO authenticated;

-- Revoke a device (owner or back-office). Revocation is terminal for the
-- device epoch: re-enrollment mints epoch+1 via a fresh token (see gate).
CREATE OR REPLACE FUNCTION public.revoke_device(p_device_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dev public.devices%ROWTYPE;
BEGIN
  SELECT * INTO v_dev FROM public.devices d WHERE d.id = p_device_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device not found';
  END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.id = v_dev.owner_profile_id)
    OR public.is_back_office()
  ) THEN
    RAISE EXCEPTION 'Not authorized to revoke this device';
  END IF;
  UPDATE public.devices
  SET status = 'revoked', revoked_at = now()
  WHERE id = p_device_id AND status = 'active';
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_device(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_device(uuid) TO authenticated;

-- Canonical number source. Locks the row; caller formats the number.
-- Gaps are acceptable (never reused, never decremented).
CREATE OR REPLACE FUNCTION public.next_canonical_number(p_seq_name text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_next   bigint;
BEGIN
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  SELECT (current_value + increment_by) INTO v_next
  FROM public.numbering_sequences
  WHERE tenant_id = v_tenant AND seq_name = p_seq_name
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown sequence %', p_seq_name;
  END IF;
  UPDATE public.numbering_sequences
  SET current_value = v_next
  WHERE tenant_id = v_tenant AND seq_name = p_seq_name;
  RETURN v_next;
END;
$$;
REVOKE ALL ON FUNCTION public.next_canonical_number(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_canonical_number(text) TO authenticated;

-- --------------------------------------------------------------------------
-- 5. RLS: deny-default, explicit least-privilege policies
-- --------------------------------------------------------------------------
ALTER TABLE public.tenants             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.numbering_sequences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- tenants: read own tenant only; no direct writes (operator-managed).
GRANT SELECT ON public.tenants TO authenticated;
CREATE POLICY tenants_own_select ON public.tenants
  FOR SELECT TO authenticated
  USING (id = public.current_tenant());

-- profiles: read own row + back-office read all **within the caller's tenant**
-- (tenant scoping is enforced here, not just in is_back_office(), so a
-- back-office user can never list another tenant's profiles).
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;
CREATE POLICY profiles_self_select ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY profiles_backoffice_tenant_select ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());
CREATE POLICY profiles_self_update_name ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- devices: read own + back-office **within the caller's tenant**
-- (same tenant-scoping discipline as profiles).
GRANT SELECT ON public.devices TO authenticated;
CREATE POLICY devices_scope_select ON public.devices
  FOR SELECT TO authenticated
  USING (
    owner_profile_id IN (SELECT p.id FROM public.profiles p
                         WHERE p.user_id = auth.uid())
    OR (public.is_back_office()
        AND tenant_id = public.current_tenant())
  );

-- enrollment_tokens: RPC-only (no grants, no policies = deny all direct).
-- numbering_sequences: in-tenant read; advances only via RPC.
GRANT SELECT ON public.numbering_sequences TO authenticated;
CREATE POLICY numbering_own_select ON public.numbering_sequences
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant());

-- --------------------------------------------------------------------------
-- 6. Seed: single tenant + sequence rows. Initial Admin is
--    operator-provisioned (Supabase: create user, then insert matching
--    profiles row as postgres/service_role); never seeded with secrets.
-- --------------------------------------------------------------------------
INSERT INTO public.tenants (name, status)
VALUES ('CyberCafe & Digital Services ERP', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO public.numbering_sequences (tenant_id, seq_name)
SELECT t.id, s.seq_name
FROM public.tenants t
CROSS JOIN (VALUES ('invoice'), ('settlement'), ('closing')) AS s(seq_name)
WHERE t.status = 'active'
ON CONFLICT DO NOTHING;

COMMIT;
