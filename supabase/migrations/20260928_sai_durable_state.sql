create table if not exists public.sai_events (
  id uuid primary key default gen_random_uuid(), event_id text not null unique, business_id uuid, event_type text not null,
  occurred_at timestamptz not null, actor_user_id uuid, entity_id text, payload jsonb not null default '{}'::jsonb,
  evidence_ids text[] not null default '{}', created_at timestamptz not null default now()
);
create index if not exists sai_events_type_time_idx on public.sai_events(event_type, occurred_at desc);
create table if not exists public.sai_commands (
  id uuid primary key default gen_random_uuid(), command_id text not null unique, idempotency_key text not null unique,
  business_id uuid, actor_user_id uuid, capability text not null, payload jsonb not null default '{}'::jsonb,
  risk text not null check (risk in ('read','low','medium','high','critical')), approval_id text,
  status text not null check (status in ('planned','validated','authorized','executing','executed','verified','failed','cancelled')),
  verification text not null check (verification in ('pending','verified','failed','not_applicable')), error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists sai_commands_business_status_idx on public.sai_commands(business_id,status,updated_at desc);
create table if not exists public.sai_command_steps (
  id uuid primary key default gen_random_uuid(), command_id text not null references public.sai_commands(command_id) on delete cascade,
  step_index integer not null, capability text not null, input jsonb not null default '{}'::jsonb,
  status text not null check (status in ('planned','executing','executed','verified','failed','cancelled')),
  started_at timestamptz, completed_at timestamptz, error text, unique(command_id,step_index)
);
create table if not exists public.sai_command_results (
  id uuid primary key default gen_random_uuid(), command_id text not null references public.sai_commands(command_id) on delete cascade,
  step_index integer, ok boolean not null, output jsonb not null default '{}'::jsonb, error text,
  evidence_ids text[] not null default '{}', created_at timestamptz not null default now()
);
create table if not exists public.sai_evidence (
  id uuid primary key default gen_random_uuid(), evidence_id text not null unique, business_id uuid,
  source_type text not null, source_ref text, observed_at timestamptz not null default now(),
  content_hash text, data jsonb not null default '{}'::jsonb,
  confidence numeric check (confidence is null or confidence >= 0 and confidence <= 1), created_at timestamptz not null default now()
);
create index if not exists sai_evidence_source_idx on public.sai_evidence(source_type,source_ref,observed_at desc);
alter table public.sai_events enable row level security;
alter table public.sai_commands enable row level security;
alter table public.sai_command_steps enable row level security;
alter table public.sai_command_results enable row level security;
alter table public.sai_evidence enable row level security;
drop policy if exists sai_events_staff_read on public.sai_events;
create policy sai_events_staff_read on public.sai_events for select to authenticated using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.role in ('admin','manager','staff')));
drop policy if exists sai_commands_staff_read on public.sai_commands;
create policy sai_commands_staff_read on public.sai_commands for select to authenticated using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.role in ('admin','manager','staff')));
drop policy if exists sai_steps_staff_read on public.sai_command_steps;
create policy sai_steps_staff_read on public.sai_command_steps for select to authenticated using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.role in ('admin','manager','staff')));
drop policy if exists sai_results_staff_read on public.sai_command_results;
create policy sai_results_staff_read on public.sai_command_results for select to authenticated using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.role in ('admin','manager','staff')));
drop policy if exists sai_evidence_staff_read on public.sai_evidence;
create policy sai_evidence_staff_read on public.sai_evidence for select to authenticated using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.role in ('admin','manager','staff')));
create or replace function public.sai_touch_command_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists sai_commands_touch_updated_at on public.sai_commands;
create trigger sai_commands_touch_updated_at before update on public.sai_commands for each row execute function public.sai_touch_command_updated_at();
