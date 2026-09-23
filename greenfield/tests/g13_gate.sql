-- ============================================================================
-- G13 EXIT GATE — lock-conflict matrix + transition-guard verification.
-- Requires: G0-G12 applied. Run with ON_ERROR_STOP=1. Local test DB only.
-- Proves: illegal status transitions raise at constraint layer (even owner);
-- legitimate RPC paths unaffected; lock matrix enforced live.
-- ============================================================================

SELECT id AS g13t FROM public.tenants
WHERE name = 'CyberCafe & Digital Services ERP' LIMIT 1 \gset
SELECT set_config('g13.tenant', :'g13t', false);

-- --------------------------------------------------------------------------
-- 0. Fixtures: product + approval + claim + parked suspense row
-- --------------------------------------------------------------------------
-- cleanup-first runs as owner (app roles have no direct DML grants)
DO $$
BEGIN
  DELETE FROM public.suspense_records
  WHERE batch_id IN (SELECT id FROM public.back_entry_batches
                     WHERE batch_key LIKE 'g13-%');
  DELETE FROM public.back_entry_lines WHERE batch_id IN
    (SELECT id FROM public.back_entry_batches WHERE batch_key LIKE 'g13-%');
  DELETE FROM public.payment_claims
  WHERE tenant_id = (SELECT current_setting('g13.tenant'))::uuid
    AND customer_id IS NULL AND invoice_id IS NULL AND method = 'cash'
    AND amount = 10 AND service_transaction_id IS NULL;
  DELETE FROM public.back_entry_batches WHERE batch_key LIKE 'g13-%';
  DELETE FROM public.back_entry_lock
  WHERE tenant_id = (SELECT current_setting('g13.tenant'))::uuid;
  DELETE FROM public.stock_reservations WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g13-%' OR s.name LIKE 'G13 %');
  DELETE FROM public.adjustments WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g13-%' OR s.name LIKE 'G13 %');
  DELETE FROM public.purchase_lines WHERE purchase_id IN
    (SELECT p.id FROM public.purchases p
     JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE s.name LIKE 'G13 %');
  DELETE FROM public.stock_lots
  WHERE source_ref LIKE 'g13-%'
     OR purchase_id IN (SELECT p.id FROM public.purchases p
                        JOIN public.suppliers s ON s.id = p.supplier_id
                        WHERE s.name LIKE 'G13 %');
  DELETE FROM public.purchases WHERE supplier_id IN
    (SELECT id FROM public.suppliers WHERE name LIKE 'G13 %');
  DELETE FROM public.idempotency_keys WHERE key LIKE 'g13-%';
  DELETE FROM public.products WHERE name LIKE 'G13 %';
  DELETE FROM public.approvals WHERE scope_hash LIKE 'g13-%';
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g13t';
DO $$
DECLARE v_prod uuid; v_appr uuid; v_claim jsonb; v_batch jsonb; v_sup uuid;
BEGIN
  v_sup := public.mg_supplier_upsert(NULL, 'G13 Supplier', NULL, true);
  v_prod := public.mg_product_upsert(NULL, 'G13 Widget', 'G13W-1', 'G13W-BAR-1',
    'pc', 100, 60, 'GENERAL', true);
  PERFORM set_config('g13.product', v_prod::text, false);
  PERFORM public.create_purchase(
    v_sup,
    CURRENT_DATE,
    jsonb_build_array(jsonb_build_object('product_id', v_prod,
      'qty', 50, 'unit_cost', 10, 'expiry_date', '2028-01-01',
      'source_ref', 'g13-stock-fixture')),
    'g13-stock-fixture-key');
  v_appr := public.request_approval('g13-appr-1', 'discount', NULL,
    'discount', '{}'::jsonb, 'g13 transition probe');
  PERFORM set_config('g13.approval', v_appr::text, false);
  v_claim := public.record_claim(NULL, NULL, 'cash', 10,
    (SELECT id FROM public.payment_instruments
     WHERE tenant_id = (SELECT current_setting('g13.tenant'))::uuid
       AND itype = 'cash' AND is_active LIMIT 1),
    'g13-claim-1');
  PERFORM set_config('g13.claim', (v_claim->>'id'), false);
  v_batch := public.submit_back_entry_batch('g13-susp-1', 'g13 suspense probe',
    jsonb_build_array(
      jsonb_build_object('line_type','purchase','source_ref','g13-susp-src',
        'business_date','2025-08-01','product_id', v_prod,
        'qty', 2, 'unit_cost', 10, 'expiry_date','2027-01-01')));
  PERFORM set_config('g13.suspbatch', (v_batch->>'id'), false);
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 1. Illegal transitions raise at constraint layer (even as owner)
-- --------------------------------------------------------------------------
DO $$
BEGIN
  -- approvals: touch while pending (no status change still constrained)
  BEGIN
    UPDATE public.approvals SET reason = 'g13 probe'
    WHERE id = (SELECT current_setting('g13.approval'))::uuid;
    RAISE EXCEPTION 'pending touch was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'pending touch was NOT blocked' THEN RAISE; END IF;
  END;
  -- claims: recorded -> recorded touch blocked
  BEGIN
    UPDATE public.payment_claims SET amount = amount
    WHERE id = (SELECT current_setting('g13.claim'))::uuid;
    RAISE EXCEPTION 'recorded touch was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'recorded touch was NOT blocked' THEN RAISE; END IF;
  END;
  -- suspense: parked -> parked touch blocked
  BEGIN
    UPDATE public.suspense_records SET reason = reason
    WHERE batch_id = (SELECT current_setting('g13.suspbatch'))::uuid;
    RAISE EXCEPTION 'parked touch was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'parked touch was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;

