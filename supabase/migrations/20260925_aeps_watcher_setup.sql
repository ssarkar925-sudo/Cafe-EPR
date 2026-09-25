-- AEPS watcher configuration.
-- Stores only non-secret monitoring configuration. Portal credentials,
-- OTPs, biometric data and session tokens must never be persisted here.

create table if not exists public.aeps_watcher_configs (
  id uuid primary key default gen_random_uuid(),
  service_type text not null default 'aeps' check (service_type = 'aeps'),
  portal_id uuid not null references public.aeps_portals(id) on delete cascade,
  enabled boolean not null default false,
  poll_interval_seconds integer not null default 30
    check (poll_interval_seconds between 15 and 3600),
  source_url text,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_type, portal_id)
);

create index if not exists aeps_watcher_configs_enabled_idx
  on public.aeps_watcher_configs (enabled, portal_id);

alter table public.aeps_watcher_configs enable row level security;

drop policy if exists "aeps_watcher_configs all" on public.aeps_watcher_configs;
create policy "aeps_watcher_configs all"
  on public.aeps_watcher_configs
  for all
  to authenticated
  using ((select public.is_back_office()))
  with check ((select public.is_back_office()));

grant select, insert, update, delete on table public.aeps_watcher_configs to authenticated;

create or replace function public.save_aeps_watcher_config(
  p_portal_id uuid,
  p_enabled boolean,
  p_poll_interval_seconds integer,
  p_source_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null or not (select public.is_back_office()) then
    raise exception 'Forbidden';
  end if;

  if p_portal_id is null then
    raise exception 'AEPS portal is required';
  end if;

  if not exists (
    select 1
      from public.aeps_portals
     where id = p_portal_id
       and is_active = true
  ) then
    raise exception 'Selected AEPS portal is not active';
  end if;

  if p_poll_interval_seconds is null
     or p_poll_interval_seconds < 15
     or p_poll_interval_seconds > 3600 then
    raise exception 'Watcher interval must be between 15 and 3600 seconds';
  end if;

  insert into public.aeps_watcher_configs (
    service_type,
    portal_id,
    enabled,
    poll_interval_seconds,
    source_url,
    created_by,
    updated_at
  )
  values (
    'aeps',
    p_portal_id,
    coalesce(p_enabled, false),
    p_poll_interval_seconds,
    nullif(trim(p_source_url), ''),
    (select auth.uid()),
    now()
  )
  on conflict (service_type, portal_id)
  do update set
    enabled = excluded.enabled,
    poll_interval_seconds = excluded.poll_interval_seconds,
    source_url = excluded.source_url,
    updated_at = now()
  returning id into v_id;

  return jsonb_build_object(
    'saved', true,
    'id', v_id,
    'portal_id', p_portal_id,
    'enabled', coalesce(p_enabled, false),
    'poll_interval_seconds', p_poll_interval_seconds,
    'source_url', nullif(trim(p_source_url), '')
  );
end;
$$;

revoke execute on function public.save_aeps_watcher_config(uuid, boolean, integer, text) from public, anon;
grant execute on function public.save_aeps_watcher_config(uuid, boolean, integer, text) to authenticated;
