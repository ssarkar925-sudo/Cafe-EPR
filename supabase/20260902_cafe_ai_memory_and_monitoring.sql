-- Cafe AI persistent memory + monitoring model.
-- Memory is owner-scoped and stores instructions/preferences/workflows, not secrets.
create table if not exists public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('preference','instruction','workflow','conversation_summary','business_insight')),
  memory_key text not null,
  memory_value jsonb not null,
  source text not null default 'owner',
  confidence numeric(4,3) not null default 1.000 check (confidence >= 0 and confidence <= 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, category, memory_key)
);

alter table public.ai_memories enable row level security;

drop policy if exists ai_memories_select on public.ai_memories;
create policy ai_memories_select on public.ai_memories for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists ai_memories_insert on public.ai_memories;
create policy ai_memories_insert on public.ai_memories for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists ai_memories_update on public.ai_memories;
create policy ai_memories_update on public.ai_memories for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists ai_memories_delete on public.ai_memories;
create policy ai_memories_delete on public.ai_memories for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.ai_monitor_events (
  id uuid primary key default gen_random_uuid(),
  severity text not null check (severity in ('info','attention','critical')),
  source text not null check (source in ('application','business','transaction','security','customer','inventory','system')),
  title text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','acknowledged','resolved','dismissed')),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.ai_monitor_events enable row level security;

-- Monitor events are written by trusted server-side jobs. Owners/admins can read them.
drop policy if exists ai_monitor_events_select on public.ai_monitor_events;
create policy ai_monitor_events_select on public.ai_monitor_events for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin','staff')
    )
  );

create index if not exists ai_memories_user_active_idx on public.ai_memories(user_id, active, updated_at desc);
create index if not exists ai_monitor_events_open_idx on public.ai_monitor_events(status, severity, detected_at desc);
