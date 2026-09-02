-- Versioned owner-controlled AI workflow memory.
-- Each teaching creates a new immutable version. Revoke/rollback changes status only;
-- historical versions remain available for audit and recovery.
create table if not exists public.ai_workflow_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow_key text not null,
  version integer not null,
  name text not null,
  risk text not null default 'low' check (risk in ('low','medium','high','critical')),
  status text not null default 'draft' check (status in ('draft','active','disabled','revoked','archived')),
  confidence numeric(4,3) not null default 1.000 check (confidence >= 0 and confidence <= 1),
  instruction text not null,
  evidence jsonb not null default '{}'::jsonb,
  selector_map jsonb not null default '{}'::jsonb,
  supersedes_id uuid references public.ai_workflow_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  disabled_at timestamptz,
  disabled_by uuid references auth.users(id) on delete set null,
  unique(user_id, workflow_key, version)
);

create index if not exists ai_workflow_versions_user_key_idx
  on public.ai_workflow_versions(user_id, workflow_key, version desc);
create unique index if not exists ai_workflow_versions_one_active_idx
  on public.ai_workflow_versions(user_id, workflow_key)
  where status = 'active';

alter table public.ai_workflow_versions enable row level security;

drop policy if exists ai_workflow_versions_select on public.ai_workflow_versions;
create policy ai_workflow_versions_select on public.ai_workflow_versions
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists ai_workflow_versions_insert on public.ai_workflow_versions;
create policy ai_workflow_versions_insert on public.ai_workflow_versions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists ai_workflow_versions_update on public.ai_workflow_versions;
create policy ai_workflow_versions_update on public.ai_workflow_versions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.ai_workflow_versions is 'Versioned owner-controlled AI instructions/workflows. Historical versions remain for audit and rollback.';
