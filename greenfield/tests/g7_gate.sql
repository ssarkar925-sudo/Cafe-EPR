-- ============================================================================
-- G7 EXIT GATE — fails (RAISE EXCEPTION, nonzero exit) on any mismatch.
-- Requires: G0-G6 applied. Run with ON_ERROR_STOP=1. Local test DB only.
-- Ends with teardown of its own rows for later regressions.
-- ============================================================================

SELECT id AS g7t FROM public.tenants
WHERE name = 'CyberCafe & Digital Services ERP' LIMIT 1 \gset
SELECT set_config('g7.tenant', :'g7t', false);

-- --------------------------------------------------------------------------
-- 0. Cleanup-first (idempotent reruns) + second-admin probe removal
-- --------------------------------------------------------------------------
DO $$
BEGIN
  -- NOTE: audit_logs rows are immutable by design and persist across reruns;
  -- all assertions scope by entity_id/scope, so this is safe.
  DELETE FROM public.approvals WHERE scope_hash LIKE 'g7-%';
  DELETE FROM public.profiles
  WHERE display_name = 'Gate Second Admin'
    AND NOT EXISTS (SELECT 1 FROM public.approvals a
                    WHERE a.requester_profile_id = profiles.id
                       OR a.approver_profile_id = profiles.id)
    AND NOT EXISTS (SELECT 1 FROM public.audit_logs l
                    WHERE l.actor_profile_id = profiles.id);
  DELETE FROM auth.users
  WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeee0001'
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.users.id);
END
$$;

-- --------------------------------------------------------------------------
-- 1. Request happy path (staff) + validation
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g7t';
DO $$
DECLARE v_id uuid; v_exp timestamptz; v_st text;
BEGIN
  v_id := public.request_approval('g7-disc-1', 'discount', NULL,
    'discount', jsonb_build_object('old_total', 1000, 'new_total', 900),
    'g7 staff discount request');
  PERFORM set_config('g7.req1', v_id::text, false);
  SELECT status, expires_at INTO v_st, v_exp FROM public.approvals WHERE id = v_id;
  IF v_st <> 'pending' THEN RAISE EXCEPTION 'not pending'; END IF;
  IF v_exp <= now() + interval '14 minutes' OR v_exp > now() + interval '16 minutes' THEN
    RAISE EXCEPTION 'expiry not ~15min: %', v_exp;
  END IF;
  BEGIN
    PERFORM public.request_approval('g7-disc-1', 'discount', NULL,
      'discount', '{}'::jsonb, 'g7 duplicate');
    RAISE EXCEPTION 'duplicate scope was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'duplicate scope was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.request_approval('g7-bad-1', 'discount', NULL,
      'discount', '{}'::jsonb, '   ');
    RAISE EXCEPTION 'empty reason was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'empty reason was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 2. Approve happy (admin, cross-approval) + audit row
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g7t';
DO $$
DECLARE v_r jsonb; v_st text; v_self boolean; v_actor uuid; v_n integer;
BEGIN
  v_r := public.approve_override((SELECT current_setting('g7.req1'))::uuid);
  IF (v_r->>'status') <> 'consumed' THEN RAISE EXCEPTION 'not consumed'; END IF;
  SELECT status INTO v_st FROM public.approvals
  WHERE id = (SELECT current_setting('g7.req1'))::uuid;
  IF v_st <> 'consumed' THEN RAISE EXCEPTION 'row not consumed'; END IF;
  SELECT count(*) INTO v_n FROM public.audit_logs
  WHERE action = 'override_approved'
    AND entity_id = (SELECT current_setting('g7.req1'))::text;
  IF v_n <> 1 THEN RAISE EXCEPTION 'override audit missing'; END IF;
  SELECT (details->>'self_approved')::boolean, actor_profile_id
  INTO v_self, v_actor FROM public.audit_logs
  WHERE action = 'override_approved'
    AND entity_id = (SELECT current_setting('g7.req1'))::text;
  IF v_self THEN RAISE EXCEPTION 'cross-approval flagged self'; END IF;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'audit actor missing'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 3. Sole-admin self-approval allowed; staff approve denied; double denied
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g7t';
DO $$
DECLARE v_id uuid; v_r jsonb; v_self boolean;
BEGIN
  v_id := public.request_approval('g7-self-1', 'refund', NULL,
    'refund', jsonb_build_object('old_total', 500, 'new_total', 0),
    'g7 admin self approval');
  v_r := public.approve_override(v_id);
  IF (v_r->>'status') <> 'consumed' THEN RAISE EXCEPTION 'self-approval failed'; END IF;
  SELECT (details->>'self_approved')::boolean INTO v_self FROM public.audit_logs
  WHERE action = 'override_approved' AND entity_id = v_id::text;
  IF NOT coalesce(v_self, false) THEN RAISE EXCEPTION 'self flag missing'; END IF;
  BEGIN
    PERFORM public.approve_override(v_id);
    RAISE EXCEPTION 'double approve was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'double approve was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g7t';
