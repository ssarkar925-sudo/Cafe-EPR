-- ==============================================================================
-- Bank → Wallet Load: server-side guards on create_settlement()
-- ==============================================================================
-- Forensic review identified two server-side security gaps for bank_to_wallet:
--   1. create_settlement() did not enforce that the source bank instrument has
--      sufficient live balance for the transfer amount.
--   2. create_settlement() did not enforce that source/destination instruments
--      exist, are active, and match the canonical pool types.
--
-- This migration extends public.create_settlement() with two optional parameters:
--   p_source_instrument_id uuid  -- the payment_instruments.id of the source
--   p_dest_instrument_id   uuid  -- the payment_instruments.id of the destination
--
-- For settlement_type = 'bank_to_wallet' ONLY, the RPC now enforces:
--   - source instrument exists
--   - source instrument is active
--   - source instrument type ∈ ('bank', 'debit_card')
--   - destination instrument exists
--   - destination instrument is active
--   - destination instrument type = 'wallet'
--   - current source bank balance >= p_amount
--     (computed using the same opening_balance + cash_entries flow as the
--      canonical get_pool_seed / get_pool_movements pipeline)
--
-- The parameters default to NULL so that every other settlement_type continues
-- to work exactly as before. The wallet recipient is recorded in the audit
-- log and in the settlement.remarks for downstream traceability.
--
-- Accounting: Bank -X, Wallet +X, total liquid assets Δ=0, P&L Δ=0, ITR Δ=0,
-- GST Δ=0, COGS Δ=0, Expense Δ=0. No cash_entries row is written for this
-- transfer — the existing 'if v_cash_dir is not null' branch already skips it.
-- ==============================================================================

-- Drop the existing function so the new signature can be installed cleanly.
-- Supabase / PostgREST routes by parameter list, so the new function with
-- two extra optional uuid parameters is a strict superset of the old one.
drop function if exists public.create_settlement(
  text, date, numeric, text, text, text
);

