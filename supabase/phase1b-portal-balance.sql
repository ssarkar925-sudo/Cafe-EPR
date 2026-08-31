-- ==============================================================================
-- Phase 1B: Authoritative AEPS Portal Balance
-- ==============================================================================
-- This migration adds the authoritative portal balance calculation.
-- It does NOT modify historical data or existing pool functions.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Add payment_instrument_id to aeps_portals (authoritative FK)
-- ------------------------------------------------------------------------------
alter table public.aeps_portals
  add column if not exists payment_instrument_id uuid references public.payment_instruments(id) on delete set null;

create index if not exists aeps_portals_payment_instrument_id_idx on public.aeps_portals (payment_instrument_id);

-- ------------------------------------------------------------------------------
-- 2. get_portal_balance RPC - Authoritative portal balance calculation
-- ------------------------------------------------------------------------------
drop function if exists public.get_portal_balance(uuid, date);

create or replace function public.get_portal_balance(
    p_portal_id uuid,
    p_as_of date default current_date
)
returns table (
    portal_id uuid,
    payment_instrument_id uuid,
    balance numeric,
    transaction_credit numeric,
    settlement_in numeric,
    settlement_out numeric,
    transaction_pool_out numeric,
    opening_balance numeric,
    unallocated_legacy numeric,
    balance_verified boolean,
    verification_status text,
    unallocated_aeps_settlement_amount numeric
)
language plpgsql
security definer set search_path = public
as $$
declare
    v_portal_payment_instrument_id uuid;
    v_txn_credit numeric := 0;
    v_txn_pool_out numeric := 0;
    v_settlement_in numeric := 0;
    v_settlement_out numeric := 0;
    v_opening_balance numeric := 0;
    v_unallocated_legacy numeric := 0;
    v_unallocated_settlements numeric := 0;
    v_balance_verified boolean := true;
    v_verification_status text := 'verified';
    v_unallocated_aeps_settlement_amount numeric := 0;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    select payment_instrument_id into v_portal_payment_instrument_id
    from public.aeps_portals where id = p_portal_id;
    if not found then raise exception 'Portal not found'; end if;

    if v_portal_payment_instrument_id is not null then
        select coalesce(sum(amount), 0) into v_opening_balance
        from public.opening_balances where pool = 'aeps' and instrument_id = v_portal_payment_instrument_id and as_of <= p_as_of;
    end if;

    select coalesce(sum(amount), 0) into v_unallocated_legacy
    from public.opening_balances where pool = 'aeps' and instrument_id is null and as_of <= p_as_of;

    select coalesce(sum(amount), 0) into v_unallocated_settlements
    from public.settlements
    where status = 'success'
      and from_pool = 'aeps'
      and to_pool = 'bank'
      and source_instrument_id is null
      and settlement_date <= p_as_of;

    v_unallocated_aeps_settlement_amount := v_unallocated_settlements;

    v_balance_verified := (v_unallocated_settlements = 0 and v_unallocated_legacy = 0);
    v_verification_status := case
        when v_balance_verified then 'verified'
        else 'unverified: unallocated AEPS pool settlements exist'
    end;

    select coalesce(sum(pool_credit), 0) into v_txn_credit
    from public.transactions where service_type = 'aeps' and portal_id = p_portal_id and status = 'success' and pool_credit_type = 'aeps' and transaction_date <= p_as_of;

    select coalesce(sum(pool_out), 0) into v_txn_pool_out
    from public.transactions where service_type = 'aeps' and portal_id = p_portal_id and status = 'success' and pool_credit_type = 'aeps' and transaction_date <= p_as_of;

    if v_portal_payment_instrument_id is not null then
        select coalesce(sum(amount), 0) into v_settlement_out
        from public.settlements where status = 'success' and from_pool = 'aeps' and source_instrument_id = v_portal_payment_instrument_id and settlement_date <= p_as_of;

        select coalesce(sum(amount), 0) into v_settlement_in
        from public.settlements where status = 'success' and to_pool = 'aeps' and dest_instrument_id = v_portal_payment_instrument_id and settlement_date <= p_as_of;
    end if;

    return query select
        p_portal_id as portal_id,
        v_portal_payment_instrument_id as payment_instrument_id,
        (coalesce(v_opening_balance, 0) + coalesce(v_txn_credit, 0) - coalesce(v_txn_pool_out, 0) - coalesce(v_settlement_out, 0) + coalesce(v_settlement_in, 0)) as balance,
        v_txn_credit as transaction_credit,
        v_settlement_in as settlement_in,
        v_settlement_out as settlement_out,
        v_txn_pool_out as transaction_pool_out,
        v_opening_balance as opening_balance,
        v_unallocated_legacy as unallocated_legacy,
        v_balance_verified as balance_verified,
        v_verification_status as verification_status,
        v_unallocated_aeps_settlement_amount as unallocated_aeps_settlement_amount;
end;
$$;

revoke all on function public.get_portal_balance(uuid, date) from public, anon;
grant execute on function public.get_portal_balance(uuid, date) to authenticated, service_role;

-- ==============================================================================
-- END OF PHASE 1B
-- ==============================================================================