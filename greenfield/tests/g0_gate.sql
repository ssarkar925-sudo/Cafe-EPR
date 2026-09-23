-- ============================================================================
-- G0 EXIT GATE — fails (RAISE EXCEPTION, nonzero exit) on any mismatch.
-- Run: psql -v ON_ERROR_STOP=1 -f g0_gate.sql  (exit 0 = gate passed)
-- Local test DB only. Read-only except fixture rows + exercised RPC paths.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 0. Fixtures (as owner postgres; RLS bypassed for setup only)
-- --------------------------------------------------------------------------
DO $$
DECLARE
  v_tenant_a uuid;
  v_tenant_b uuid;
BEGIN
  SELECT id INTO v_tenant_a FROM public.tenants WHERE status = 'active' LIMIT 1;
  IF v_tenant_a IS NULL THEN RAISE EXCEPTION 'G0 seed tenant missing'; END IF;

  INSERT INTO public.tenants (name, status) VALUES ('Gate Probe Tenant', 'suspended')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_tenant_b FROM public.tenants WHERE name = 'Gate Probe Tenant';

  INSERT INTO auth.users (id) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc'),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (user_id, tenant_id, display_name, role) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_tenant_a, 'Gate Admin', 'admin'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', v_tenant_a, 'Gate Staff', 'staff'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', v_tenant_a, 'Gate Cashier', 'cashier'),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', v_tenant_b, 'Probe Outsider', 'staff')
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM set_config('g0.tenant_a', v_tenant_a::text, false);
  PERFORM set_config('g0.tenant_b', v_tenant_b::text, false);
END
$$;

-- Pull tenant ids into psql variables (SET cannot take a sub-SELECT).
SELECT current_setting('g0.tenant_a') AS gta, current_setting('g0.tenant_b') AS gtb \gset

-- --------------------------------------------------------------------------
-- 1. ACL matrix: no PUBLIC execute on any G0 function; least-privilege grants
-- --------------------------------------------------------------------------
DO $$
DECLARE
  v_public_leak integer;
BEGIN
  SELECT count(*) INTO v_public_leak
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
       LATERAL aclexplode(p.proacl) AS a
  WHERE n.nspname = 'public'
    AND p.proname IN ('current_tenant','is_back_office','is_admin',
      'issue_enrollment_token','consume_enrollment_token',
      'revoke_device','next_canonical_number','set_updated_at')
    AND a.grantee = 0; -- 0 = PUBLIC pseudo-role; exact, no substring matching
  IF v_public_leak <> 0 THEN
    RAISE EXCEPTION 'PUBLIC execute grant found on % function(s)', v_public_leak;
  END IF;
END
$$;

-- --------------------------------------------------------------------------
-- 2. RLS matrix: anon sees nothing; claimless sees nothing; tenant isolation
-- --------------------------------------------------------------------------
SET ROLE anon;
DO $$
DECLARE c integer;
BEGIN
  -- anon holds no table privileges: hard denial at the privilege layer
  BEGIN
    SELECT count(*) INTO c FROM public.tenants;
    RAISE EXCEPTION 'anon tenants read was NOT denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SELECT count(*) INTO c FROM public.profiles;
    RAISE EXCEPTION 'anon profiles read was NOT denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;

-- authenticated, no tenant claim -> sees nothing (tenant-scoped tables)
SET ROLE authenticated;
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM public.tenants;
  IF c <> 0 THEN RAISE EXCEPTION 'claimless sees % tenants', c; END IF;
END
$$;
RESET ROLE;

-- admin of tenant A: sees own tenant only, all profiles, back-office true
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'gta';
DO $$
DECLARE
  c_tenants integer; c_known integer; c_out integer; b boolean;
BEGIN
  -- own tenant visible exactly once
  SELECT count(*) INTO c_tenants FROM public.tenants;
  IF c_tenants <> 1 THEN RAISE EXCEPTION 'admin sees % tenants, want 1', c_tenants; END IF;
  -- all three known A-fixture profiles visible (later groups may add their
  -- own additive fixtures; visibility of known rows + outsider exclusion is
  -- the security property under test, not an exact table count)
  SELECT count(*) INTO c_known FROM public.profiles
  WHERE user_id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                    'cccccccc-cccc-cccc-cccc-cccccccccccc');
  IF c_known <> 3 THEN RAISE EXCEPTION 'admin misses fixture profiles: %', c_known; END IF;
  SELECT count(*) INTO c_out FROM public.profiles
  WHERE user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  IF c_out <> 0 THEN RAISE EXCEPTION 'admin sees cross-tenant outsider'; END IF;
  SELECT public.is_back_office() INTO b;
  IF NOT b THEN RAISE EXCEPTION 'admin is_back_office false'; END IF;
  SELECT public.is_admin() INTO b;
  IF NOT b THEN RAISE EXCEPTION 'admin is_admin false'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- staff of tenant A: own profile only, not back-office, own devices only
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'gta';
DO $$
DECLARE c integer; b boolean;
BEGIN
  SELECT count(*) INTO c FROM public.profiles;
  IF c <> 1 THEN RAISE EXCEPTION 'staff sees % profiles, want 1', c; END IF;
  SELECT public.is_back_office() INTO b;
  IF b THEN RAISE EXCEPTION 'staff is_back_office true'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- outsider (tenant B): cannot see tenant A rows
