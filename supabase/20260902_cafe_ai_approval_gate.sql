-- Cafe AI approval gate: proposal/approval audit trail only.
-- Execution remains application-owned; this table never performs financial writes.
create table if not exists public.ai_action_approvals (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  action text not null check (action in ('create_sale','create_invoice','write_transaction','delete_record','change_rule')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','executed','cancelled')),
  request_payload jsonb not null default '{}'::jsonb,
  decision_note text,
  execution_reference text,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  approved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ai_action_approvals_requested_by_idx on public.ai_action_approvals(requested_by, created_at desc);
create index if not exists ai_action_approvals_pending_idx on public.ai_action_approvals(status, expires_at);

alter table public.ai_action_approvals enable row level security;

drop policy if exists "ai approvals owner staff read" on public.ai_action_approvals;
create policy "ai approvals owner staff read"
  on public.ai_action_approvals for select
  to authenticated
  using (
    requested_by = (select auth.uid())
    or approved_by = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

drop policy if exists "ai approvals owner staff create" on public.ai_action_approvals;
create policy "ai approvals owner staff create"
  on public.ai_action_approvals for insert
  to authenticated
  with check (
    requested_by = (select auth.uid())
    and action in ('create_sale','create_invoice','write_transaction','delete_record','change_rule')
  );

drop policy if exists "ai approvals admin decide" on public.ai_action_approvals;
create policy "ai approvals admin decide"
  on public.ai_action_approvals for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

comment on table public.ai_action_approvals is 'Audit-only approval queue for Cafe AI. Approval does not itself execute a financial or destructive action.';
