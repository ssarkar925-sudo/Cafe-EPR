-- Financial reconciliation: use live canonical instrument balances.
-- The previous pool-seed path returned zero when opening_balances had no
-- instrument snapshots, even though payment_instruments held real balances.

create or replace function public.get_pool_balances_internal(p_as_of date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pool text;
  v_opening numeric := 0;
  v_current numeric := 0;
  v_res jsonb := '{}'::jsonb;
  v_total numeric := 0;
  v_seed date := null;
begin
  -- This is a live reconciliation view. payment_instruments.current_balance
  -- is the canonical balance for instrument-backed pools. Cash is derived from
  -- the canonical cash-entry trail. Do not require opening_balances snapshots.
  foreach v_pool in array array['cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card']
  loop
    v_opening := 0;
    v_current := 0;
    v_seed := null;

    if v_pool = 'cash' then
      select coalesce(sum(case when direction = 'in' then amount else -amount end), 0)
        into v_current
      from public.cash_entries
      where method = 'cash'
        and entry_date <= p_as_of;
    else
      select
        coalesce(sum(pi.opening_balance), 0),
        coalesce(sum(pi.current_balance), 0),
        min(pi.created_at)::date
      into v_opening, v_current, v_seed
      from public.payment_instruments pi
      where pi.is_active = true
        and (
          (v_pool = 'bank' and pi.type in ('bank', 'debit_card')) or
          (v_pool = 'credit_card' and pi.type = 'credit_card') or
          (v_pool = 'wallet' and pi.type = 'wallet') or
          (v_pool = 'upi_qr' and pi.type in ('upi_qr', 'upi')) or
          (v_pool = 'aeps' and pi.type in ('aeps_portal', 'aeps')) or
          (v_pool = 'dmt' and pi.type in ('dmt_portal', 'dmt'))
        );
    end if;

    v_res := v_res || jsonb_build_object(
      v_pool,
      jsonb_build_object(
        'opening', v_opening,
        'seed_date', v_seed,
        'movements', v_current - v_opening,
        'current', v_current
      )
    );

    if v_pool <> 'credit_card' then
      v_total := v_total + v_current;
    end if;
  end loop;

  v_res := v_res || jsonb_build_object('total', v_total);
  return v_res;
end;
$$;
