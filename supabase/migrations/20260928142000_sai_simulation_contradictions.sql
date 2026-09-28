create table if not exists public.sai_simulations (
  simulation_id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null,
  mode text not null check (mode in ('operator','background')),
  status text not null check (status in ('safe','blocked','contradiction')),
  baseline_hash text not null,
  predicted_state jsonb not null default '{}'::jsonb,
  contradictions jsonb not null default '[]'::jsonb,
  evidence_ids text[] not null default '{}'::text[],
  step_count integer not null default 0 check (step_count >= 0),
  created_at timestamptz not null default now(),
  unique (actor_user_id, simulation_id)
);

create table if not exists public.sai_contradictions (
  contradiction_id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  simulation_id uuid references public.sai_simulations(simulation_id) on delete cascade,
  plan_id text not null,
  step_id text,
  contradiction_type text not null check (contradiction_type in ('patch_conflict','baseline_mismatch','dependency_conflict','stale_state','unsupported_simulation')),
  severity text not null check (severity in ('warning','blocking','critical')),
  entity_key text,
  expected jsonb not null default '{}'::jsonb,
  observed jsonb not null default '{}'::jsonb,
  detail text not null,
  evidence_ids text[] not null default '{}'::text[],
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.sai_simulations add column if not exists evidence_ids text[] not null default '{}'::text[];

create index if not exists sai_simulations_actor_plan_idx on public.sai_simulations(actor_user_id, business_id, plan_id, created_at desc);
create index if not exists sai_contradictions_actor_status_idx on public.sai_contradictions(actor_user_id, business_id, status, severity, created_at desc);

alter table public.sai_simulations enable row level security;
alter table public.sai_contradictions enable row level security;

grant select, insert on public.sai_simulations to authenticated;
grant select, insert, update on public.sai_contradictions to authenticated;

drop policy if exists sai_simulations_staff_read on public.sai_simulations;
create policy sai_simulations_staff_read on public.sai_simulations for select to authenticated using (
  actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff'))
);

drop policy if exists sai_simulations_staff_insert on public.sai_simulations;
create policy sai_simulations_staff_insert on public.sai_simulations for insert to authenticated with check (
  actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff'))
);

drop policy if exists sai_contradictions_staff_read on public.sai_contradictions;
create policy sai_contradictions_staff_read on public.sai_contradictions for select to authenticated using (
  actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff'))
);

drop policy if exists sai_contradictions_staff_insert on public.sai_contradictions;
create policy sai_contradictions_staff_insert on public.sai_contradictions for insert to authenticated with check (
  actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff'))
  and (simulation_id is null or exists(select 1 from public.sai_simulations s where s.simulation_id=sai_contradictions.simulation_id and s.actor_user_id=(select auth.uid()) and s.business_id=sai_contradictions.business_id))
);

drop policy if exists sai_contradictions_staff_update on public.sai_contradictions;
create policy sai_contradictions_staff_update on public.sai_contradictions for update to authenticated using (
  actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff'))
) with check (
  actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff'))
);

revoke update, delete, truncate, references, trigger on table public.sai_simulations from authenticated;
revoke delete, truncate, references, trigger on table public.sai_contradictions from authenticated;