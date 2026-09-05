-- Canonical recharge provider + commission slab master data.
-- Safe to rerun: providers are inserted only when their name is not present.
-- Commission ranges are validated at the database boundary so bad slabs cannot
-- silently reach the recharge calculator.

insert into public.recharge_providers (name, is_active, sort_order)
select v.name, true, v.sort_order
from (values
  ('Airtel', 10),
  ('Jio', 20),
  ('Vodafone Idea (Vi)', 30),
  ('BSNL', 40),
  ('Tata Play (DTH)', 50),
  ('Airtel Digital TV', 60),
  ('Dish TV', 70),
  ('Sun Direct', 80)
) as v(name, sort_order)
where not exists (
  select 1
  from public.recharge_providers p
  where lower(trim(p.name)) = lower(trim(v.name))
);

-- Index used by the recharge terminal's provider + amount slab lookup.
create index if not exists idx_recharge_commission_slabs_provider_amount
  on public.recharge_commission_slabs (provider_id, min_amount, max_amount);

-- Defensive integrity constraints. Use catalog checks so this migration is
-- repeatable across environments that may already contain these constraints.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recharge_commission_slabs_min_nonnegative'
      and conrelid = 'public.recharge_commission_slabs'::regclass
  ) then
    alter table public.recharge_commission_slabs
      add constraint recharge_commission_slabs_min_nonnegative
      check (min_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'recharge_commission_slabs_max_gte_min'
      and conrelid = 'public.recharge_commission_slabs'::regclass
  ) then
    alter table public.recharge_commission_slabs
      add constraint recharge_commission_slabs_max_gte_min
      check (max_amount >= min_amount);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'recharge_commission_slabs_commission_percent_range'
      and conrelid = 'public.recharge_commission_slabs'::regclass
  ) then
    alter table public.recharge_commission_slabs
      add constraint recharge_commission_slabs_commission_percent_range
      check (commission_percent >= 0 and commission_percent <= 100);
  end if;
end $$;
