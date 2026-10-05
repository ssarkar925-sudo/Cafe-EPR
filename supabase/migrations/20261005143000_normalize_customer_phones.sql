-- Normalize legacy customer phones to canonical 10-digit Indian mobile.
-- Mirrors lib/customer-search.ts toMobile10(): strip non-digits, then
-- 00 / 91 (12-digit) / 0 (11-digit) prefixes; keep only ^[6-9]\d{9}$.
--
-- SAFE BY DESIGN:
--   * Auto-detects the schema holding the `customers` table; if none exists
--     it raises a clear error listing what it found (nothing is changed).
--   * Only rows whose normalized value is a valid mobile are touched.
--   * Rows that would collide with another ACTIVE customer are NOT changed;
--     they are listed in customer_phone_normalize_conflicts for manual merge.
--   * Idempotent.

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
declare
  s text;
  t text;
  has_active boolean;
  active_expr text;
  found_tables text;
  n_updated int;
begin
  select table_schema into s
  from information_schema.tables
  where table_name = 'customers' and table_type = 'BASE TABLE'
  order by (table_schema = 'public') desc
  limit 1;

  if s is null then
    select string_agg(table_schema || '.' || table_name, ', ' order by table_schema, table_name)
      into found_tables
    from information_schema.tables
    where table_schema not in ('pg_catalog', 'information_schema')
      and table_name ilike '%cust%';
    raise exception 'No "customers" table in this database (project). Tables matching *cust*: %. Check you are in the CafeERP project (tvxehxnvuwojjbhysajp).',
      coalesce(found_tables, 'none');
  end if;

  t := format('%I.customers', s);
  select exists (select 1 from information_schema.columns
                 where table_schema = s and table_name = 'customers' and column_name = 'is_active')
    into has_active;
  active_expr := case when has_active then 'coalesce(%s.is_active, true)' else 'true' end;

  execute format($q$
    insert into public.customer_phone_normalize_conflicts (customer_id, original_phone, normalized_phone, conflicts_with)
    select c.id, c.phone, public.to_mobile10(c.phone),
           array(select o.id from %1$s o
                 where o.id <> c.id and %3$s
                   and public.to_mobile10(o.phone) = public.to_mobile10(c.phone))
    from %1$s c
    where %2$s
      and public.to_mobile10(c.phone) is not null
      and exists (select 1 from %1$s o
                  where o.id <> c.id and %3$s
                    and public.to_mobile10(o.phone) = public.to_mobile10(c.phone))
    on conflict (customer_id) do update
      set original_phone = excluded.original_phone,
          normalized_phone = excluded.normalized_phone,
          conflicts_with = excluded.conflicts_with,
          detected_at = now()
  $q$, t, format(active_expr, 'c'), format(active_expr, 'o'));

  execute format($q$
    update %1$s c
       set phone = public.to_mobile10(c.phone)
     where public.to_mobile10(c.phone) is not null
       and c.phone is distinct from public.to_mobile10(c.phone)
       and not exists (select 1 from public.customer_phone_normalize_conflicts x where x.customer_id = c.id)
  $q$, t);
  get diagnostics n_updated = row_count;

  raise notice 'Normalized % customer phone(s) in %', n_updated, t;
end $$;
