begin;

create table if not exists public.opening_positions (
  id uuid primary key default gen_random_uuid(),
  opening_date date not null,
  status text not null default 'draft' check (status in ('draft','finalized','reversed')),
  total_assets numeric(15,2) not null default 0,
  total_liabilities numeric(15,2) not null default 0,
  opening_capital numeric(15,2) not null default 0,
  snapshot_data jsonb not null default '{}'::jsonb,
  remarks text,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  unique(opening_date,status)
);

create index if not exists idx_opening_positions_date on public.opening_positions(opening_date desc);
create index if not exists idx_opening_positions_status on public.opening_positions(status);

alter table public.opening_positions enable row level security;

drop policy if exists opening_positions_backoffice_select on public.opening_positions;
create policy opening_positions_backoffice_select on public.opening_positions
  for select to authenticated using (public.is_back_office());

drop policy if exists opening_positions_backoffice_insert on public.opening_positions;
create policy opening_positions_backoffice_insert on public.opening_positions
  for insert to authenticated with check (public.is_back_office());

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
  foreach v_pool in array array['cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card'] loop
    v_opening := 0; v_current := 0; v_seed := null;

    if v_pool = 'credit_card' then
      -- Credit cards are liabilities. Their balance is outstanding utilization,
      -- not remaining credit limit/current available limit.
      select coalesce(sum(pi.opening_balance),0),
             coalesce(sum(nullif(pi.details->>'used_limit','')::numeric),0),
             min(pi.created_at)::date
        into v_opening, v_current, v_seed
        from public.payment_instruments pi
       where pi.is_active = true and pi.type = 'credit_card';
    elsif v_pool = 'cash' then
      select coalesce(sum(pi.opening_balance),0),
             coalesce(sum(pi.current_balance),0),
             min(pi.created_at)::date
        into v_opening, v_current, v_seed
        from public.payment_instruments pi
       where pi.is_active = true and lower(pi.type) = 'cash';

      if not exists (
        select 1 from public.payment_instruments pi
         where pi.is_active = true and lower(pi.type) = 'cash'
      ) then
        select coalesce(sum(case when ce.direction='in' then ce.amount else -ce.amount end),0)
          into v_current
          from public.cash_entries ce
         where ce.method='cash' and ce.entry_date <= p_as_of;
      end if;
    else
      select coalesce(sum(pi.opening_balance),0),
             coalesce(sum(pi.current_balance),0),
             min(pi.created_at)::date
        into v_opening, v_current, v_seed
        from public.payment_instruments pi
       where pi.is_active = true
         and (
           (v_pool='bank' and pi.type in ('bank','debit_card')) or
           (v_pool='wallet' and pi.type='wallet') or
           (v_pool='upi_qr' and pi.type in ('upi_qr','upi')) or
           (v_pool='aeps' and pi.type in ('aeps_portal','aeps')) or
           (v_pool='dmt' and pi.type in ('dmt_portal','dmt'))
         );
    end if;

    v_res := v_res || jsonb_build_object(
      v_pool,
      jsonb_build_object(
        'opening',v_opening,
        'seed_date',v_seed,
        'movements',v_current-v_opening,
        'current',v_current
      )
    );

    if v_pool <> 'credit_card' then
      v_total := v_total + v_current;
    end if;
  end loop;

  return v_res || jsonb_build_object('total',v_total);
end;
$$;

commit;
