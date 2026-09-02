-- Correct the execution-lock index migration: ai_action_approvals has created_at, not updated_at.
-- If the preceding execution migration has already been applied, this is harmless.
create index if not exists ai_action_approvals_executing_idx
  on public.ai_action_approvals(status, created_at);
