-- Fix: "Could not find the function public.cancel_open_close(p_closing_id, p_reason) in the schema cache"
-- The live database is missing the cancel_open_close function that exists in the repo.
-- This file is idempotent and safe to run any time. It also re-creates the back-office
-- helper functions so the standalone fix works even if hardening.sql was never applied.
-- Run in the Supabase SQL editor of project tvxehxnvuwojjbhysajp.

-- Back-office = admin or manager (idempotent; matches hardening.sql).
create or replace function public.is_back_office()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select p.role in ('admin', 'manager') from public.profiles p where p.id = auth.uid()),
    false
  )
$$;

-- Admin only (role changes, settings, master deletes).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select p.role = 'admin' from public.profiles p where p.id = auth.uid()),
    false
  )
$$;

-- Cancel an open day close (e.g. opened by mistake).
-- Audited and never deleted: the close + snapshot balances stay as a cancelled
-- record. An open close has no financial entries yet, so nothing else reverses.
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

revoke all on function public.cancel_open_close(uuid, text) from public, anon;
grant execute on function public.cancel_open_close(uuid, text) to authenticated;