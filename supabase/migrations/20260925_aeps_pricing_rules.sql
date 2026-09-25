-- AEPS persistent fee/commission rules.
-- Resolution priority: customer-specific > portal-specific > global, then priority DESC.
create table if not exists public.aeps_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  service_type text not null default 'aeps',
  rule_type text not null check (rule_type in ('fee','commission')),
  portal_id uuid references public.aeps_portals(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  min_amount numeric(15,2) not null default 0,
  max_amount numeric(15,2),
  value numeric(15,2) not null default 0,
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aeps_pricing_amount_range_check check (min_amount >= 0 and (max_amount is null or max_amount >= min_amount)),
  constraint aeps_pricing_value_check check (value >= 0),
  constraint aeps_pricing_service_check check (service_type = 'aeps')
);

create index if not exists aeps_pricing_lookup_idx
  on public.aeps_pricing_rules (rule_type, portal_id, customer_id, min_amount, max_amount, priority)
  where is_active = true;

alter table public.aeps_pricing_rules enable row level security;
drop policy if exists "aeps_pricing_rules all" on public.aeps_pricing_rules;
create policy "aeps_pricing_rules all"
  on public.aeps_pricing_rules
  for all to authenticated
  using (public.is_back_office())
  with check (public.is_back_office());

create or replace function public.resolve_aeps_pricing(
  p_customer_id uuid,
  p_portal_id uuid,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee numeric := 0;
  v_commission numeric := 0;
begin
  if auth.uid() is null or not public.is_back_office() then
    raise exception 'Forbidden';
  end if;

  select coalesce(value, 0)
    into v_fee
  from public.aeps_pricing_rules
  where service_type = 'aeps'
    and rule_type = 'fee'
    and is_active
    and min_amount <= coalesce(p_amount, 0)
    and (max_amount is null or p_amount <= max_amount)
    and (customer_id = p_customer_id or customer_id is null)
    and (portal_id = p_portal_id or portal_id is null)
  order by
    case when customer_id = p_customer_id then 0 else 1 end,
    case when portal_id = p_portal_id then 0 else 1 end,
    priority desc,
    min_amount desc
  limit 1;

  select coalesce(value, 0)
    into v_commission
  from public.aeps_pricing_rules
  where service_type = 'aeps'
    and rule_type = 'commission'
    and is_active
    and min_amount <= coalesce(p_amount, 0)
    and (max_amount is null or p_amount <= max_amount)
    and (customer_id = p_customer_id or customer_id is null)
    and (portal_id = p_portal_id or portal_id is null)
  order by
    case when customer_id = p_customer_id then 0 else 1 end,
    case when portal_id = p_portal_id then 0 else 1 end,
    priority desc,
    min_amount desc
  limit 1;

  return jsonb_build_object(
    'fee', coalesce(v_fee, 0),
    'commission', coalesce(v_commission, 0)
  );
end;
$$;

grant execute on function public.resolve_aeps_pricing(uuid, uuid, numeric) to authenticated;
