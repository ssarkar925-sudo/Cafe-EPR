-- Migration: AEPS Portal Watcher Sources CRUD and Archive Management
-- Persists multi-source portal configurations per portal with audit-safe archival.

create table if not exists public.aeps_portal_sources (
  id text primary key,
  portal_id text not null,
  portal_name text not null,
  url text not null,
  purpose text not null check (purpose in (
    'commission',
    'fee',
    'aeps_rules',
    'transaction_info',
    'provider_bank_info',
    'service_status',
    'general_updates'
  )),
  source_type text not null default 'web_page',
  is_enabled boolean not null default true,
  priority integer not null default 3,
  description text,
  last_checked timestamptz,
  last_status text default 'idle',
  last_message text,
  current_published_value jsonb not null default '{}'::jsonb,
  is_archived boolean not null default false,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Partial unique index: prevent duplicate active URLs for the same portal
create unique index if not exists aeps_portal_sources_portal_url_unique
  on public.aeps_portal_sources (portal_id, lower(trim(url)))
  where is_archived = false;

create index if not exists aeps_portal_sources_active_idx
  on public.aeps_portal_sources (portal_id, is_enabled)
  where is_archived = false;

alter table public.aeps_portal_sources enable row level security;

drop policy if exists "aeps_portal_sources all" on public.aeps_portal_sources;
create policy "aeps_portal_sources all"
  on public.aeps_portal_sources
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on table public.aeps_portal_sources to authenticated;
