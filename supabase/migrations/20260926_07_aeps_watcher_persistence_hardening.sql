-- AEPS watcher hardening:
-- 1) persist collection runs and per-source observations
-- 2) add the rule dimensions already used by the application
-- 3) keep watcher data auditable without mutating published pricing on collection

alter table public.aeps_pricing_rules
  add column if not exists transaction_type text not null default 'all';

alter table public.aeps_pricing_rules
  add column if not exists bank_id uuid references public.aeps_banks(id) on update cascade on delete restrict;

create index if not exists aeps_pricing_rules_runtime_idx
  on public.aeps_pricing_rules(portal_id, transaction_type, bank_id, min_amount, max_amount, priority)
  where service_type = 'aeps' and is_active = true;

create table if not exists public.aeps_portal_collection_runs (
  id text primary key,
  portal_id uuid not null references public.aeps_portals(id) on update cascade on delete restrict,
  portal_name text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  source_count integer not null default 0,
  successful_source_count integer not null default 0,
  failed_source_count integer not null default 0,
  conflict_count integer not null default 0,
  verification_status text not null,
  verified_context jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists aeps_portal_collection_runs_portal_idx
  on public.aeps_portal_collection_runs(portal_id, completed_at desc);

create table if not exists public.aeps_portal_collection_observations (
  id text primary key,
  collection_run_id text not null references public.aeps_portal_collection_runs(id) on delete cascade,
  source_id text not null,
  source_url text not null,
  portal_id uuid not null references public.aeps_portals(id) on update cascade on delete restrict,
  portal_name text not null,
  purpose text not null,
  http_status integer not null default 0,
  latency_ms integer not null default 0,
  extracted_at timestamptz not null,
  raw_snippet text not null default '',
  normalized_data jsonb not null default '{}'::jsonb,
  confidence text not null,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists aeps_portal_collection_observations_run_idx
  on public.aeps_portal_collection_observations(collection_run_id);

create index if not exists aeps_portal_collection_observations_source_idx
  on public.aeps_portal_collection_observations(source_id, extracted_at desc);

alter table public.aeps_portal_collection_runs enable row level security;
alter table public.aeps_portal_collection_observations enable row level security;

drop policy if exists "aeps_portal_collection_runs select back_office" on public.aeps_portal_collection_runs;
create policy "aeps_portal_collection_runs select back_office"
  on public.aeps_portal_collection_runs for select to authenticated using (is_back_office());

drop policy if exists "aeps_portal_collection_runs insert back_office" on public.aeps_portal_collection_runs;
create policy "aeps_portal_collection_runs insert back_office"
  on public.aeps_portal_collection_runs for insert to authenticated with check (is_back_office());

drop policy if exists "aeps_portal_collection_observations select back_office" on public.aeps_portal_collection_observations;
create policy "aeps_portal_collection_observations select back_office"
  on public.aeps_portal_collection_observations for select to authenticated using (is_back_office());

drop policy if exists "aeps_portal_collection_observations insert back_office" on public.aeps_portal_collection_observations;
create policy "aeps_portal_collection_observations insert back_office"
  on public.aeps_portal_collection_observations for insert to authenticated with check (is_back_office());

grant select, insert on public.aeps_portal_collection_runs to authenticated;
grant select, insert on public.aeps_portal_collection_observations to authenticated;

notify pgrst, 'reload schema';
