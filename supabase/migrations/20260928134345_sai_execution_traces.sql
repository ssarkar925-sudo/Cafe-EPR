create table if not exists public.sai_execution_traces (
  span_id uuid primary key default gen_random_uuid(),
  trace_id text not null,
  parent_span_id uuid references public.sai_execution_traces(span_id) on delete set null,
  business_id uuid not null,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  sequence_no integer not null check (sequence_no >= 0),
  phase text not null check (phase in ('OBSERVE','UNDERSTAND','IDENTIFY','RETRIEVE','REASON','PLAN','DECIDE','EXECUTE','VERIFY','LEARN','REMEMBER')),
  event_type text not null,
  status text not null check (status in ('started','completed','blocked','failed','skipped')),
  operation text not null,
  plan_id text, mission_id text, goal_id text, command_id text, step_id text,
  started_at timestamptz not null default now(), completed_at timestamptz,
  duration_ms integer check (duration_ms >= 0), message text,
  data jsonb not null default '{}'::jsonb, evidence_ids text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  unique (actor_user_id, trace_id, sequence_no)
);
create index if not exists sai_execution_traces_actor_trace_idx on public.sai_execution_traces(actor_user_id, trace_id, sequence_no);
create index if not exists sai_execution_traces_actor_plan_idx on public.sai_execution_traces(actor_user_id, plan_id, sequence_no desc) where plan_id is not null;
create index if not exists sai_execution_traces_actor_command_idx on public.sai_execution_traces(actor_user_id, command_id, sequence_no desc) where command_id is not null;
alter table public.sai_execution_traces enable row level security;
grant select, insert on public.sai_execution_traces to authenticated;
drop policy if exists sai_execution_traces_staff_read on public.sai_execution_traces;
create policy sai_execution_traces_staff_read on public.sai_execution_traces for select to authenticated using (
  actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff'))
);
drop policy if exists sai_execution_traces_staff_insert on public.sai_execution_traces;
create policy sai_execution_traces_staff_insert on public.sai_execution_traces for insert to authenticated with check (
  actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff'))
  and (parent_span_id is null or exists(select 1 from public.sai_execution_traces parent where parent.span_id=sai_execution_traces.parent_span_id and parent.actor_user_id=(select auth.uid()) and parent.business_id=sai_execution_traces.business_id and parent.trace_id=sai_execution_traces.trace_id))
);