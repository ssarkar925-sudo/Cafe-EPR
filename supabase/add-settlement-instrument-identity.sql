-- ==============================================================================
-- Phase 1: Settlement Instrument Identity
-- ==============================================================================
-- Adds authoritative source/destination instrument identity to settlements.
--
-- Problem: The frontend (SettlementFormModal) collects source_instrument_id and
-- dest_instrument_id from payment_instruments, the API forwards them, and
-- create_settlement() validates them (for bank_to_wallet) -- but the settlements
-- table never persisted them. Only audit_logs.details held them.
--
-- This migration:
-- 1. Adds source_instrument_id and dest_instrument_id columns to settlements
-- 2. Updates create_settlement() to persist these columns
-- 3. Updates reverse_settlement() to preserve instrument identity on reversal
-- 4. Provides a historical migration query using audit_logs
-- 5. Adds indexes for query performance
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Add columns to settlements table
-- ------------------------------------------------------------------------------
alter table public.settlements
  add column if not exists source_instrument_id uuid references public.payment_instruments(id) on delete set null,
  add column if not exists dest_instrument_id   uuid references public.payment_instruments(id) on delete set null;

create index if not exists settlements_source_instrument_id_idx on public.settlements (source_instrument_id);
create index if not exists settlements_dest_instrument_id_idx on public.settlements (dest_instrument_id);

-- ------------------------------------------------------------------------------
-- 2. Update create_settlement() to persist source/destination instrument IDs
-- ------------------------------------------------------------------------------
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
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_settlement_date is null then raise exception 'Date is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

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
  elsif p_settlement_type = 'bank_withdrawal' then
    v_from := 'bank'; v_to := 'cash'; v_prefix := 'BWD'; v_cash_dir := 'in'; v_cash_label := 'Bank Withdrawal';
  elsif p_settlement_type = 'add_cash_to_bank' then
    v_from := 'cash'; v_to := 'bank'; v_prefix := 'CTB'; v_cash_dir := 'out'; v_cash_label := 'Cash to Bank';
  elsif p_settlement_type = 'cash_adjustment' then
    if p_direction not in ('in', 'out') then raise exception 'Select Add Cash or Remove Cash'; end if;
    v_from := 'cash'; v_to := 'cash'; v_prefix := 'CAD';
    v_cash_dir := p_direction;
    v_cash_label := case when p_direction = 'in' then 'Cash Added' else 'Cash Removed' end;
  elsif p_settlement_type = 'bank_to_wallet' then
    v_from := 'bank'; v_to := 'wallet'; v_prefix := 'BTW'; v_cash_dir := null;
  else
    raise exception 'Invalid settlement type';
  end if;

  if p_settlement_type = 'bank_to_wallet' then
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

  v_number := v_prefix || '-' || lpad(nextval('public.settlement_seq')::text, 4, '0');

  insert into public.settlements (
    settlement_number, settlement_type, settlement_date, from_pool, to_pool,
    direction, amount, reference, remarks, status, created_by,
    source_instrument_id, dest_instrument_id
  ) values (
    v_number, p_settlement_type, p_settlement_date, v_from, v_to,
    v_cash_dir, p_amount, nullif(p_reference, ''), p_remarks, 'success', auth.uid(),
    p_source_instrument_id, p_dest_instrument_id
  ) returning id into v_id;

  if v_cash_dir is not null then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (p_settlement_date, 'cash', v_cash_dir, p_amount,
            'Settlement: ' || v_cash_label || ' (' || v_number || ')', 'settlement', v_id);
  end if;

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
revoke all on function public.create_settlement(
  text, date, numeric, text, text, text, uuid, uuid
) from public, anon;
grant execute on function public.create_settlement(
  text, date, numeric, text, text, text, uuid, uuid
) to authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. Update reverse_settlement() to preserve instrument identity on reversal
-- ------------------------------------------------------------------------------
drop function if exists public.reverse_settlement(uuid, text);

