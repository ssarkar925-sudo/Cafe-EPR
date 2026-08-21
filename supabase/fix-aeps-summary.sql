-- Standalone fix: replace get_settlement_summary() so AEPS/recharge floats
-- respect the opening-balance seed date (matches opening-close.sql / recharge.sql).
-- Run THIS file only (do not re-run the whole hardening.sql).

create or replace function public.get_settlement_summary()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_pool text;
  v_opening numeric;
  v_seed date;
  v_mov numeric;
  v_count bigint;
  v_result jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  foreach v_pool in array array['cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card', 'recharge']
  loop
    select s.opening, s.seed_date into v_opening, v_seed
    from public.get_pool_seed(v_pool, current_date) s;
    v_mov := public.get_pool_movements(v_pool, v_seed, null);
    v_result := v_result || jsonb_build_object(v_pool, v_opening + v_mov);
  end loop;

  select count(*) into v_count from public.settlements where status = 'success';

  return v_result || jsonb_build_object('count', v_count);
end;
$$
revoke all on function public.get_settlement_summary() from public, anon;
grant execute on function public.get_settlement_summary() to authenticated;

-- One-time data repair: AEPS transaction rows have stale pool_credit/pool_out.
-- Recompute so float = -(amount + portal_commission) per withdrawal.
update public.transactions
set pool_credit = 0,
    pool_out = amount + coalesce(portal_commission, 0)
where status = 'success'
  and pool_credit_type = 'aeps';