DO $$
DECLARE v_id uuid;
BEGIN
  v_id := public.request_approval('g7-staff-appr-1', 'discount', NULL,
    'discount', '{}'::jsonb, 'g7 staff request for admin test');
  BEGIN
    PERFORM public.approve_override(v_id);
    RAISE EXCEPTION 'staff approve was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff approve was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 4. Expired approval denied (aged as owner to simulate lapse)
-- --------------------------------------------------------------------------
-- Expired approval fixture: insert directly as owner with past expiry
-- (UPDATE-based backdating is correctly blocked by the transition guard).
DO $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.approvals
    (tenant_id, scope_hash, entity_type, action, details, reason,
     requester_profile_id, expires_at)
  VALUES ((SELECT current_setting('g7.tenant'))::uuid, 'g7-expired-1',
    'discount', 'discount', '{}'::jsonb, 'g7 expiry probe',
    (SELECT id FROM public.profiles
     WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
    now() - interval '1 minute')
  RETURNING id INTO v_id;
  PERFORM set_config('g7.expired', v_id::text, false);
  DELETE FROM public.approvals WHERE scope_hash = 'g7-staff-appr-1'
    AND status = 'pending'
    AND id NOT IN (SELECT id FROM public.approvals WHERE scope_hash = 'g7-expired-1');
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g7t';
DO $$
BEGIN
  BEGIN
    PERFORM public.approve_override((SELECT current_setting('g7.expired'))::uuid);
    RAISE EXCEPTION 'expired approve was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'expired approve was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 5. Reject flow: admin rejects; approve-after-reject denied
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SET request.jwt.claim.tenant_id = :'g7t';
DO $$
DECLARE v_id uuid;
BEGIN
  v_id := public.request_approval('g7-rej-1', 'return', NULL,
    'return', '{}'::jsonb, 'g7 cashier return request');
  PERFORM set_config('g7.rej', v_id::text, false);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g7t';
DO $$
DECLARE v_r jsonb; v_st text;
BEGIN
  v_r := public.reject_approval(
    (SELECT current_setting('g7.rej'))::uuid, 'g7 insufficient evidence');
  IF (v_r->>'status') <> 'rejected' THEN RAISE EXCEPTION 'not rejected'; END IF;
  SELECT status INTO v_st FROM public.approvals
  WHERE id = (SELECT current_setting('g7.rej'))::uuid;
  IF v_st <> 'rejected' THEN RAISE EXCEPTION 'row not rejected'; END IF;
  BEGIN
    PERFORM public.approve_override((SELECT current_setting('g7.rej'))::uuid);
    RAISE EXCEPTION 'approve-after-reject was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'approve-after-reject was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 6. SoD activation: second admin appears -> self-approval denied,
--    cross-approval allowed
-- --------------------------------------------------------------------------
DO $$
DECLARE v_b uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0001')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (user_id, tenant_id, display_name, role)
  VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0001',
    (SELECT current_setting('g7.tenant'))::uuid, 'Gate Second Admin', 'admin')
  ON CONFLICT (user_id) DO UPDATE SET role = 'admin', is_active = true
  RETURNING id INTO v_b;
  PERFORM set_config('g7.admin2', v_b::text, false);
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g7t';
DO $$
DECLARE v_id uuid; v_r jsonb;
BEGIN
  -- admin-A requests, admin-A approves -> DENIED (two admins now)
  v_id := public.request_approval('g7-sod-1', 'discount', NULL,
    'discount', '{}'::jsonb, 'g7 sod self attempt');
  BEGIN
    PERFORM public.approve_override(v_id);
    RAISE EXCEPTION 'sod self-approval was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'sod self-approval was NOT blocked' THEN RAISE; END IF;
  END;
  -- admin-B requests, admin-A approves -> allowed
  PERFORM set_config('g7.sodreq', v_id::text, false);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'eeeeeeee-eeee-eeee-eeee-eeeeeeee0001';