-- --------------------------------------------------------------------------
-- 2. Legitimate RPC paths still work through the guards
-- --------------------------------------------------------------------------
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g13t';
DO $$
DECLARE v_r jsonb;
BEGIN
  v_r := public.approve_override((SELECT current_setting('g13.approval'))::uuid);
  IF (v_r->>'status') <> 'consumed' THEN RAISE EXCEPTION 'approve broke'; END IF;
  v_r := public.recognize_claim(
    (SELECT current_setting('g13.claim'))::uuid, 'g13-rec-1');
  IF (v_r->>'state') <> 'recognized' THEN RAISE EXCEPTION 'recognize broke'; END IF;
  -- consumed -> pending reopen attempt now denied at constraint layer
  BEGIN
    UPDATE public.approvals SET status = 'pending'
    WHERE id = (SELECT current_setting('g13.approval'))::uuid;
    RAISE EXCEPTION 'reopen was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'reopen was NOT blocked' THEN RAISE; END IF;
  END;
  -- recognized -> recorded rollback attempt denied
  BEGIN
    UPDATE public.payment_claims SET claim_state = 'recorded'
    WHERE id = (SELECT current_setting('g13.claim'))::uuid;
    RAISE EXCEPTION 'claim rollback was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'claim rollback was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 3. Lock matrix, live: locked-period posting, double lock, stale epoch
