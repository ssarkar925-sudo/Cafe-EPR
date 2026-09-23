-- ============================================================================
-- V1 BASELINE — G7: approvals (discounts/returns/refunds/variance overrides),
-- D5 sole-admin amendment, separation-of-duties activation, override audit.
-- Depends on: G0 (roles/tenant). Standalone mechanism: consuming flows
-- (returns/refunds/variance documents) reference approval records in later
-- groups; existing G3 discount approver-links are preserved unchanged.
-- SoD rule (approved D5 amendment): sole active Admin may self-approve;
-- once a second active Admin exists, approver must differ from requester.
-- Historical self-approvals are never retro-invalidated.
-- Single transaction, fail-closed.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------------
CREATE TABLE public.approvals (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants (id)
                        ON DELETE RESTRICT,
  scope_hash          text        NOT NULL,
  entity_type         text        NOT NULL,
  entity_id           uuid,
  action              text        NOT NULL,
  details             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  reason              text        NOT NULL CHECK (char_length(btrim(reason)) > 0),
  requester_profile_id uuid       NOT NULL REFERENCES public.profiles (id)
                        ON DELETE RESTRICT,
  approver_profile_id uuid        REFERENCES public.profiles (id)
                        ON DELETE RESTRICT,
  requested_at        timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  decided_at          timestamptz,
  status              text        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','consumed','rejected')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, scope_hash)
);
CREATE INDEX approvals_requester_status_idx
  ON public.approvals (tenant_id, requester_profile_id, status);

-- Append-only audit. No UPDATE/DELETE grants ever; trigger blocks even the
-- owner (same immutability pattern as journals).
CREATE TABLE public.audit_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants (id)
                     ON DELETE RESTRICT,
  actor_profile_id uuid        REFERENCES public.profiles (id)
                     ON DELETE RESTRICT,
  action           text        NOT NULL,
  entity           text        NOT NULL,
  entity_id        text,
  description      text        NOT NULL,
  details          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  device_id        uuid        REFERENCES public.devices (id)
                     ON DELETE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_created_idx
  ON public.audit_logs (tenant_id, entity, created_at);

CREATE OR REPLACE FUNCTION public.trg_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable';
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_audit_immutable() FROM PUBLIC;

CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_immutable();