SET request.jwt.claim.tenant_id = :'g7t';
DO $$
DECLARE v_id uuid; v_r jsonb;
BEGIN
  v_id := public.request_approval('g7-sod-2', 'discount', NULL,
    'discount', '{}'::jsonb, 'g7 sod cross request');
  PERFORM set_config('g7.sodreq2', v_id::text, false);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g7t';
DO $$
DECLARE v_r jsonb;
BEGIN
  v_r := public.approve_override((SELECT current_setting('g7.sodreq2'))::uuid);
  IF (v_r->>'status') <> 'consumed' THEN RAISE EXCEPTION 'cross-approval failed'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 7. RLS: requesters read own only; audit back-office only; writes denied
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g7t';
DO $$
DECLARE r record; n_own integer := 0;
BEGIN
  FOR r IN SELECT * FROM public.approvals LOOP
    IF r.requester_profile_id <> (SELECT id FROM public.profiles
                                  WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') THEN
      RAISE EXCEPTION 'staff sees foreign approval';
    END IF;
    n_own := n_own + 1;
  END LOOP;
  IF n_own <> 2 THEN RAISE EXCEPTION 'staff sees % approvals, want 2 own', n_own; END IF;
  BEGIN
    INSERT INTO public.approvals (tenant_id, scope_hash, entity_type, action, reason, requester_profile_id, expires_at)
    VALUES (current_setting('request.jwt.claim.tenant_id')::uuid, 'g7-x', 'discount', 'discount', 'x',
      (SELECT id FROM public.profiles WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), now() + interval '1 hour');
    RAISE EXCEPTION 'staff approval insert was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.approvals SET reason = 'x' WHERE scope_hash LIKE 'g7-%';
    RAISE EXCEPTION 'staff approval update was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.approvals WHERE scope_hash LIKE 'g7-%';
    RAISE EXCEPTION 'staff approval delete was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.audit_logs (tenant_id, action, entity, description)
    VALUES (current_setting('request.jwt.claim.tenant_id')::uuid, 'x', 'x', 'x');
    RAISE EXCEPTION 'staff audit insert was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.append_audit('x','x','x','x','{}'::jsonb, NULL);
    RAISE EXCEPTION 'staff append_audit was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- outsider sees nothing
SET ROLE authenticated;
SET request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM public.approvals;
  IF c <> 0 THEN RAISE EXCEPTION 'outsider sees approvals'; END IF;
  SELECT count(*) INTO c FROM public.audit_logs;
  IF c <> 0 THEN RAISE EXCEPTION 'outsider sees audit'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub;

-- admin sees all in-tenant approvals
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g7t';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM public.approvals
  WHERE tenant_id = (SELECT current_setting('g7.tenant'))::uuid;
  IF c < 5 THEN RAISE EXCEPTION 'admin sees % approvals, want >= 5', c; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 8. Teardown own rows (keeps later regressions green).
--    NOTE: audit_logs rows are immutable by design (trigger blocks even the
--    owner), so they persist across reruns. All assertions scope by
--    entity_id/scope, keeping reruns green.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  DELETE FROM public.approvals WHERE scope_hash LIKE 'g7-%';
  DELETE FROM public.profiles
  WHERE display_name = 'Gate Second Admin'
    AND NOT EXISTS (SELECT 1 FROM public.approvals a
                    WHERE a.requester_profile_id = profiles.id
                       OR a.approver_profile_id = profiles.id)
    AND NOT EXISTS (SELECT 1 FROM public.audit_logs l
                    WHERE l.actor_profile_id = profiles.id);
  DELETE FROM auth.users
  WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeee0001'
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.users.id);
END
$$;

SELECT 'G7_GATE_ALL_GREEN' AS gate_result;
