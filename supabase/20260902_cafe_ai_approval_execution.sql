-- Allow the approval gate to atomically claim an approved action before execution.
-- This is an execution-lock state, not a financial operation by itself.
alter table public.ai_action_approvals
drop constraint if exists ai_action_approvals_status_check;

alter table public.ai_action_approvals
add constraint ai_action_approvals_status_check
check (status in ('pending','approved','executing','rejected','expired','executed','cancelled'));

create index if not exists ai_action_approvals_executing_idx
  on public.ai_action_approvals(status, updated_at);
