-- Run this in Supabase SQL Editor (idempotent).
-- Notification reads: per-user read markers on audit_logs so the notification
-- bell can show every change as an unread activity item that disappears once read.

create table if not exists public.notification_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  audit_log_id uuid references public.audit_logs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, audit_log_id)
);

create index if not exists notification_reads_user_idx on public.notification_reads (user_id, created_at desc);

alter table public.notification_reads enable row level security;

create policy "notification_reads own" on public.notification_reads
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Unread audit activity for the current user (read markers exclude seen items).
create or replace function public.unread_notifications(p_limit int default 40)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  return jsonb_build_object(
    'unread', coalesce((
      select jsonb_agg(x order by x.created_at desc)
      from (
        select a.id, a.user_id, a.user_name, a.action, a.entity, a.entity_id,
               a.description, a.details, a.created_at
        from public.audit_logs a
        where not exists (
          select 1 from public.notification_reads r
          where r.user_id = v_user and r.audit_log_id = a.id
        )
        order by a.created_at desc
        limit p_limit
      ) x
    ), '[]'::jsonb),
    'count', (
      select count(*)
      from public.audit_logs a
      where not exists (
        select 1 from public.notification_reads r
        where r.user_id = v_user and r.audit_log_id = a.id
      )
    )
  );
end;
$$;

-- Mark a set of audit entries as read for the current user (idempotent).
create or replace function public.mark_notifications_read(p_ids uuid[])
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  insert into public.notification_reads (user_id, audit_log_id)
  select v_user, a.id
  from public.audit_logs a
  where a.id = any(p_ids)
  on conflict (user_id, audit_log_id) do nothing;
end;
$$;

revoke all on function public.unread_notifications(integer) from public, anon;
grant execute on function public.unread_notifications(integer) to authenticated;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;