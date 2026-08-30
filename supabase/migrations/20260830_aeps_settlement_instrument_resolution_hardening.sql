-- ==============================================================================
-- AEPS SETTLEMENT INSTRUMENT RESOLUTION HARDENING
-- ==============================================================================
-- Fixes the settlement RPC contract so the AEPS source may be supplied either as
-- the AEPS portal UUID or as its already-resolved payment_instrument UUID.
-- Enforces account-level AEPS balance validation instead of aggregate-pool-only
-- validation. Existing opening balances and mappings are preserved.
-- ==============================================================================

create or replace function public.create_settlement(
  p_settlement_type text,
  p_settlement_date date,
  p_amount numeric,
  p_reference text,
  p_remarks text,
  p_direction text,
  p_source_instrument_id uuid default null,
  p_dest_instrument_id uuid default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
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
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_settlement_date is null then raise exception 'Date is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  case p_settlement_type
    when 'aeps_to_bank' then v_from:='aeps'; v_to:='bank'; v_prefix:='ATB';
    when 'bank_to_dmt' then v_from:='bank'; v_to:='dmt'; v_prefix:='BTD';
    when 'wallet_to_dmt' then v_from:='wallet'; v_to:='dmt'; v_prefix:='WTD';
    when 'upi_qr_to_wallet' then v_from:='upi_qr'; v_to:='wallet'; v_prefix:='UQW';
    when 'upi_qr_to_bank' then v_from:='upi_qr'; v_to:='bank'; v_prefix:='UQB';
    when 'wallet_to_bank' then v_from:='wallet'; v_to:='bank'; v_prefix:='WTB';
    when 'bank_to_recharge' then v_from:='bank'; v_to:='recharge'; v_prefix:='BTR';
    when 'recharge_to_bank' then v_from:='recharge'; v_to:='bank'; v_prefix:='RTB';
    when 'bank_withdrawal' then v_from:='bank'; v_to:='cash'; v_prefix:='BWD'; v_cash_dir:='in'; v_cash_label:='Bank Withdrawal';
    when 'add_cash_to_bank' then v_from:='cash'; v_to:='bank'; v_prefix:='CTB'; v_cash_dir:='out'; v_cash_label:='Cash to Bank';
    when 'cash_adjustment' then
      if p_direction not in ('in','out') then raise exception 'Select Add Cash or Remove Cash'; end if;
      v_from:='cash'; v_to:='cash'; v_prefix:='CAD'; v_cash_dir:=p_direction;
      v_cash_label:=case when p_direction='in' then 'Cash Added' else 'Cash Removed' end;
    when 'bank_to_wallet' then v_from:='bank'; v_to:='wallet'; v_prefix:='BTW';
    else raise exception 'Invalid settlement type';
  end case;

  -- Resolve provider selectors to their canonical payment instruments.
  -- Backward-compatible with callers that already send instrument_id.
  if p_settlement_type='aeps_to_bank' then
    if p_source_instrument_id is null then raise exception 'AEPS settlement requires a source portal'; end if;

    select ap.id, ap.payment_instrument_id
      into v_source_portal_id, v_resolved_source_id
    from public.aeps_portals ap
    where ap.id=p_source_instrument_id and ap.is_active=true;

    if v_resolved_source_id is null then
      select ap.id, ap.payment_instrument_id
        into v_source_portal_id, v_resolved_source_id
      from public.aeps_portals ap
      join public.payment_instruments pi on pi.id=ap.payment_instrument_id
      where ap.payment_instrument_id=p_source_instrument_id
        and ap.is_active=true
        and pi.is_active=true
      order by ap.created_at asc
      limit 1;
    end if;

    if v_resolved_source_id is null then
      raise exception 'AEPS portal is not mapped to a payment instrument';
    end if;

  elsif p_settlement_type in ('bank_to_dmt','wallet_to_dmt') then
    if p_dest_instrument_id is null then raise exception 'DMT settlement requires a destination portal'; end if;
    select ap.payment_instrument_id into v_resolved_dest_id
    from public.aeps_portals ap
    where ap.id=p_dest_instrument_id and ap.is_active=true;
    if v_resolved_dest_id is null then
      select ap.payment_instrument_id into v_resolved_dest_id
      from public.aeps_portals ap
      join public.payment_instruments pi on pi.id=ap.payment_instrument_id
      where ap.payment_instrument_id=p_dest_instrument_id
        and ap.is_active=true and pi.is_active=true
      order by ap.created_at asc limit 1;
    end if;
    if v_resolved_dest_id is null then raise exception 'DMT portal is not mapped to a payment instrument'; end if;

  elsif p_settlement_type in ('upi_qr_to_bank','upi_qr_to_wallet') then
    if p_source_instrument_id is null then raise exception 'UPI QR settlement requires a source QR'; end if;
    select q.payment_instrument_id into v_resolved_source_id
    from public.upi_merchant_qrs q
    where q.id=p_source_instrument_id and q.is_active=true;
    if v_resolved_source_id is null then
      select q.payment_instrument_id into v_resolved_source_id
      from public.upi_merchant_qrs q
      join public.payment_instruments pi on pi.id=q.payment_instrument_id
      where q.payment_instrument_id=p_source_instrument_id
        and q.is_active=true and pi.is_active=true
      order by q.created_at asc limit 1;
    end if;
    if v_resolved_source_id is null then raise exception 'UPI QR is not mapped to a payment instrument'; end if;
  end if;

  if v_resolved_source_id is not null then
    select type into v_src_type from public.payment_instruments where id=v_resolved_source_id and is_active=true;
    if v_src_type is null then raise exception 'Resolved source instrument not found or inactive'; end if;
  end if;
  if v_resolved_dest_id is not null then
    select type into v_dst_type from public.payment_instruments where id=v_resolved_dest_id and is_active=true;
    if v_dst_type is null then raise exception 'Resolved destination instrument not found or inactive'; end if;
  end if;

  if p_settlement_type='bank_to_wallet' then
    if v_resolved_source_id is null or v_resolved_dest_id is null then raise exception 'bank_to_wallet requires source bank and destination wallet instruments'; end if;
    if v_resolved_source_id=v_resolved_dest_id then raise exception 'Source and destination instruments must be different'; end if;
    if v_src_type not in ('bank','debit_card') then raise exception 'Source instrument type must be bank or debit_card'; end if;
    if v_dst_type <> 'wallet' then raise exception 'Destination instrument type must be wallet'; end if;
  end if;

  -- Serialize financial writes by pool and selected instrument.
  if v_from <= v_to then
    perform pg_advisory_xact_lock(hashtextextended('erp:financial-pool:'||v_from,0));
    if v_to <> v_from then perform pg_advisory_xact_lock(hashtextextended('erp:financial-pool:'||v_to,0)); end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('erp:financial-pool:'||v_to,0));
    perform pg_advisory_xact_lock(hashtextextended('erp:financial-pool:'||v_from,0));
  end if;
  if v_resolved_source_id is not null then perform pg_advisory_xact_lock(hashtextextended('erp:financial-instrument:'||v_resolved_source_id::text,0)); end if;
  if v_resolved_dest_id is not null and v_resolved_dest_id is distinct from v_resolved_source_id then perform pg_advisory_xact_lock(hashtextextended('erp:financial-instrument:'||v_resolved_dest_id::text,0)); end if;

  -- Aggregate pool guard remains in place for every real source pool.
  if v_from <> v_to and v_from in ('bank','wallet','dmt','aeps','upi_qr','recharge','cash') then
    select s.opening,s.seed_date into v_opening,v_seed from public.get_pool_seed(v_from,p_settlement_date) s;
    v_mov:=public.get_pool_movements(v_from,coalesce(v_seed,'0001-01-01'::date),p_settlement_date);
    v_src_balance:=coalesce(v_opening,0)+coalesce(v_mov,0);
    if v_src_balance < p_amount then raise exception 'Insufficient source % balance: available=%, required=%',v_from,v_src_balance,p_amount; end if;
  elsif p_settlement_type='cash_adjustment' and p_direction='out' then
    select s.opening,s.seed_date into v_opening,v_seed from public.get_pool_seed('cash',p_settlement_date) s;
    v_mov:=public.get_pool_movements('cash',coalesce(v_seed,'0001-01-01'::date),p_settlement_date);
    v_src_balance:=coalesce(v_opening,0)+coalesce(v_mov,0);
    if v_src_balance < p_amount then raise exception 'Insufficient cash balance: available=%, required=%',v_src_balance,p_amount; end if;
  end if;

  -- AEPS must also pass the selected-provider account-level guard.
  if p_settlement_type='aeps_to_bank' then
    select ob.amount, ob.as_of
      into v_opening, v_seed
    from public.opening_balances ob
    where ob.instrument_id=v_resolved_source_id
      and ob.as_of <= p_settlement_date
    order by ob.as_of desc, ob.created_at desc
    limit 1;

    v_opening := coalesce(v_opening,0);
    v_seed := coalesce(v_seed,'0001-01-01'::date);

    select coalesce(sum(coalesce(t.pool_credit,0)-coalesce(t.pool_out,0)),0)
      into v_account_mov
    from public.transactions t
    where t.service_type='aeps'
      and t.portal_id=v_source_portal_id
      and t.status='success'
      and t.transaction_date >= v_seed
      and t.transaction_date <= p_settlement_date;

    select coalesce(v_account_mov,0) + coalesce(sum(
      case
        when s.source_instrument_id=v_resolved_source_id then -s.amount
        when s.dest_instrument_id=v_resolved_source_id then s.amount
        else 0
      end
    ),0)
      into v_account_mov
    from public.settlements s
    where s.status='success'
      and s.settlement_date >= v_seed
      and s.settlement_date <= p_settlement_date
      and (s.source_instrument_id=v_resolved_source_id or s.dest_instrument_id=v_resolved_source_id);

    v_src_balance := v_opening + coalesce(v_account_mov,0);
    if v_src_balance < p_amount then
      raise exception 'Insufficient AEPS account balance: available=%, required=%',v_src_balance,p_amount;
    end if;
  end if;

  v_number:=v_prefix||'-'||lpad(nextval('public.settlement_seq')::text,4,'0');
  insert into public.settlements(
    settlement_number,settlement_type,settlement_date,from_pool,to_pool,direction,amount,reference,remarks,status,created_by,source_instrument_id,dest_instrument_id
  ) values(
    v_number,p_settlement_type,p_settlement_date,v_from,v_to,v_cash_dir,p_amount,nullif(p_reference,''),p_remarks,'success',auth.uid(),v_resolved_source_id,v_resolved_dest_id
  ) returning id into v_id;

  if v_cash_dir is not null then
    insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id)
    values(p_settlement_date,'cash',v_cash_dir,p_amount,'Settlement: '||v_cash_label||' ('||v_number||')','settlement',v_id);
  end if;

  insert into public.audit_logs(user_id,user_name,action,entity,entity_id,description,details)
  values(
    auth.uid(),null,'settlement_created','settlements',v_id::text,
    'Settlement '||v_number||' '||v_from||' -> '||v_to||' of '||p_amount,
    jsonb_build_object('type',p_settlement_type,'amount',p_amount,'reference',p_reference,'source_instrument_id',v_resolved_source_id,'dest_instrument_id',v_resolved_dest_id)
  );

  return jsonb_build_object('id',v_id,'settlement_number',v_number,'status','success');
end;
$$;

revoke all on function public.create_settlement(text,date,numeric,text,text,text,uuid,uuid) from public, anon;
grant execute on function public.create_settlement(text,date,numeric,text,text,text,uuid,uuid) to authenticated, service_role;
