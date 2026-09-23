-- ============================================================================
-- G10 EXIT GATE — fails (RAISE EXCEPTION, nonzero exit) on any mismatch.
-- Requires: G0-G9 applied. Run with ON_ERROR_STOP=1. Local test DB only.
-- Run-unique tag isolates reruns (audit rows are immutable and persist).
-- ============================================================================

SELECT id AS g10t FROM public.tenants
WHERE name = 'CyberCafe & Digital Services ERP' LIMIT 1 \gset
SELECT set_config('g10.tenant', :'g10t', false);
SELECT set_config('g10.tag', 'g10-' || (extract(epoch FROM clock_timestamp())::bigint)::text, false);
SELECT set_config('g10.start', now()::text, false);

-- --------------------------------------------------------------------------
-- 0. Policy seeds verified; fixtures planted (as owner)
-- --------------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.retention_policies
  WHERE entity = 'audit_logs' AND retain_days = 2555 AND archive_first;
  IF n <> 1 THEN RAISE EXCEPTION 'audit tier wrong'; END IF;
  SELECT count(*) INTO n FROM public.retention_policies
  WHERE entity = 'idempotency_keys' AND retain_days = 730 AND NOT archive_first;
  IF n <> 1 THEN RAISE EXCEPTION 'key tier wrong'; END IF;
  BEGIN
    INSERT INTO public.retention_policies (entity, retain_days, archive_first, note)
    VALUES ('journal_entries', 30, false, 'probe');
    RAISE EXCEPTION 'journal tier was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'journal tier was NOT blocked' THEN RAISE; END IF;
  END;

  -- aged audit (8y, archivable), held aged audit, recent audit
  INSERT INTO public.audit_logs
    (tenant_id, action, entity, description, created_at)
  VALUES ((SELECT current_setting('g10.tenant'))::uuid, 'g10-probe', 'gates',
    (SELECT current_setting('g10.tag')) || '-aged',
    now() - interval '8 years');
  INSERT INTO public.audit_logs
    (tenant_id, action, entity, description, created_at)
  VALUES ((SELECT current_setting('g10.tenant'))::uuid, 'g10-probe', 'gates',
    (SELECT current_setting('g10.tag')) || '-held',
    now() - interval '8 years');
  INSERT INTO public.audit_logs
    (tenant_id, action, entity, description, created_at)
  VALUES ((SELECT current_setting('g10.tenant'))::uuid, 'g10-probe', 'gates',
    (SELECT current_setting('g10.tag')) || '-recent',
    now() - interval '1 hour');
  -- aged key (3y, purgable), held aged key, recent key
  INSERT INTO public.idempotency_keys (tenant_id, scope, key, created_at)
  VALUES ((SELECT current_setting('g10.tenant'))::uuid, 'g10', (SELECT current_setting('g10.tag')) || '-oldkey', now() - interval '3 years'),
         ((SELECT current_setting('g10.tenant'))::uuid, 'g10', (SELECT current_setting('g10.tag')) || '-heldkey', now() - interval '3 years'),
         ((SELECT current_setting('g10.tenant'))::uuid, 'g10', (SELECT current_setting('g10.tag')) || '-newkey', now() - interval '1 hour');
END
$$;

-- --------------------------------------------------------------------------
-- 1. Holds: admin set/release; staff denied; validation; double rules
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g10t';
DO $$
DECLARE v_aid uuid;
BEGIN
  SELECT id INTO v_aid FROM public.audit_logs
  WHERE description = (SELECT current_setting('g10.tag')) || '-held';
  PERFORM public.set_legal_hold('audit_logs', v_aid, NULL, 'g10 test hold');
  BEGIN
    PERFORM public.set_legal_hold('audit_logs', v_aid, NULL, 'g10 duplicate');
    RAISE EXCEPTION 'duplicate hold was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'duplicate hold was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_legal_hold('invoices', v_aid, NULL, 'g10 bad entity');
    RAISE EXCEPTION 'bad entity hold was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'bad entity hold was NOT rejected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_legal_hold('audit_logs', v_aid, 'also-key', 'g10 both refs');
    RAISE EXCEPTION 'dual-ref hold was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'dual-ref hold was NOT rejected' THEN RAISE; END IF;
  END;
  -- key-identity hold on the held key row
  PERFORM public.set_legal_hold('idempotency_keys', NULL,
    'g10:' || (SELECT current_setting('g10.tag')) || '-heldkey', 'g10 key hold');
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g10t';
DO $$
BEGIN
  BEGIN
    PERFORM public.set_legal_hold('audit_logs', gen_random_uuid(), NULL, 'g10 staff try');
    RAISE EXCEPTION 'staff hold was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff hold was NOT blocked' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.release_legal_hold('audit_logs', gen_random_uuid(), NULL);
    RAISE EXCEPTION 'staff release was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff release was NOT blocked' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.run_retention_purge(true);
    RAISE EXCEPTION 'staff purge was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'staff purge was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 2. Dry run: counts reported, nothing changed
