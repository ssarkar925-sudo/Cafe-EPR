create table if not exists public.sai_world_state (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  route text,
  active_module text,
  customer jsonb,
  transaction jsonb,
  facts jsonb not null default '{}'::jsonb,
  recent_event_ids text[] not null default '{}',
  last_event_id text,
  last_event_type text,
  last_entity_id text,
  last_event_occurred_at timestamptz,
  version bigint not null default 0,
  observed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, actor_user_id)
);

create index if not exists sai_world_state_actor_idx
  on public.sai_world_state(actor_user_id, updated_at desc);

create index if not exists sai_world_state_business_idx
  on public.sai_world_state(business_id, updated_at desc);

alter table public.sai_world_state enable row level security;

drop policy if exists sai_world_state_staff_read on public.sai_world_state;
create policy sai_world_state_staff_read
  on public.sai_world_state for select
  to authenticated
  using (
    actor_user_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active
        and p.role in ('admin','manager','staff')
    )
  );

drop policy if exists sai_world_state_staff_insert on public.sai_world_state;
create policy sai_world_state_staff_insert
  on public.sai_world_state for insert
  to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active
        and p.role in ('admin','manager','staff')
    )
  );

drop policy if exists sai_world_state_staff_update on public.sai_world_state;
create policy sai_world_state_staff_update
  on public.sai_world_state for update
  to authenticated
  using (
    actor_user_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active
        and p.role in ('admin','manager','staff')
    )
  )
  with check (
    actor_user_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active
        and p.role in ('admin','manager','staff')
    )
  );
