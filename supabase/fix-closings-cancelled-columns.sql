-- Run this in Supabase SQL Editor (idempotent).
-- Fixes: "column "cancelled_at" of relation "closings" does not exist" raised by
-- cancel_open_close (the day-close "Cancel" action) and reverse_close.
-- Adds the missing columns and makes sure the closings status check allows
-- 'cancelled' / 'reversed', then re-creates the two functions so they match.

-- 1) Missing columns (safe if they already exist).
alter table public.closings add column if not exists cancelled_at timestamptz;
alter table public.closings add column if not exists cancelled_by uuid references auth.users (id) on delete set null;
alter table public.closings add column if not exists reversed_at timestamptz;
alter table public.closings add column if not exists reversed_by uuid references auth.users (id) on delete set null;

-- 2) Status check must allow cancelled + reversed.
alter table public.closings drop constraint if exists closings_status_check;
alter table public.closings
  add constraint closings_status_check check (status in ('open', 'closed', 'reversed', 'cancelled'));

-- 3) Re-create reverse_close (audited, journal never deleted).
create or replace function public.reverse_close(p_closing_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_close record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select * into v_close from public.closings where id = p_closing_id for update;
  if not found then raise exception 'Day close not found'; end if;
  if v_close.status <> 'closed' then raise exception 'Only a closed day close can be reversed'; end if;

  update public.closings
    set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(),
        remarks = trim(coalesce(remarks, '') || E'\nReversed: ' || coalesce(p_reason, 'No reason provided.'))
    where id = p_closing_id;

  delete from public.opening_balances
  where remarks = 'Auto from ' || v_close.closing_number;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'day_close_reversed', 'closings', p_closing_id::text,
    'Reversed ' || v_close.closing_number || ' for ' || v_close.close_date,
    jsonb_build_object('reason', p_reason, 'net_profit', v_close.net_profit)
  );

  return jsonb_build_object('id', p_closing_id, 'status', 'reversed');
end;
$$;

-- 4) Re-create cancel_open_close (cancel an open day close opened by mistake).
create or replace function public.cancel_open_close(p_closing_id uuid, p_reason text default '')
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_close record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select * into v_close from public.closings where id = p_closing_id for update;
  if not found then raise exception 'Day close not found'; end if;
  if v_close.status <> 'open' then raise exception 'Only an open day close can be cancelled'; end if;

  update public.closings
    set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
        remarks = trim(coalesce(remarks, '') || E'\nCancelled: ' || coalesce(p_reason, 'No reason provided.'))
    where id = p_closing_id;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'day_close_cancelled', 'closings', p_closing_id::text,
    'Cancelled open day close ' || v_close.closing_number || ' for ' || v_close.close_date,
    jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object('id', p_closing_id, 'closing_number', v_close.closing_number, 'status', 'cancelled');
end;
$$;

grant execute on function public.reverse_close(uuid, text) to authenticated;
grant execute on function public.cancel_open_close(uuid, text) to authenticated;
