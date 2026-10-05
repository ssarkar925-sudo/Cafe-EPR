-- Normalize legacy customer phones to canonical 10-digit Indian mobile.
-- Mirrors lib/customer-search.ts toMobile10(): strip non-digits, then
-- 00 / 91 (12-digit) / 0 (11-digit) prefixes; keep only ^[6-9]\d{9}$.
--
-- SAFE BY DESIGN:
--   * Only rows whose normalized value is a valid mobile are touched.
--   * Rows whose normalized value would collide with another ACTIVE customer
--     are NOT changed; they are listed in customer_phone_normalize_conflicts
--     for operator review (merge manually).
--   * Idempotent: re-running changes nothing once phones are canonical.

create or replace function public.to_mobile10(p text)
returns text
language sql
immutable
as $$
  with d0 as (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d),
       d1 as (select case when d like '00%' then substr(d, 3) else d end as d from d0),
       d2 as (select case when length(d) = 12 and d like '91%' then substr(d, 3) else d end as d from d1),
       d3 as (select case when length(d) = 11 and d like '0%' then substr(d, 2) else d end as d from d2)
  select case when d ~ '^[6-9][0-9]{9}$' then d else null end from d3;
$$;

create table if not exists public.customer_phone_normalize_conflicts (
  customer_id uuid primary key,
  original_phone text,
  normalized_phone text,
  conflicts_with uuid[],
  detected_at timestamptz not null default now()
);
alter table public.customer_phone_normalize_conflicts enable row level security;

do $$
begin
  -- 1. Record collisions (two+ active customers resolving to the same mobile).
  insert into public.customer_phone_normalize_conflicts (customer_id, original_phone, normalized_phone, conflicts_with)
  select c.id, c.phone, public.to_mobile10(c.phone),
         array(select o.id from public.customers o
               where o.id <> c.id and coalesce(o.is_active, true)
                 and public.to_mobile10(o.phone) = public.to_mobile10(c.phone))
  from public.customers c
  where coalesce(c.is_active, true)
    and public.to_mobile10(c.phone) is not null
    and exists (select 1 from public.customers o
                where o.id <> c.id and coalesce(o.is_active, true)
                  and public.to_mobile10(o.phone) = public.to_mobile10(c.phone))
  on conflict (customer_id) do update
    set original_phone = excluded.original_phone,
        normalized_phone = excluded.normalized_phone,
        conflicts_with = excluded.conflicts_with,
        detected_at = now();

  -- 2. Normalize every non-conflicting row whose phone is not yet canonical.
  update public.customers c
     set phone = public.to_mobile10(c.phone)
   where public.to_mobile10(c.phone) is not null
     and c.phone is distinct from public.to_mobile10(c.phone)
     and not exists (select 1 from public.customer_phone_normalize_conflicts x where x.customer_id = c.id);
end $$;
