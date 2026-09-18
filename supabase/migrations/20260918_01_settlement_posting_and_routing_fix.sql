-- Settlement hardening:
-- 1. Support settlement types exposed by the UI but missing from create_settlement.
-- 2. Ensure instrument-level cash entries are posted exactly once by the database.
-- 3. Keep client code from creating duplicate summary cash entries.

CREATE OR REPLACE FUNCTION public.create_settlement(
  p_settlement_type text,
  p_settlement_date date,
  p_amount numeric,
  p_reference text,
  p_remarks text,
  p_direction text,
  p_source_instrument_id uuid DEFAULT NULL,
  p_dest_instrument_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_number text;
  v_from text;
  v_to text;
  v_prefix text;
  v_cash_dir text;
  v_cash_label text;
  v_src_type text;
  v_dst_type text;
  v_src_balance numeric;
  v_opening numeric;
  v_seed date;
  v_mov numeric;
  v_account_mov numeric;
  v_resolved_source_id uuid := p_source_instrument_id;
  v_resolved_dest_id uuid := p_dest_instrument_id;
  v_source_portal_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_back_office() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_settlement_date IS NULL THEN RAISE EXCEPTION 'Date is required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  CASE p_settlement_type
    WHEN 'aeps_to_bank' THEN v_from:='aeps'; v_to:='bank'; v_prefix:='ATB';
    WHEN 'bank_to_aeps' THEN v_from:='bank'; v_to:='aeps'; v_prefix:='BTA';
    WHEN 'bank_to_dmt' THEN v_from:='bank'; v_to:='dmt'; v_prefix:='BTD';
    WHEN 'wallet_to_dmt' THEN v_from:='wallet'; v_to:='dmt'; v_prefix:='WTD';
    WHEN 'upi_qr_to_wallet' THEN v_from:='upi_qr'; v_to:='wallet'; v_prefix:='UQW';
    WHEN 'upi_qr_to_bank' THEN v_from:='upi_qr'; v_to:='bank'; v_prefix:='UQB';
    WHEN 'wallet_to_bank' THEN v_from:='wallet'; v_to:='bank'; v_prefix:='WTB';
    WHEN 'bank_to_recharge' THEN v_from:='bank'; v_to:='recharge'; v_prefix:='BTR';
    WHEN 'recharge_to_bank' THEN v_from:='recharge'; v_to:='bank'; v_prefix:='RTB';
    WHEN 'bank_to_credit_card' THEN v_from:='bank'; v_to:='credit_card'; v_prefix:='BTCC';
    WHEN 'cash_to_credit_card' THEN v_from:='cash'; v_to:='credit_card'; v_prefix:='CTCC';
    WHEN 'bank_withdrawal' THEN v_from:='bank'; v_to:='cash'; v_prefix:='BWD'; v_cash_dir:='in'; v_cash_label:='Bank Withdrawal';
    WHEN 'add_cash_to_bank' THEN v_from:='cash'; v_to:='bank'; v_prefix:='CTB'; v_cash_dir:='out'; v_cash_label:='Cash to Bank';
    WHEN 'cash_adjustment' THEN
      IF p_direction NOT IN ('in','out') THEN RAISE EXCEPTION 'Select Add Cash or Remove Cash'; END IF;
      v_from:='cash'; v_to:='cash'; v_prefix:='CAD'; v_cash_dir:=p_direction;
      v_cash_label:=CASE WHEN p_direction='in' THEN 'Cash Added' ELSE 'Cash Removed' END;
    WHEN 'bank_to_wallet' THEN v_from:='bank'; v_to:='wallet'; v_prefix:='BTW';
    ELSE RAISE EXCEPTION 'Invalid settlement type';
  END CASE;

  IF p_settlement_type='aeps_to_bank' THEN
    IF p_source_instrument_id IS NULL THEN RAISE EXCEPTION 'AEPS settlement requires a source portal'; END IF;
    SELECT ap.id, ap.payment_instrument_id INTO v_source_portal_id, v_resolved_source_id
    FROM public.aeps_portals ap WHERE ap.id=p_source_instrument_id AND ap.is_active=true;
    IF v_resolved_source_id IS NULL THEN
      SELECT ap.id, ap.payment_instrument_id INTO v_source_portal_id, v_resolved_source_id
      FROM public.aeps_portals ap JOIN public.payment_instruments pi ON pi.id=ap.payment_instrument_id
      WHERE ap.payment_instrument_id=p_source_instrument_id AND ap.is_active=true AND pi.is_active=true
      ORDER BY ap.created_at ASC LIMIT 1;
    END IF;
    IF v_resolved_source_id IS NULL THEN RAISE EXCEPTION 'AEPS portal is not mapped to a payment instrument'; END IF;
  ELSIF p_settlement_type IN ('bank_to_dmt','wallet_to_dmt') THEN
    IF p_dest_instrument_id IS NULL THEN RAISE EXCEPTION 'DMT settlement requires a destination portal'; END IF;
    SELECT ap.payment_instrument_id INTO v_resolved_dest_id FROM public.aeps_portals ap
    WHERE ap.id=p_dest_instrument_id AND ap.is_active=true;
    IF v_resolved_dest_id IS NULL THEN
      SELECT ap.payment_instrument_id INTO v_resolved_dest_id
      FROM public.aeps_portals ap JOIN public.payment_instruments pi ON pi.id=ap.payment_instrument_id
      WHERE ap.payment_instrument_id=p_dest_instrument_id AND ap.is_active=true AND pi.is_active=true
      ORDER BY ap.created_at ASC LIMIT 1;
    END IF;
    IF v_resolved_dest_id IS NULL THEN RAISE EXCEPTION 'DMT portal is not mapped to a payment instrument'; END IF;
  ELSIF p_settlement_type IN ('upi_qr_to_bank','upi_qr_to_wallet') THEN
    IF p_source_instrument_id IS NULL THEN RAISE EXCEPTION 'UPI QR settlement requires a source QR'; END IF;
    SELECT q.payment_instrument_id INTO v_resolved_source_id FROM public.upi_merchant_qrs q
    WHERE q.id=p_source_instrument_id AND q.is_active=true;
    IF v_resolved_source_id IS NULL THEN
      SELECT q.payment_instrument_id INTO v_resolved_source_id
      FROM public.upi_merchant_qrs q JOIN public.payment_instruments pi ON pi.id=q.payment_instrument_id
      WHERE q.payment_instrument_id=p_source_instrument_id AND q.is_active=true AND pi.is_active=true
      ORDER BY q.created_at ASC LIMIT 1;
    END IF;
    IF v_resolved_source_id IS NULL THEN RAISE EXCEPTION 'UPI QR is not mapped to a payment instrument'; END IF;
  END IF;

  IF v_resolved_source_id IS NOT NULL THEN
    SELECT type INTO v_src_type FROM public.payment_instruments WHERE id=v_resolved_source_id AND is_active=true;
    IF v_src_type IS NULL THEN RAISE EXCEPTION 'Resolved source instrument not found or inactive'; END IF;
  END IF;
  IF v_resolved_dest_id IS NOT NULL THEN
    SELECT type INTO v_dst_type FROM public.payment_instruments WHERE id=v_resolved_dest_id AND is_active=true;
    IF v_dst_type IS NULL THEN RAISE EXCEPTION 'Resolved destination instrument not found or inactive'; END IF;
  END IF;

  IF v_from <> v_to AND v_from IN ('bank','wallet','dmt','aeps','upi_qr','recharge','cash') THEN
    SELECT s.opening,s.seed_date INTO v_opening,v_seed FROM public.get_pool_seed(v_from,p_settlement_date) s;
    v_mov:=public.get_pool_movements(v_from,coalesce(v_seed,'0001-01-01'::date),p_settlement_date);
    v_src_balance:=coalesce(v_opening,0)+coalesce(v_mov,0);
    IF v_src_balance < p_amount THEN RAISE EXCEPTION 'Insufficient source % balance: available=%, required=%',v_from,v_src_balance,p_amount; END IF;
  ELSIF p_settlement_type='cash_adjustment' AND p_direction='out' THEN
    SELECT s.opening,s.seed_date INTO v_opening,v_seed FROM public.get_pool_seed('cash',p_settlement_date) s;
    v_mov:=public.get_pool_movements('cash',coalesce(v_seed,'0001-01-01'::date),p_settlement_date);
    v_src_balance:=coalesce(v_opening,0)+coalesce(v_mov,0);
    IF v_src_balance < p_amount THEN RAISE EXCEPTION 'Insufficient cash balance: available=%, required=%',v_src_balance,p_amount; END IF;
  END IF;

  IF p_settlement_type='aeps_to_bank' THEN
    SELECT ob.amount, ob.as_of INTO v_opening, v_seed FROM public.opening_balances ob
    WHERE ob.instrument_id=v_resolved_source_id AND ob.as_of <= p_settlement_date
    ORDER BY ob.as_of DESC, ob.created_at DESC LIMIT 1;
    v_opening:=coalesce(v_opening,0); v_seed:=coalesce(v_seed,'0001-01-01'::date);
    SELECT coalesce(sum(coalesce(t.pool_credit,0)-coalesce(t.pool_out,0)),0) INTO v_account_mov
    FROM public.transactions t WHERE t.service_type='aeps' AND t.portal_id=v_source_portal_id AND t.status='success'
      AND t.transaction_date >= v_seed AND t.transaction_date <= p_settlement_date;
    SELECT coalesce(v_account_mov,0)+coalesce(sum(CASE WHEN s.source_instrument_id=v_resolved_source_id THEN -s.amount WHEN s.dest_instrument_id=v_resolved_source_id THEN s.amount ELSE 0 END),0)
      INTO v_account_mov FROM public.settlements s WHERE s.status='success' AND s.settlement_date >= v_seed AND s.settlement_date <= p_settlement_date
      AND (s.source_instrument_id=v_resolved_source_id OR s.dest_instrument_id=v_resolved_source_id);
    v_src_balance:=v_opening+coalesce(v_account_mov,0);
    IF v_src_balance < p_amount THEN RAISE EXCEPTION 'Insufficient AEPS account balance: available=%, required=%',v_src_balance,p_amount; END IF;
  END IF;

  IF v_resolved_source_id IS NULL OR v_resolved_dest_id IS NULL THEN
    RAISE EXCEPTION 'Settlement requires both source and destination payment instruments';
  END IF;
  IF p_settlement_type='cash_adjustment' AND v_resolved_source_id IS DISTINCT FROM v_resolved_dest_id THEN
    RAISE EXCEPTION 'Cash adjustment must use one canonical Cash account';
  END IF;
  IF p_settlement_type<>'cash_adjustment' AND v_resolved_source_id=v_resolved_dest_id THEN
    RAISE EXCEPTION 'Source and destination instruments must be different';
  END IF;

  IF v_from <= v_to THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('erp:financial-pool:'||v_from,0));
    IF v_to<>v_from THEN PERFORM pg_advisory_xact_lock(hashtextextended('erp:financial-pool:'||v_to,0)); END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('erp:financial-pool:'||v_to,0));
    PERFORM pg_advisory_xact_lock(hashtextextended('erp:financial-pool:'||v_from,0));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('erp:financial-instrument:'||v_resolved_source_id::text,0));
  IF v_resolved_dest_id IS DISTINCT FROM v_resolved_source_id THEN PERFORM pg_advisory_xact_lock(hashtextextended('erp:financial-instrument:'||v_resolved_dest_id::text,0)); END IF;

  v_number:=v_prefix||'-'||lpad(nextval('public.settlement_seq')::text,4,'0');
  INSERT INTO public.settlements(settlement_number,settlement_type,settlement_date,from_pool,to_pool,direction,amount,reference,remarks,status,created_by,source_instrument_id,dest_instrument_id)
  VALUES(v_number,p_settlement_type,p_settlement_date,v_from,v_to,CASE WHEN p_settlement_type='cash_adjustment' THEN v_cash_dir ELSE NULL END,p_amount,nullif(p_reference,''),p_remarks,'success',auth.uid(),v_resolved_source_id,v_resolved_dest_id)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs(user_id,user_name,action,entity,entity_id,description,details)
  VALUES(auth.uid(),null,'settlement_created','settlements',v_id::text,'Settlement '||v_number||' '||v_from||' -> '||v_to||' of '||p_amount,
    jsonb_build_object('type',p_settlement_type,'amount',p_amount,'reference',p_reference,'source_instrument_id',v_resolved_source_id,'dest_instrument_id',v_resolved_dest_id));
  RETURN jsonb_build_object('id',v_id,'settlement_number',v_number,'status','success');
END;
$$;

-- The posting function was present but no trigger invoked it. Install one.
DROP TRIGGER IF EXISTS trg_sync_settlement_instrument_movements ON public.settlements;
CREATE TRIGGER trg_sync_settlement_instrument_movements
AFTER INSERT ON public.settlements
FOR EACH ROW EXECUTE FUNCTION public.sync_settlement_instrument_movements();

REVOKE ALL ON FUNCTION public.create_settlement(text,date,numeric,text,text,text,uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_settlement(text,date,numeric,text,text,text,uuid,uuid) TO authenticated, service_role;
