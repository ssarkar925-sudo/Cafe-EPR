-- Canonical customer ID/code generation (single source of truth).
--
-- Problem: customers.code was nullable with no default, trigger, or sequence.
-- CRM computed codes client-side with a MAX(code)-plus-one scan over a partial
-- (<=500 row) directory (race-unsafe, wrong past 500 rows); POS used a
-- timestamp suffix; DMT used a random suffix; AEPS/UPI/Recharge/Utility/GooglePlay sent NULL.
--
-- Fix: the database generates the code for EVERY insert that omits it.
-- Frontend code must NOT send codes; the insert response carries the code.
-- Format is unchanged: CUST-<number>, zero-padded to at least 4 digits
-- (CUST-0001 ... CUST-9999, CUST-10000, ...). Existing codes never touched.
--
-- PRE-MIGRATION DIAGNOSTIC (run in STAGING first to count affected rows):
--   select id, name, phone, created_at, code
--   from public.customers
--   where code is null or btrim(code) = ''
--   order by created_at nulls last, id;
--   select code, count(*) from public.customers
--   where code is not null and btrim(code) <> ''
--   group by code having count(*) > 1;

-- 1. Concurrency-safe counter. nextval() is atomic: simultaneous inserts can
-- never receive the same value; rolled-back transactions only skip numbers.
create sequence if not exists public.customer_code_seq;

-- 2. Seed above the current numeric max (never rewind an advanced sequence).
do $$
declare
  v_max bigint;
  v_cur bigint;
begin
  select coalesce(max((regexp_match(code, '(\d+)'))[1]::bigint), 0)
    into v_max
    from public.customers
    where code is not null;
  select last_value into v_cur from public.customer_code_seq;
  if v_max >= v_cur then
    perform setval('public.customer_code_seq', v_max);
  end if;
  raise notice 'customer_code_seq seeded: table max=%, sequence now=%', v_max, (select last_value from public.customer_code_seq);
end
$$;

-- 3. Canonical generator: fills ONLY missing codes, preserves everything sent.
create or replace function public.assign_customer_code()
returns trigger
language plpgsql
as $$
begin
  if NEW.code is null or btrim(NEW.code) = '' then
    NEW.code := 'CUST-' || lpad(nextval('public.customer_code_seq')::text, 4, '0');
  end if;
  return NEW;
end
$$;

drop trigger if exists trg_assign_customer_code on public.customers;
create trigger trg_assign_customer_code
  before insert on public.customers
  for each row execute function public.assign_customer_code();

-- 4. Authenticated app users insert customers directly: they need sequence USAGE
-- (least privilege: USAGE alone is sufficient for nextval()).
grant usage on sequence public.customer_code_seq to authenticated;

-- 5. One-time idempotent backfill: only NULL/empty codes, oldest first.
-- Valid existing codes are never overwritten; UUIDs and FKs never change.
do $$
declare
  v_filled int;
begin
  with missing as (
    select id
    from public.customers
    where code is null or btrim(code) = ''
    order by created_at nulls last, id
  )
  update public.customers c
  set code = 'CUST-' || lpad(nextval('public.customer_code_seq')::text, 4, '0')
  from missing m
  where c.id = m.id;
  get diagnostics v_filled = row_count;
  raise notice 'customer code backfill: % record(s) assigned canonical codes', v_filled;
end
$$;

-- 6. Hard guarantee: no customer row can exist without a canonical code.
-- Safe: the trigger fills every insert, and step 5 removed all NULLs.
alter table public.customers alter column code set not null;
