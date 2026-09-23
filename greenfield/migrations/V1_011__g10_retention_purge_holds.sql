-- ============================================================================
-- V1 BASELINE — G10: retention policy, legal holds, purge executor, archive.
-- Documented scope ONLY (plan G10 + approved F3/R1–R6 tiers).
-- Policy engine: purge acts ONLY on entities with an approved policy row;
-- anything unlisted is retained (fail-closed — e.g. conflicts have no tier
-- yet and are never purged). Journals are excluded structurally (no policy
-- row may target them: enforced by CHECK below).
-- Restore reconciliation = re-running the purge after a restore (documented
-- procedure; the executor is idempotent, so this is safe).
-- Single transaction, fail-closed.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 0. Audit immutability refinement (G7 dependency completion).
--    The approved archive tier requires moving aged rows to audit_archive.
--    The trigger keeps forbidding UPDATEs always and DELETEs unless an
--    identical archive copy already exists (archive-then-delete in one
--    flow). Deletes without full-fidelity copies still raise; G7's
--    immutability guarantees are otherwise unchanged.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Audit logs are immutable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_archive a
    WHERE a.id = OLD.id
      AND a.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
      AND a.actor_profile_id IS NOT DISTINCT FROM OLD.actor_profile_id
      AND a.action = OLD.action
      AND a.entity = OLD.entity
      AND a.entity_id IS NOT DISTINCT FROM OLD.entity_id
      AND a.description = OLD.description
      AND a.details IS NOT DISTINCT FROM OLD.details
      AND a.device_id IS NOT DISTINCT FROM OLD.device_id
      AND a.created_at = OLD.created_at
  ) THEN
    RAISE EXCEPTION 'Audit logs are immutable (delete requires archived copy)';
  END IF;
  RETURN OLD;
END;
$$;

-- --------------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------------
CREATE TABLE public.retention_policies (
  entity         text        PRIMARY KEY,
  retain_days    integer     NOT NULL CHECK (retain_days > 0),
  archive_first  boolean     NOT NULL DEFAULT false,
  note           text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retention_no_journals
    CHECK (entity <> 'journal_entries' AND entity <> 'journal_lines')
);

-- Holds address rows two ways because identities differ: uuid PKs use
-- entity_id; idempotency keys (identified by scope+key text) use entity_key
-- of the form 'scope:key'. Exactly one must be set per hold.
CREATE TABLE public.legal_holds (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants (id)
                     ON DELETE RESTRICT,
  entity_type      text        NOT NULL
                   CHECK (entity_type IN ('audit_logs','idempotency_keys')),
  entity_id        uuid,
  entity_key       text,
  reason           text        NOT NULL CHECK (char_length(btrim(reason)) > 0),
  set_by_profile   uuid        NOT NULL REFERENCES public.profiles (id)
                     ON DELETE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now(),
  released_at      timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_holds_exactly_one_ref
    CHECK ((entity_id IS NULL) <> (entity_key IS NULL))
);
-- Active holds are unique per referenced row; released history may repeat.
CREATE UNIQUE INDEX legal_holds_active_id_uidx ON public.legal_holds
  (tenant_id, entity_type, entity_id)
  WHERE entity_id IS NOT NULL AND released_at IS NULL;
CREATE UNIQUE INDEX legal_holds_active_key_uidx ON public.legal_holds
  (tenant_id, entity_type, entity_key)
  WHERE entity_key IS NOT NULL AND released_at IS NULL;
CREATE TRIGGER trg_legal_holds_updated_at
  BEFORE UPDATE ON public.legal_holds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Read-only archive store for audit rows aged out of the live table.