-- --------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO public.period_locks (tenant_id, locked_date, locked_by_profile, reason)
  VALUES ((SELECT current_setting('g13.tenant'))::uuid, DATE '2025-04-15',
    (SELECT id FROM public.profiles WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    'g13 matrix probe')
  ON CONFLICT (tenant_id, locked_date) DO NOTHING;
END
$$;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET request.jwt.claim.tenant_id = :'g13t';
DO $$
DECLARE n0 integer; n1 integer;
BEGIN
  SELECT count(*) INTO n0 FROM public.invoices;
  BEGIN
    PERFORM public.create_sale(NULL, DATE '2025-04-15',
      jsonb_build_array(jsonb_build_object('product_id',
        current_setting('g13.product'),
        'qty', 1, 'rate', 10)), 0, NULL, 'g13-locked-probe', 'g13-locked-key');
    RAISE EXCEPTION 'locked-period sale posted (must fail)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'locked-period sale posted (must fail)' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%locked period%' THEN
      RAISE EXCEPTION 'wrong rejection for locked date: %', SQLERRM;
    END IF;
  END;
  SELECT count(*) INTO n1 FROM public.invoices;
  IF n1 <> n0 THEN RAISE EXCEPTION 'locked posting left an invoice'; END IF;
  BEGIN
    PERFORM public.acquire_back_entry_lock('g13 matrix probe');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'first lock acquire failed: %', SQLERRM;
  END;
  BEGIN
    PERFORM public.acquire_back_entry_lock('g13 concurrent attempt');
    RAISE EXCEPTION 'double lock was NOT rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'double lock was NOT rejected' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- stale epoch via sync_flush on a fresh device
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SET request.jwt.claim.tenant_id = :'g13t';
DO $$
DECLARE v_tok text; v_dev uuid; v_f jsonb;
BEGIN
  v_tok := public.issue_enrollment_token();
  v_dev := public.consume_enrollment_token(v_tok);
  PERFORM set_config('g13.dev', v_dev::text, false);
  v_f := public.sync_flush(v_dev,
    jsonb_build_array(
      jsonb_build_object('seq', 1, 'device_epoch', 999,
        'client_uuid', gen_random_uuid(), 'idempotency_key', 'g13-stale-1',
        'doc_type', 'sale', 'payload', '{}'::jsonb)));
  IF (v_f->'results'->0->>'outcome') <> 'stale_epoch' THEN
    RAISE EXCEPTION 'stale epoch not detected: %', v_f;
  END IF;
END
$$;
RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.tenant_id;

-- --------------------------------------------------------------------------
-- 4. Posted immutability spot-checks (owner-level): journals, audit
-- --------------------------------------------------------------------------
DO $$
DECLARE v_eid uuid;
BEGIN
  SELECT e.id INTO v_eid FROM public.journal_entries e LIMIT 1;
  IF v_eid IS NOT NULL THEN
    BEGIN
      UPDATE public.journal_entries SET description = 'g13 probe' WHERE id = v_eid;
      RAISE EXCEPTION 'journal update was NOT blocked';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'journal update was NOT blocked' THEN RAISE; END IF;
    END;
  END IF;
  BEGIN
    UPDATE public.audit_logs SET description = 'g13 probe'
    WHERE id = (SELECT id FROM public.audit_logs LIMIT 1);
    IF NOT FOUND THEN
      RAISE NOTICE 'no audit rows to probe (acceptable)';
    ELSE
      RAISE EXCEPTION 'audit update was NOT blocked';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'audit update was NOT blocked' THEN RAISE; END IF;
  END;
END
$$;

-- --------------------------------------------------------------------------
-- 5. Teardown gate rows (journals stay immutable by design)
-- --------------------------------------------------------------------------
DO $$
BEGIN
  DELETE FROM public.sync_conflicts
  WHERE device_id = (SELECT current_setting('g13.dev'))::uuid;
  DELETE FROM public.devices
  WHERE id = (SELECT current_setting('g13.dev'))::uuid
    AND id NOT IN (SELECT device_id FROM public.stock_reservations WHERE device_id IS NOT NULL);
  DELETE FROM public.suspense_records
  WHERE batch_id IN (SELECT id FROM public.back_entry_batches
                     WHERE batch_key LIKE 'g13-%');
  DELETE FROM public.back_entry_lines WHERE batch_id IN
    (SELECT id FROM public.back_entry_batches WHERE batch_key LIKE 'g13-%');
  DELETE FROM public.payment_claims
  WHERE id = (SELECT current_setting('g13.claim'))::uuid;
  DELETE FROM public.back_entry_batches WHERE batch_key LIKE 'g13-%';
  DELETE FROM public.back_entry_lock
  WHERE tenant_id = (SELECT current_setting('g13.tenant'))::uuid;
  DELETE FROM public.period_locks
  WHERE tenant_id = (SELECT current_setting('g13.tenant'))::uuid
    AND locked_date = DATE '2025-04-15';
  DELETE FROM public.stock_reservations WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g13-%' OR l.source_ref LIKE 'aggregate:%'
        OR s.name LIKE 'G13 %');
  DELETE FROM public.adjustments WHERE lot_id IN
    (SELECT l.id FROM public.stock_lots l
     LEFT JOIN public.purchases p ON p.id = l.purchase_id
     LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE l.source_ref LIKE 'g13-%' OR l.source_ref LIKE 'aggregate:%'
        OR s.name LIKE 'G13 %');
  DELETE FROM public.purchase_lines WHERE purchase_id IN
    (SELECT p.id FROM public.purchases p
     JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE s.name LIKE 'G13 %');
  DELETE FROM public.stock_lots
  WHERE source_ref LIKE 'g13-%' OR source_ref LIKE 'aggregate:%'
     OR purchase_id IN (SELECT p.id FROM public.purchases p
                        JOIN public.suppliers s ON s.id = p.supplier_id
                        WHERE s.name LIKE 'G13 %');
  DELETE FROM public.purchases WHERE supplier_id IN
    (SELECT id FROM public.suppliers WHERE name LIKE 'G13 %');
  DELETE FROM public.idempotency_keys WHERE key LIKE 'g13-%';
  DELETE FROM public.products WHERE name LIKE 'G13 %';
  DELETE FROM public.approvals WHERE scope_hash LIKE 'g13-%';
END
$$;

SELECT 'G13_GATE_ALL_GREEN' AS gate_result;