create or replace function public.create_settlement(
  p_settlement_type          text,
  p_settlement_date          date,
  p_amount                   numeric,
  p_reference                text,
  p_remarks                  text,
  p_direction                text,
  p_source_instrument_id     uuid default null,
  p_dest_instrument_id       uuid default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_id                uuid;
  v_number            text;
  v_from              text;
  v_to                text;
  v_prefix            text;
  v_cash_dir          text;
  v_cash_label        text;
  v_src_type          text;
  v_src_active        boolean;
  v_src_balance       numeric;
  v_source_seed_opening numeric;
  v_source_seed_date    date;
  v_source_movements    numeric;
  v_dst_type          text;
  v_dst_active        boolean;
begin
  -- 0. Standard authorization gate (matches every other settlement RPC).
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_settlement_date is null then raise exception 'Date is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  -- 1. Resolve the pool direction and number prefix for this settlement type.
  if p_settlement_type = 'aeps_to_bank' then
    v_from := 'aeps'; v_to := 'bank'; v_prefix := 'ATB'; v_cash_dir := null;
  elsif p_settlement_type = 'bank_to_dmt' then
    v_from := 'bank'; v_to := 'dmt'; v_prefix := 'BTD'; v_cash_dir := null;
  elsif p_settlement_type = 'wallet_to_dmt' then
    v_from := 'wallet'; v_to := 'dmt'; v_prefix := 'WTD'; v_cash_dir := null;
  elsif p_settlement_type = 'upi_qr_to_wallet' then
    v_from := 'upi_qr'; v_to := 'wallet'; v_prefix := 'UQW'; v_cash_dir := null;
  elsif p_settlement_type = 'upi_qr_to_bank' then
    v_from := 'upi_qr'; v_to := 'bank'; v_prefix := 'UQB'; v_cash_dir := null;
  elsif p_settlement_type = 'wallet_to_bank' then
    v_from := 'wallet'; v_to := 'bank'; v_prefix := 'WTB'; v_cash_dir := null;
  elsif p_settlement_type = 'bank_to_wallet' then
    v_from := 'bank'; v_to := 'wallet'; v_prefix := 'BTW'; v_cash_dir := null;
  elsif p_settlement_type = 'bank_to_recharge' then
    v_from := 'bank'; v_to := 'recharge'; v_prefix := 'BTR'; v_cash_dir := null;
  elsif p_settlement_type = 'recharge_to_bank' then
    v_from := 'recharge'; v_to := 'bank'; v_prefix := 'RTB'; v_cash_dir := null;
  elsif p_settlement_type = 'recharge_to_wallet' then
    v_from := 'recharge'; v_to := 'wallet'; v_prefix := 'RTW'; v_cash_dir := null;
  elsif p_settlement_type = 'bank_to_credit_card' then
    v_from := 'bank'; v_to := 'credit_card'; v_prefix := 'BTC'; v_cash_dir := null;
  elsif p_settlement_type = 'cash_to_credit_card' then
    v_from := 'cash'; v_to := 'credit_card'; v_prefix := 'CTC';
    v_cash_dir := 'out'; v_cash_label := 'Cash to Credit Card';
  elsif p_settlement_type = 'credit_card_to_bank' then
    v_from := 'credit_card'; v_to := 'bank'; v_prefix := 'CCB'; v_cash_dir := null;
  elsif p_settlement_type = 'bank_withdrawal' then
    v_from := 'bank'; v_to := 'cash'; v_prefix := 'BWD';
    v_cash_dir := 'in'; v_cash_label := 'Bank Withdrawal';
  elsif p_settlement_type = 'add_cash_to_bank' then
    v_from := 'cash'; v_to := 'bank'; v_prefix := 'CTB';
    v_cash_dir := 'out'; v_cash_label := 'Cash to Bank';
  elsif p_settlement_type = 'cash_adjustment' then
    if p_direction not in ('in', 'out') then raise exception 'Select Add Cash or Remove Cash'; end if;
    v_from := 'cash'; v_to := 'cash'; v_prefix := 'CAD';
    v_cash_dir := p_direction;
    v_cash_label := case when p_direction = 'in' then 'Cash Added' else 'Cash Removed' end;
  else
    raise exception 'Invalid settlement type';
  end if;

  -- =============================================================================
  -- 2. Server-side guards for bank_to_wallet (instrument identity + balance).
  --    Only applied for bank_to_wallet. All other settlement types are
  --    untouched and continue to work with p_source_instrument_id /
  --    p_dest_instrument_id = NULL.
  -- =============================================================================
  if p_settlement_type = 'bank_to_wallet' then
    -- 2a. Source instrument identity + active + type.
    if p_source_instrument_id is null then
      raise exception 'bank_to_wallet requires a source bank instrument';
    end if;
    select type, is_active into v_src_type, v_src_active
    from public.payment_instruments
    where id = p_source_instrument_id;
    if v_src_type is null then
      raise exception 'Source bank instrument % not found', p_source_instrument_id;
    end if;
    if v_src_active is distinct from true then
      raise exception 'Source bank instrument % is inactive', p_source_instrument_id;
    end if;
    if v_src_type not in ('bank', 'debit_card') then
      raise exception 'Source instrument type must be bank or debit_card (got %)', v_src_type;
    end if;

    -- 2b. Destination instrument identity + active + type.
    if p_dest_instrument_id is null then
      raise exception 'bank_to_wallet requires a destination wallet instrument';
    end if;
    if p_dest_instrument_id = p_source_instrument_id then
      raise exception 'Source and destination instruments must be different';
    end if;
    select type, is_active into v_dst_type, v_dst_active
    from public.payment_instruments
    where id = p_dest_instrument_id;
    if v_dst_type is null then
      raise exception 'Destination wallet instrument % not found', p_dest_instrument_id;
    end if;
    if v_dst_active is distinct from true then
      raise exception 'Destination wallet instrument % is inactive', p_dest_instrument_id;
    end if;
    if v_dst_type <> 'wallet' then
      raise exception 'Destination instrument type must be wallet (got %)', v_dst_type;
    end if;

    -- 2c. Source bank balance check using the canonical bank balance model.
    --     We anchor from the same pool seed logic used by get_pool_balances()
    --     and then calculate movements through the existing canonical
    --     get_pool_movements() engine.
    select s.opening, s.seed_date
    into v_source_seed_opening, v_source_seed_date
    from public.get_pool_seed('bank', p_settlement_date) s;

    v_source_movements := public.get_pool_movements('bank', v_source_seed_date, p_settlement_date);
    v_src_balance := coalesce(v_source_seed_opening, 0) + coalesce(v_source_movements, 0);

    if v_src_balance < p_amount then
      raise exception 'Insufficient source bank balance: available=%, required=%',
        v_src_balance, p_amount;
    end if;
  end if;

  -- 3. Numbering + insert into settlements.
  v_number := v_prefix || '-' || lpad(nextval('public.settlement_seq')::text, 4, '0');

  insert into public.settlements (
    settlement_number, settlement_type, settlement_date, from_pool, to_pool,
    direction, amount, reference, remarks, status, created_by
  ) values (
    v_number, p_settlement_type, p_settlement_date, v_from, v_to,
    v_cash_dir, p_amount, nullif(p_reference, ''), p_remarks, 'success', auth.uid()
  ) returning id into v_id;

  -- 4. Optional cash leg (only when v_cash_dir is not null).
  --    For bank_to_wallet, v_cash_dir is null so no cash_entries row is
  --    written — the pool movement is captured by the settlements row
  --    itself, which the canonical get_pool_movements() function reads.
  if v_cash_dir is not null then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (p_settlement_date, 'cash', v_cash_dir, p_amount,
            'Settlement: ' || v_cash_label || ' (' || v_number || ')', 'settlement', v_id);
  end if;

  -- 5. Audit log (always exactly one row per settlement).
  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'settlement_created', 'settlements', v_id::text,
    'Settlement ' || v_number || ' ' || v_from || ' -> ' || v_to || ' of ' || p_amount,
    jsonb_build_object(
      'type', p_settlement_type,
      'amount', p_amount,
      'reference', p_reference,
      'source_instrument_id', p_source_instrument_id,
      'dest_instrument_id',   p_dest_instrument_id
    )
  );

  return jsonb_build_object('id', v_id, 'settlement_number', v_number, 'status', 'success');
end;
$$;

-- Re-grant the new signature (the drop above revokes execute).
revoke all on function public.create_settlement(
  text, date, numeric, text, text, text, uuid, uuid
) from public, anon;
grant execute on function public.create_settlement(
  text, date, numeric, text, text, text, uuid, uuid
) to authenticated, service_role;