create or replace function public.reverse_settlement(p_settlement_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_settlement record;
  v_opposite text;
  v_label text;
  v_rev_type text;
  v_rev_from text;
  v_rev_to text;
  v_rev_prefix text;
  v_rev_cash_dir text;
  v_rev_cash_label text;
  v_rev_number text;
  v_rev_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select * into v_settlement from public.settlements where id = p_settlement_id for update;
  if not found then raise exception 'Settlement not found'; end if;
  if v_settlement.status <> 'success' then raise exception 'This settlement is already closed'; end if;

  if v_settlement.direction is not null then
    v_opposite := case when v_settlement.direction = 'in' then 'out' else 'in' end;
    v_label := case
      when v_settlement.settlement_type = 'bank_withdrawal' then 'Bank Withdrawal Reversed'
      when v_settlement.settlement_type = 'add_cash_to_bank' then 'Cash to Bank Reversed'
      else case when v_opposite = 'in' then 'Cash Added (Reversed)' else 'Cash Removed (Reversed)' end
    end;
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (current_date, 'cash', v_opposite, v_settlement.amount,
            'Settlement: ' || v_label || ' (' || v_settlement.settlement_number || ')', 'settlement', p_settlement_id);
  end if;

  update public.settlements
  set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(),
      remarks = trim(coalesce(remarks, '') || E'
Reversed: ' || coalesce(p_reason, 'No reason provided.'))
  where id = p_settlement_id;

  v_rev_type := v_settlement.settlement_type || '_reversal';
  v_rev_from := v_settlement.to_pool;
  v_rev_to := v_settlement.from_pool;
  v_rev_prefix := substr(v_settlement.settlement_number, 1, 3) || 'R';
  v_rev_cash_dir := null;

  if v_settlement.direction is not null then
    v_rev_cash_dir := case when v_settlement.direction = 'in' then 'out' else 'in' end;
  end if;

  v_rev_number := v_rev_prefix || '-' || lpad(nextval('public.settlement_seq')::text, 4, '0');

  insert into public.settlements (
    settlement_number, settlement_type, settlement_date, from_pool, to_pool,
    direction, amount, reference, remarks, status, created_by,
    source_instrument_id, dest_instrument_id
  ) values (
    v_rev_number, v_rev_type, current_date, v_rev_from, v_rev_to,
    v_rev_cash_dir, v_settlement.amount, v_settlement.reference,
    'Reversal of ' || v_settlement.settlement_number || ': ' || coalesce(p_reason, 'No reason provided.'),
    'success', auth.uid(),
    v_settlement.dest_instrument_id,
    v_settlement.source_instrument_id
  ) returning id into v_rev_id;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'settlement_reversed', 'settlements', p_settlement_id::text,
    'Reversed settlement ' || v_settlement.settlement_number || ' of ' || v_settlement.amount,
    jsonb_build_object(
      'reason', p_reason,
      'original_settlement_number', v_settlement.settlement_number,
      'reversal_settlement_number', v_rev_number,
      'original_source_instrument_id', v_settlement.source_instrument_id,
      'original_dest_instrument_id', v_settlement.dest_instrument_id
    )
  );

  return jsonb_build_object('id', p_settlement_id, 'status', 'reversed', 'reversal_id', v_rev_id);
end;
$$;

revoke all on function public.reverse_settlement(uuid, text) from public, anon;
grant execute on function public.reverse_settlement(uuid, text) to authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. Historical Migration: Recover instrument IDs from audit_logs
-- ------------------------------------------------------------------------------
-- Run this after the migration is applied to backfill existing settlements.
-- Only migrates when:
-- - entity_type = 'settlements'
-- - action = 'settlement_created'
-- - details contains valid source_instrument_id AND dest_instrument_id
-- - the referenced payment_instruments rows actually exist
--
-- NOTE: Do NOT execute this automatically in production. Review the output first.
-- To execute, copy the UPDATE statement below and run it manually after verifying.

-- Preview what would be migrated:
-- SELECT
--   s.id,
--   s.settlement_number,
--   s.settlement_type,
--   al.details->>'source_instrument_id' as audit_source_id,
--   al.details->>'dest_instrument_id' as audit_dest_id,
--   pi1.name as source_name,
--   pi1.type as source_type,
--   pi2.name as dest_name,
--   pi2.type as dest_type
-- FROM public.settlements s
-- JOIN public.audit_logs al
--   ON al.entity_type = 'settlements'
--  AND al.entity_id = s.id::text
--  AND al.action = 'settlement_created'
--  AND al.details ? 'source_instrument_id'
--  AND al.details ? 'dest_instrument_id'
-- LEFT JOIN public.payment_instruments pi1
--   ON pi1.id = (al.details->>'source_instrument_id')::uuid
-- LEFT JOIN public.payment_instruments pi2
--   ON pi2.id = (al.details->>'dest_instrument_id')::uuid
-- WHERE s.source_instrument_id IS NULL
--   AND s.dest_instrument_id IS NULL
-- ORDER BY s.settlement_number;

-- Actual migration (UNCOMMENT AND RUN AFTER REVIEW):
-- UPDATE public.settlements s
-- SET
--   source_instrument_id = (al.details->>'source_instrument_id')::uuid,
--   dest_instrument_id   = (al.details->>'dest_instrument_id')::uuid
-- FROM public.audit_logs al
-- WHERE al.entity_type = 'settlements'
--   AND al.entity_id = s.id::text
--   AND al.action = 'settlement_created'
--   AND al.details ? 'source_instrument_id'
--  AND al.details ? 'dest_instrument_id'
--   AND EXISTS (SELECT 1 FROM public.payment_instruments WHERE id = (al.details->>'source_instrument_id')::uuid)
--   AND EXISTS (SELECT 1 FROM public.payment_instruments WHERE id = (al.details->>'dest_instrument_id')::uuid)
--   AND s.source_instrument_id IS NULL
--   AND s.dest_instrument_id IS NULL;

-- Report settlements that could NOT be migrated (no audit log or invalid refs):
-- SELECT s.settlement_number, s.settlement_type, s.created_at
-- FROM public.settlements s
-- WHERE s.source_instrument_id IS NULL
--   AND s.dest_instrument_id IS NULL
--   AND s.status = 'success'
-- ORDER BY s.settlement_number;
