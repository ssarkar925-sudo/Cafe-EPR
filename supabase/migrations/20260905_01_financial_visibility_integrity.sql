-- Keep treasury pool balances consistent with Payment Accounts.
-- Cash is an explicit payment instrument, so its configured opening balance
-- must be included in the live pool projection instead of rebuilding cash from
-- movements alone.

CREATE OR REPLACE FUNCTION public.get_pool_balances_internal(p_as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_pool text;
  v_opening numeric := 0;
  v_current numeric := 0;
  v_res jsonb := '{}'::jsonb;
  v_total numeric := 0;
  v_seed date := null;
begin
  foreach v_pool in array array['cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card']
  loop
    v_opening := 0;
    v_current := 0;
    v_seed := null;

    if v_pool = 'cash' then
      select
        coalesce(sum(pi.opening_balance), 0),
        coalesce(sum(pi.current_balance), 0),
        min(pi.created_at)::date
      into v_opening, v_current, v_seed
      from public.payment_instruments pi
      where pi.is_active = true
        and lower(pi.type) = 'cash';

      if not exists (
        select 1 from public.payment_instruments pi
        where pi.is_active = true and lower(pi.type) = 'cash'
      ) then
        select coalesce(sum(case when ce.direction = 'in' then ce.amount else -ce.amount end),0)
          into v_current
        from public.cash_entries ce
        where ce.method = 'cash' and ce.entry_date <= p_as_of;
        v_opening := 0;
      end if;
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
$function$;
