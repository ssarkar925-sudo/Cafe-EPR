-- Persisted AEPS Portal Watcher source configuration.
-- The application already exposes CRUD endpoints against this table; production
-- was missing the table, causing "Could not find the table public.aeps_portal_sources".

create table if not exists public.aeps_portal_sources (
  id text primary key,
  portal_id uuid not null references public.aeps_portals(id) on update cascade on delete restrict,
  portal_name text not null,
  url text not null,
  source_type text not null default 'web_page',
  purpose text not null,
  is_enabled boolean not null default true,
  priority integer not null default 3,
  description text,
  last_checked timestamptz,
  last_status text not null default 'idle',
  last_message text,
  current_published_value jsonb not null default '{}'::jsonb,
  is_archived boolean not null default false,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aeps_portal_sources_priority_check check (priority between 1 and 99)
);

create index if not exists aeps_portal_sources_portal_idx
  on public.aeps_portal_sources(portal_id, is_archived, is_enabled, created_at);

create unique index if not exists aeps_portal_sources_active_url_uidx
  on public.aeps_portal_sources(portal_id, lower(btrim(url)))
  where is_archived = false;

alter table public.aeps_portal_sources enable row level security;

drop policy if exists "aeps_portal_sources select authenticated" on public.aeps_portal_sources;
create policy "aeps_portal_sources select authenticated"
  on public.aeps_portal_sources for select to authenticated
  using (is_back_office());

drop policy if exists "aeps_portal_sources insert back_office" on public.aeps_portal_sources;
create policy "aeps_portal_sources insert back_office"
  on public.aeps_portal_sources for insert to authenticated
  with check (is_back_office());

drop policy if exists "aeps_portal_sources update back_office" on public.aeps_portal_sources;
create policy "aeps_portal_sources update back_office"
  on public.aeps_portal_sources for update to authenticated
  using (is_back_office())
  with check (is_back_office());

drop policy if exists "aeps_portal_sources delete back_office" on public.aeps_portal_sources;
create policy "aeps_portal_sources delete back_office"
  on public.aeps_portal_sources for delete to authenticated
  using (is_back_office());

grant select, insert, update, delete on public.aeps_portal_sources to authenticated;

notify pgrst, 'reload schema';