-- --------------------------------------------------------------------------
-- 2. Internal audit writer (no caller grants; definer RPCs use it)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.append_audit(
  p_action text, p_entity text, p_entity_id text, p_description text,
  p_details jsonb, p_device_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid; v_actor uuid; v_id uuid;
BEGIN
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  SELECT p.id INTO v_actor FROM public.profiles p
  WHERE p.user_id = auth.uid();
  INSERT INTO public.audit_logs
    (tenant_id, actor_profile_id, action, entity, entity_id,
     description, details, device_id)
  VALUES (v_tenant, v_actor, p_action, p_entity, p_entity_id,
          p_description, coalesce(p_details, '{}'::jsonb), p_device_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION
  public.append_audit(text,text,text,text,jsonb,uuid) FROM PUBLIC;

-- --------------------------------------------------------------------------
-- 3. request_approval (any active role): single-use scope, 15-minute expiry
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_approval(
  p_scope_hash text, p_entity_type text, p_entity_id uuid,
  p_action text, p_details jsonb, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_req    uuid;
  v_id     uuid;
BEGIN
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  SELECT p.id INTO v_req FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.is_active AND p.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active profile for caller';
  END IF;
  IF nullif(btrim(p_scope_hash), '') IS NULL THEN
    RAISE EXCEPTION 'Scope hash required';
  END IF;
  IF nullif(btrim(p_entity_type), '') IS NULL
     OR nullif(btrim(p_action), '') IS NULL THEN
    RAISE EXCEPTION 'Entity type and action required';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Approval reason required';
  END IF;
  INSERT INTO public.approvals
    (tenant_id, scope_hash, entity_type, entity_id, action,
     details, reason, requester_profile_id, expires_at)
  VALUES (v_tenant, btrim(p_scope_hash), btrim(p_entity_type), p_entity_id,
          btrim(p_action), coalesce(p_details, '{}'::jsonb),
          btrim(p_reason), v_req, now() + interval '15 minutes')
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Scope already has an approval request';
END;
$$;
REVOKE ALL ON FUNCTION
  public.request_approval(text,text,uuid,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.request_approval(text,text,uuid,text,jsonb,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 4. approve_override (admin only) + reject_approval (admin only)
--    SoD: approver must differ from requester once a second active Admin
--    exists in the tenant; sole-Admin self-approval stays allowed.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_override(p_approval_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid;
  v_approver uuid;
  v_appr     record;
  v_admins   integer;
BEGIN
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  SELECT p.id INTO v_approver FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.is_active AND p.role = 'admin'
    AND p.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;
  SELECT * INTO v_appr FROM public.approvals a
  WHERE a.id = p_approval_id AND a.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found in tenant';
  END IF;
  IF v_appr.status <> 'pending' THEN
    RAISE EXCEPTION 'Approval is not pending (status=%)', v_appr.status;
  END IF;
  IF v_appr.expires_at <= now() THEN
    RAISE EXCEPTION 'Approval expired';
  END IF;
  SELECT count(*) INTO v_admins FROM public.profiles p
  WHERE p.tenant_id = v_tenant AND p.is_active AND p.role = 'admin';
  IF v_admins > 1 AND v_appr.requester_profile_id = v_approver THEN
    RAISE EXCEPTION 'Separation of duties: approver must differ from requester';
  END IF;
  UPDATE public.approvals
  SET status = 'consumed', approver_profile_id = v_approver,
      decided_at = now()
  WHERE id = p_approval_id;
  PERFORM public.append_audit(
    'override_approved', 'approvals', p_approval_id::text,
    'Approved ' || v_appr.action || ' (' || v_appr.scope_hash || ')',
    jsonb_build_object('scope_hash', v_appr.scope_hash,
                       'action', v_appr.action,
                       'requester', v_appr.requester_profile_id,
                       'approver', v_approver,
                       'details', v_appr.details,
                       'self_approved', v_appr.requester_profile_id = v_approver),
    NULL);
  RETURN jsonb_build_object('id', p_approval_id, 'status', 'consumed');
END;
$$;
REVOKE ALL ON FUNCTION public.approve_override(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_override(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_approval(
  p_approval_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid;
  v_approver uuid;
  v_appr     record;
BEGIN
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant context required';
  END IF;
  SELECT p.id INTO v_approver FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.is_active AND p.role = 'admin'
    AND p.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Rejection reason required';
  END IF;
  SELECT * INTO v_appr FROM public.approvals a
  WHERE a.id = p_approval_id AND a.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found in tenant';
  END IF;
  IF v_appr.status <> 'pending' THEN
    RAISE EXCEPTION 'Approval is not pending (status=%)', v_appr.status;
  END IF;
  UPDATE public.approvals
  SET status = 'rejected', approver_profile_id = v_approver,
      decided_at = now(),
      details = v_appr.details || jsonb_build_object(
        'rejection_reason', btrim(p_reason))
  WHERE id = p_approval_id;
  PERFORM public.append_audit(
    'override_rejected', 'approvals', p_approval_id::text,
    'Rejected ' || v_appr.action || ' (' || v_appr.scope_hash || ')',
    jsonb_build_object('scope_hash', v_appr.scope_hash,
                       'action', v_appr.action,
                       'requester', v_appr.requester_profile_id,
                       'approver', v_approver,
                       'rejection_reason', btrim(p_reason)),
    NULL);
  RETURN jsonb_build_object('id', p_approval_id, 'status', 'rejected');
END;
$$;
REVOKE ALL ON FUNCTION public.reject_approval(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_approval(uuid,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 5. RLS: deny-default; requesters read own + back-office reads all in
--    tenant; audit readable by back-office only; all writes via RPCs.
-- --------------------------------------------------------------------------
ALTER TABLE public.approvals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.approvals, public.audit_logs
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.approvals TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
CREATE POLICY approvals_scope_select ON public.approvals
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant()
         AND (requester_profile_id IN (SELECT p.id FROM public.profiles p
                                       WHERE p.user_id = auth.uid())
              OR public.is_back_office()));
CREATE POLICY audit_backoffice_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_back_office()
         AND tenant_id = public.current_tenant());

COMMIT;