SET ROLE authenticated;
SET request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
SET request.jwt.claim.tenant_id = :'gtb';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM public.tenants;
  IF c <> 1 THEN RAISE EXCEPTION 'outsider sees % tenants, want 1 (own)', c; END IF;
  SELECT count(*) INTO c FROM public.profiles;
  IF c <> 1 THEN RAISE EXCEPTION 'outsider sees % profiles, want 1 (own)', c; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 3. Column protection: staff cannot escalate own role; can edit own name
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'gta';
DO $$
BEGIN
  BEGIN
    UPDATE public.profiles SET role = 'admin'
    WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    RAISE EXCEPTION 'role self-escalation was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.profiles SET display_name = 'Gate Staff Renamed'
  WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 4. Enrollment: issue -> consume -> device epoch 1; replay + expiry denied
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'gta';
DO $$
DECLARE
  v_tok text; v_dev uuid; v_epoch integer; v_owner uuid;
BEGIN
  v_tok := public.issue_enrollment_token();
  IF v_tok IS NULL OR length(v_tok) < 32 THEN
    RAISE EXCEPTION 'token issuance failed';
  END IF;
  v_dev := public.consume_enrollment_token(v_tok);
  SELECT device_epoch, owner_profile_id INTO v_epoch, v_owner
  FROM public.devices WHERE id = v_dev;
  IF v_epoch <> 1 THEN RAISE EXCEPTION 'device epoch %, want 1', v_epoch; END IF;

  BEGIN
    PERFORM public.consume_enrollment_token(v_tok);
    RAISE EXCEPTION 'token replay was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%was NOT %' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- expired token (planted as owner) must be rejected
DO $$
DECLARE v_admin_profile uuid;
BEGIN
  SELECT id INTO v_admin_profile FROM public.profiles
  WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  DELETE FROM public.enrollment_tokens
  WHERE token_hash = encode(digest('expired-token-probe', 'sha256'), 'hex');
  INSERT INTO public.enrollment_tokens
    (tenant_id, user_profile_id, token_hash, expires_at)
  VALUES (
    (SELECT current_setting('g0.tenant_a'))::uuid, v_admin_profile,
    encode(digest('expired-token-probe', 'sha256'), 'hex'),
    now() - interval '1 minute');
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'gta';
DO $$
BEGIN
  BEGIN
    PERFORM public.consume_enrollment_token('expired-token-probe');
    RAISE EXCEPTION 'expired token was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%was NOT %' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 5. Numbering: monotonic per tenant+sequence; isolated across tenants
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'gta';
DO $$
DECLARE a bigint; b bigint;
BEGIN
  a := public.next_canonical_number('invoice');
  b := public.next_canonical_number('invoice');
  IF b <> a + 1 THEN RAISE EXCEPTION 'sequence not monotonic: % then %', a, b; END IF;
  BEGIN
    PERFORM public.next_canonical_number('nope');
    RAISE EXCEPTION 'unknown sequence was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%was NOT %' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 6. Device revocation: owner revokes own; staff cannot revoke others'
-- --------------------------------------------------------------------------
-- plant an admin device (as owner) so cross-revoke is a true negative test
DO $$
DECLARE v_admin_profile uuid;
BEGIN
  SELECT id INTO v_admin_profile FROM public.profiles
  WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  INSERT INTO public.devices (tenant_id, owner_profile_id)
  VALUES ((SELECT current_setting('g0.tenant_a'))::uuid, v_admin_profile)
  ON CONFLICT DO NOTHING;
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'gta';
DO $$
DECLARE v_dev uuid; v_status text;
BEGIN
  SELECT d.id INTO v_dev FROM public.devices d
  JOIN public.profiles p ON p.id = d.owner_profile_id
  WHERE p.user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' LIMIT 1;
  PERFORM public.revoke_device(v_dev);
  SELECT status INTO v_status FROM public.devices WHERE id = v_dev;
  IF v_status <> 'revoked' THEN RAISE EXCEPTION 'revoke failed'; END IF;

  BEGIN
    PERFORM public.revoke_device(
      (SELECT d.id FROM public.devices d
       JOIN public.profiles p ON p.id = d.owner_profile_id
       WHERE p.user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' LIMIT 1));
    RAISE EXCEPTION 'cross-revoke was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'cross-revoke was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 7. enrollment_tokens RPC-only: direct SELECT sees nothing, INSERT denied
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'gta';
DO $$
DECLARE c integer;
BEGIN
  -- RPC-only table: no grants at all -> hard denial at privilege layer
  BEGIN
    SELECT count(*) INTO c FROM public.enrollment_tokens;
    RAISE EXCEPTION 'tokens direct read was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.enrollment_tokens (tenant_id, user_profile_id, token_hash, expires_at)
    VALUES ((SELECT current_setting('g0.tenant_a'))::uuid,
            (SELECT id FROM public.profiles WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
            'direct', now());
    RAISE EXCEPTION 'direct token insert was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SELECT 'G0_GATE_ALL_GREEN' AS gate_result;
