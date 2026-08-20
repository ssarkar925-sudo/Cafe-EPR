-- Fix: duplicate customers with the same phone number were being saved.
-- Run in the Supabase SQL editor of project tvxehxnvuwojjbhysajp (idempotent).
--  1) Deactivates existing duplicates (keeps the row with most history, else earliest).
--  2) Adds a unique index so the database itself rejects a second active customer
--     with the same digit-only phone number (formats like +91, spaces, dashes match).
--  3) Adds find_duplicate_customer() so the app can warn before saving.

-- 1) Deactivate duplicate active customers that share the same digit-only phone.
--    Kept row = the one with the most invoices/ledger entries, else the earliest created.
with dupes as (
  select regexp_replace(phone, '\D', '', 'g') as digits, id
  from public.customers
  where phone is not null and trim(phone) <> ''
),
ranked as (
  select d.id,
    row_number() over (
      partition by d.digits
      order by
        (select count(*) from public.invoices i where i.customer_id = d.id) desc,
        (select count(*) from public.customer_ledger l where l.customer_id = d.id) desc,
        c.created_at asc,
        c.id asc
    ) as rn
  from dupes d
  join public.customers c on c.id = d.id
  where c.is_active
)
update public.customers
  set is_active = false, updated_at = now()
where id in (select id from ranked where rn > 1);

-- 2) Unique index over active customers only (deactivated customers don't block reuse).
create unique index if not exists customers_active_phone_unique
  on public.customers (regexp_replace(phone, '\D', '', 'g'))
  where is_active and phone is not null and phone <> '';

-- 3) Precise duplicate lookup used by the app (same normalization as the index).
create or replace function public.find_duplicate_customer(p_phone text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_row jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if v_digits = '' then return 'null'::jsonb; end if;

  select to_jsonb(c) into v_row
  from public.customers c
  where c.is_active
    and c.phone is not null
    and c.phone <> ''
    and regexp_replace(c.phone, '\D', '', 'g') = v_digits
  order by c.created_at asc
  limit 1;

  return coalesce(v_row, 'null'::jsonb);
end;
$$;

revoke all on function public.find_duplicate_customer(text) from public, anon;
grant execute on function public.find_duplicate_customer(text) to authenticated;