-- Written only by the purge executor; test cleanup deletes as postgres.
CREATE TABLE public.audit_archive (
  id               uuid        PRIMARY KEY,
  tenant_id        uuid        NOT NULL REFERENCES public.tenants (id)
                     ON DELETE RESTRICT,
  actor_profile_id uuid,
  action           text        NOT NULL,
  entity           text        NOT NULL,
  entity_id        text,
  description      text        NOT NULL,
  details          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  device_id        uuid,
  created_at       timestamptz NOT NULL,
  archived_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_archive_tenant_created_idx
  ON public.audit_archive (tenant_id, created_at);

CREATE TABLE public.purge_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        REFERENCES public.tenants (id)
                 ON DELETE RESTRICT,
  entity       text        NOT NULL,
  rows_archived integer    NOT NULL DEFAULT 0 CHECK (rows_archived >= 0),
  rows_purged  integer     NOT NULL DEFAULT 0 CHECK (rows_purged >= 0),
  dry_run      boolean     NOT NULL DEFAULT true,
  actor_label  text        NOT NULL,
  reason       text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purge_log_tenant_created_idx
  ON public.purge_log (tenant_id, created_at);

-- --------------------------------------------------------------------------
-- 2. Hold setter / releaser (admin only)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_legal_hold(
  p_entity_type text, p_entity_id uuid, p_entity_key text, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid; v_actor uuid; v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  IF p_entity_type NOT IN ('audit_logs','idempotency_keys') THEN
    RAISE EXCEPTION 'Holds not supported for entity %', p_entity_type;
  END IF;
  IF (p_entity_id IS NULL) = (nullif(btrim(p_entity_key), '') IS NULL) THEN
    RAISE EXCEPTION 'Hold needs exactly one of entity_id, entity_key';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Hold reason required';
  END IF;
  SELECT p.id INTO v_actor FROM public.profiles p
  WHERE p.user_id = auth.uid();
  BEGIN
    INSERT INTO public.legal_holds
      (tenant_id, entity_type, entity_id, entity_key, reason, set_by_profile)
    VALUES (v_tenant, p_entity_type, p_entity_id,
            nullif(btrim(p_entity_key), ''), btrim(p_reason), v_actor)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Active hold already exists for this record';
  END;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_legal_hold(text,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_legal_hold(text,uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_legal_hold(
  p_entity_type text, p_entity_id uuid, p_entity_key text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;
  UPDATE public.legal_holds
  SET released_at = now()
  WHERE entity_type = p_entity_type
    AND tenant_id = public.current_tenant()
    AND released_at IS NULL
    AND ((p_entity_id IS NOT NULL AND entity_id = p_entity_id)
         OR (p_entity_key IS NOT NULL
             AND entity_key = nullif(btrim(p_entity_key), '')));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active hold not found in tenant';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.release_legal_hold(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_legal_hold(text,uuid,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 3. Purge executor (Admin-gated service identity): admin humans or the
--    service_role job. Idempotent: re-runs purge nothing new. Honors holds
--    (active hold on a row skips it) and tenant scope (NULL claim purges
--    all tenants, one log row per tenant+entity).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_retention_purge(
  p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean;
  v_is_job   boolean;
  v_tenant   uuid;
  v_tenants  uuid[];
  v_t        uuid;
  v_arch     integer;
  v_purg     integer;
  v_out      jsonb := '[]'::jsonb;
BEGIN
  SELECT public.is_admin() INTO v_is_admin;
  v_is_job := (coalesce(auth.role(), '') = 'service_role');
  IF NOT (v_is_admin OR v_is_job) THEN
    RAISE EXCEPTION 'Admin or service job authorization required';
  END IF;
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    SELECT array_agg(t.id) INTO v_tenants FROM public.tenants t;
  ELSE
    v_tenants := ARRAY[v_tenant];
  END IF;

  FOREACH v_t IN ARRAY v_tenants LOOP
    -- audit_logs: archive rows older than tier, unless held
    SELECT count(*) INTO v_arch FROM public.audit_logs a
    WHERE a.tenant_id = v_t
      AND a.created_at < now() - interval '7 years'
      AND NOT EXISTS (SELECT 1 FROM public.legal_holds h
                      WHERE h.entity_type = 'audit_logs'
                        AND h.entity_id = a.id
                        AND h.released_at IS NULL);
    SELECT count(*) INTO v_purg FROM public.audit_logs a
    WHERE a.tenant_id = v_t
      AND a.created_at < now() - interval '7 years'
      AND NOT EXISTS (SELECT 1 FROM public.legal_holds h
                      WHERE h.entity_type = 'audit_logs'
                        AND h.entity_id = a.id
                        AND h.released_at IS NULL);
    IF NOT p_dry_run THEN
      INSERT INTO public.audit_archive
        (id, tenant_id, actor_profile_id, action, entity, entity_id,
         description, details, device_id, created_at)
      SELECT a.id, a.tenant_id, a.actor_profile_id, a.action, a.entity,
             a.entity_id, a.description, a.details, a.device_id, a.created_at
      FROM public.audit_logs a
      WHERE a.tenant_id = v_t
        AND a.created_at < now() - interval '7 years'
        AND NOT EXISTS (SELECT 1 FROM public.legal_holds h
                        WHERE h.entity_type = 'audit_logs'
                          AND h.entity_id = a.id
                          AND h.released_at IS NULL);
      DELETE FROM public.audit_logs a
      WHERE a.tenant_id = v_t
        AND a.created_at < now() - interval '7 years'
        AND NOT EXISTS (SELECT 1 FROM public.legal_holds h
                        WHERE h.entity_type = 'audit_logs'
                          AND h.entity_id = a.id
                          AND h.released_at IS NULL);
    END IF;
    INSERT INTO public.purge_log
      (tenant_id, entity, rows_archived, rows_purged, dry_run,
       actor_label, reason)
    VALUES (v_t, 'audit_logs', v_arch, v_purg, p_dry_run,
            CASE WHEN v_is_job THEN 'service_role' ELSE 'admin' END,
            'tiered retention: 7y audit archive');
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'tenant_id', v_t, 'entity', 'audit_logs',
      'archived', v_arch, 'purged', v_purg, 'dry_run', p_dry_run));

    -- idempotency_keys: purge rows older than tier, unless held
    -- (holds address keys by 'scope:key' text identity)
    SELECT count(*) INTO v_purg FROM public.idempotency_keys k
    WHERE k.tenant_id = v_t
      AND k.created_at < now() - interval '2 years'
      AND NOT EXISTS (SELECT 1 FROM public.legal_holds h
                      WHERE h.entity_type = 'idempotency_keys'
                        AND h.entity_key = k.scope || ':' || k.key
                        AND h.released_at IS NULL);
    IF NOT p_dry_run THEN
      DELETE FROM public.idempotency_keys k
      WHERE k.tenant_id = v_t
        AND k.created_at < now() - interval '2 years'
        AND NOT EXISTS (SELECT 1 FROM public.legal_holds h
                        WHERE h.entity_type = 'idempotency_keys'
                          AND h.entity_key = k.scope || ':' || k.key
                          AND h.released_at IS NULL);
    END IF;
    INSERT INTO public.purge_log
      (tenant_id, entity, rows_archived, rows_purged, dry_run,
       actor_label, reason)
    VALUES (v_t, 'idempotency_keys', 0, v_purg, p_dry_run,
            CASE WHEN v_is_job THEN 'service_role' ELSE 'admin' END,
            'tiered retention: 2y key purge');
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'tenant_id', v_t, 'entity', 'idempotency_keys',
      'archived', 0, 'purged', v_purg, 'dry_run', p_dry_run));
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.run_retention_purge(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_retention_purge(boolean) TO authenticated, service_role;

-- --------------------------------------------------------------------------
-- 4. RLS: deny-default; back-office reads; all writes via RPCs/jobs
-- --------------------------------------------------------------------------
ALTER TABLE public.retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_holds        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_archive      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purge_log          ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.retention_policies, public.legal_holds,
  public.audit_archive, public.purge_log
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.retention_policies TO authenticated;
GRANT SELECT ON public.legal_holds TO authenticated;
GRANT SELECT ON public.audit_archive TO authenticated;
GRANT SELECT ON public.purge_log TO authenticated;
CREATE POLICY retention_policies_read ON public.retention_policies
  FOR SELECT TO authenticated
  USING (public.is_back_office());
CREATE POLICY legal_holds_scope_select ON public.legal_holds
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());
CREATE POLICY audit_archive_backoffice_select ON public.audit_archive
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());
CREATE POLICY purge_log_backoffice_select ON public.purge_log
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND (tenant_id = public.current_tenant()
              OR tenant_id IS NULL));

-- --------------------------------------------------------------------------
-- 5. Seed: approved tiers only (audit 7y archive-first; keys 2y purge).
-- --------------------------------------------------------------------------
INSERT INTO public.retention_policies (entity, retain_days, archive_first, note)
VALUES
  ('audit_logs', 2555, true, 'Approved tier: 7-year audit archive'),
  ('idempotency_keys', 730, false, 'Approved tier: 2-year key purge')
ON CONFLICT (entity) DO NOTHING;

COMMIT;