-- --------------------------------------------------------------------------
DO $$
DECLARE v_exp integer;
BEGIN
  -- keys table is RPC-only: expected count captured as owner
  SELECT count(*) INTO v_exp FROM public.idempotency_keys k
  WHERE k.tenant_id = (SELECT current_setting('g10.tenant'))::uuid
    AND k.created_at < now() - interval '2 years'
    AND NOT EXISTS (SELECT 1 FROM public.legal_holds h
                    WHERE h.entity_type = 'idempotency_keys'
                      AND h.entity_key = k.scope || ':' || k.key
                      AND h.released_at IS NULL);
  PERFORM set_config('g10.expkeys', v_exp::text, false);
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g10t';
DO $$
DECLARE
  v_out jsonb; v_rep integer; v_exp integer;
BEGIN
  v_out := public.run_retention_purge(true);
  -- dry counts must exactly match independent recomputation (rerun-safe:
  -- prior runs' rows count on both sides)
  SELECT count(*) INTO v_exp FROM public.audit_logs a
  WHERE a.tenant_id = (SELECT current_setting('g10.tenant'))::uuid
    AND a.created_at < now() - interval '7 years'
    AND NOT EXISTS (SELECT 1 FROM public.legal_holds h
                    WHERE h.entity_type = 'audit_logs' AND h.entity_id = a.id
                      AND h.released_at IS NULL);
  SELECT coalesce(sum((x->>'archived')::integer), 0) INTO v_rep
  FROM jsonb_array_elements(v_out) x
  WHERE (x->>'entity') = 'audit_logs'
    AND (x->>'tenant_id') = (SELECT current_setting('g10.tenant'))::text;
  IF v_exp = 0 THEN RAISE EXCEPTION 'no archivable rows for dry check'; END IF;
  IF v_rep <> v_exp THEN
    RAISE EXCEPTION 'dry audit % <> expected %', v_rep, v_exp;
  END IF;
  SELECT coalesce(sum((x->>'purged')::integer), 0) INTO v_rep
  FROM jsonb_array_elements(v_out) x
  WHERE (x->>'entity') = 'idempotency_keys'
    AND (x->>'tenant_id') = (SELECT current_setting('g10.tenant'))::text;
  SELECT (SELECT current_setting('g10.expkeys'))::integer INTO v_exp;
  IF v_exp = 0 THEN RAISE EXCEPTION 'no purgable keys for dry check'; END IF;
  IF v_rep <> v_exp THEN
    RAISE EXCEPTION 'dry keys % <> expected %', v_rep, v_exp;
  END IF;
  PERFORM 1 FROM public.audit_logs
  WHERE description LIKE (SELECT current_setting('g10.tag')) || '%';
  IF NOT FOUND THEN RAISE EXCEPTION 'dry run deleted rows'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 3. Real run (admin): archive + purge exactly the eligible rows
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g10t';
DO $$
DECLARE
  v_out jsonb; v_live integer; v_arch integer; v_key integer; v_held integer;
  v_journals integer; v_log integer;
BEGIN
  SELECT count(*) INTO v_journals FROM public.journal_entries;
  v_out := public.run_retention_purge(false);
  -- aged audit archived (live gone, archive present with same id + data)
  SELECT count(*) INTO v_live FROM public.audit_logs
  WHERE description = (SELECT current_setting('g10.tag')) || '-aged';
  IF v_live <> 0 THEN RAISE EXCEPTION 'aged audit not archived'; END IF;
  SELECT count(*) INTO v_arch FROM public.audit_archive
  WHERE description = (SELECT current_setting('g10.tag')) || '-aged';
  IF v_arch <> 1 THEN RAISE EXCEPTION 'archive row missing'; END IF;
  -- held aged audit skipped
  SELECT count(*) INTO v_held FROM public.audit_logs
  WHERE description = (SELECT current_setting('g10.tag')) || '-held';
  IF v_held <> 1 THEN RAISE EXCEPTION 'held audit purged'; END IF;
  -- recent retained
  SELECT count(*) INTO v_live FROM public.audit_logs
  WHERE description = (SELECT current_setting('g10.tag')) || '-recent';
  IF v_live <> 1 THEN RAISE EXCEPTION 'recent audit purged'; END IF;
  -- aged key purged, held key skipped, recent key kept
  -- (keys table is RPC-only: counts captured as owner below, asserted after)
  -- purge log written per tenant+entity with actor + dry_run false
  SELECT count(*) INTO v_log FROM public.purge_log
  WHERE created_at >= (SELECT current_setting('g10.start'))::timestamptz
    AND dry_run = false AND actor_label = 'admin';
  IF v_log < 2 THEN RAISE EXCEPTION 'purge log incomplete: %', v_log; END IF;
  -- idempotent rerun purges nothing new
  v_out := public.run_retention_purge(false);
  SELECT coalesce(sum((x->>'archived')::integer + (x->>'purged')::integer), 0)
  INTO v_live FROM jsonb_array_elements(v_out) x
  WHERE (x->>'tenant_id') = (SELECT current_setting('g10.tenant'))::text;
  IF v_live <> 0 THEN RAISE EXCEPTION 'rerun purged % rows', v_live; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- key states captured as owner (keys table is RPC-only for app roles)
DO $$
DECLARE v_old integer; v_held integer; v_new integer;
BEGIN
  SELECT count(*) INTO v_old FROM public.idempotency_keys
  WHERE key = (SELECT current_setting('g10.tag')) || '-oldkey';
  SELECT count(*) INTO v_held FROM public.idempotency_keys
  WHERE key = (SELECT current_setting('g10.tag')) || '-heldkey';
  SELECT count(*) INTO v_new FROM public.idempotency_keys
  WHERE key = (SELECT current_setting('g10.tag')) || '-newkey';
  IF v_old <> 0 THEN RAISE EXCEPTION 'aged key not purged'; END IF;
  IF v_held <> 1 THEN RAISE EXCEPTION 'held key purged'; END IF;
  IF v_new <> 1 THEN RAISE EXCEPTION 'recent key purged'; END IF;
END
$$;

-- --------------------------------------------------------------------------
-- 4. Release hold -> next purge takes the row; service_role job path
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g10t';
DO $$
DECLARE v_live integer;
BEGIN
  PERFORM public.release_legal_hold('audit_logs',
    (SELECT id FROM public.audit_logs
     WHERE description = (SELECT current_setting('g10.tag')) || '-held'),
    NULL);
  PERFORM public.run_retention_purge(false);
  SELECT count(*) INTO v_live FROM public.audit_logs
  WHERE description = (SELECT current_setting('g10.tag')) || '-held';
  IF v_live <> 0 THEN RAISE EXCEPTION 'released hold row not purged'; END IF;
  BEGIN
    PERFORM public.release_legal_hold('audit_logs', gen_random_uuid(), NULL);
    RAISE EXCEPTION 'empty release was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'empty release was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

SET ROLE service_role;
SET request.jwt.claim.role = 'service_role';
DO $$
DECLARE v_out jsonb;
BEGIN
  v_out := public.run_retention_purge(true);
  IF v_out IS NULL THEN RAISE EXCEPTION 'job dry run failed'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.role;

-- --------------------------------------------------------------------------
-- 5. RLS: back-office reads; others see nothing; direct DML denied
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g10t';
DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM public.retention_policies;
  IF c <> 0 THEN RAISE EXCEPTION 'staff sees policies'; END IF;
  SELECT count(*) INTO c FROM public.legal_holds;
  IF c <> 0 THEN RAISE EXCEPTION 'staff sees holds'; END IF;
  SELECT count(*) INTO c FROM public.purge_log;
  IF c <> 0 THEN RAISE EXCEPTION 'staff sees purge log'; END IF;
  BEGIN
    INSERT INTO public.legal_holds (tenant_id, entity_type, entity_id, reason, set_by_profile)
    VALUES (current_setting('request.jwt.claim.tenant_id')::uuid, 'audit_logs',
      gen_random_uuid(), 'x',
      (SELECT id FROM public.profiles WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'));
    RAISE EXCEPTION 'staff hold insert was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.purge_log SET reason = 'x' WHERE reason LIKE 'g10-%';
    RAISE EXCEPTION 'staff log update was NOT blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.audit_archive WHERE description LIKE 'g10-%';
    RAISE EXCEPTION 'staff archive delete was NOT blocked';
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
  SELECT count(*) INTO c FROM public.legal_holds;
  IF c <> 0 THEN RAISE EXCEPTION 'outsider sees holds'; END IF;
  SELECT count(*) INTO c FROM public.purge_log;
  IF c <> 0 THEN RAISE EXCEPTION 'outsider sees purge log'; END IF;
  SELECT count(*) INTO c FROM public.audit_archive;
  IF c <> 0 THEN RAISE EXCEPTION 'outsider sees archive'; END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub;

-- --------------------------------------------------------------------------
-- 6. Teardown test rows (audit rows persist: immutable by design)
-- --------------------------------------------------------------------------
DO $$
BEGIN
  DELETE FROM public.legal_holds WHERE reason LIKE 'g10 %';
  DELETE FROM public.idempotency_keys WHERE key LIKE 'g10-%';
  DELETE FROM public.audit_archive WHERE description LIKE (SELECT current_setting('g10.tag')) || '%';
END
$$;

SELECT 'G10_GATE_ALL_GREEN' AS gate_result;
