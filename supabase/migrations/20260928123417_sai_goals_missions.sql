create table if not exists public.sai_goals (
 goal_id uuid primary key default gen_random_uuid(), business_id uuid not null, actor_user_id uuid not null references public.profiles(id) on delete cascade,
 title text not null, objective text not null, status text not null default 'active' check (status in ('active','paused','completed','cancelled','failed')),
 priority text not null default 'normal' check (priority in ('low','normal','high','critical')), target jsonb not null default '{}'::jsonb,
 success_criteria jsonb not null default '[]'::jsonb, context jsonb not null default '{}'::jsonb, next_action text, due_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists public.sai_missions (
 mission_id uuid primary key default gen_random_uuid(), goal_id uuid not null references public.sai_goals(goal_id) on delete cascade,
 business_id uuid not null, actor_user_id uuid not null references public.profiles(id) on delete cascade, title text not null,
 status text not null default 'queued' check (status in ('queued','running','waiting_approval','blocked','completed','failed','cancelled')),
 plan jsonb not null default '{}'::jsonb, current_step integer not null default 0 check (current_step >= 0), attempt_count integer not null default 0 check (attempt_count >= 0),
 blocked_reason text, result jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz
);
create index if not exists sai_goals_actor_status_idx on public.sai_goals(actor_user_id,status,priority,updated_at desc);
create index if not exists sai_goals_due_idx on public.sai_goals(actor_user_id,due_at) where due_at is not null and status='active';
create index if not exists sai_missions_goal_status_idx on public.sai_missions(goal_id,status,updated_at desc);
create index if not exists sai_missions_actor_status_idx on public.sai_missions(actor_user_id,status,updated_at desc);
alter table public.sai_goals enable row level security; alter table public.sai_missions enable row level security;
grant select,insert,update on public.sai_goals to authenticated; grant select,insert,update on public.sai_missions to authenticated;
drop policy if exists sai_goals_staff_read on public.sai_goals;
create policy sai_goals_staff_read on public.sai_goals for select to authenticated using (actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff')));
drop policy if exists sai_goals_staff_insert on public.sai_goals;
create policy sai_goals_staff_insert on public.sai_goals for insert to authenticated with check (actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff')));
drop policy if exists sai_goals_staff_update on public.sai_goals;
create policy sai_goals_staff_update on public.sai_goals for update to authenticated using (actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff'))) with check (actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff')));
drop policy if exists sai_missions_staff_read on public.sai_missions;
create policy sai_missions_staff_read on public.sai_missions for select to authenticated using (actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff')));
drop policy if exists sai_missions_staff_insert on public.sai_missions;
create policy sai_missions_staff_insert on public.sai_missions for insert to authenticated with check (actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff')) and exists(select 1 from public.sai_goals g where g.goal_id=sai_missions.goal_id and g.actor_user_id=(select auth.uid()) and g.business_id=sai_missions.business_id));
drop policy if exists sai_missions_staff_update on public.sai_missions;
create policy sai_missions_staff_update on public.sai_missions for update to authenticated using (actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff'))) with check (actor_user_id=(select auth.uid()) and exists(select 1 from public.sai_goals g where g.goal_id=sai_missions.goal_id and g.actor_user_id=(select auth.uid()) and g.business_id=sai_missions.business_id));