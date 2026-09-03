-- Add covering indexes for AI workflow/approval foreign keys and remove
-- duplicate back-office SELECT policies that have identical predicates.
create index if not exists ai_action_approvals_approved_by_idx
  on public.ai_action_approvals (approved_by);
create index if not exists ai_workflow_versions_disabled_by_idx
  on public.ai_workflow_versions (disabled_by);
create index if not exists ai_workflow_versions_revoked_by_idx
  on public.ai_workflow_versions (revoked_by);
create index if not exists ai_workflow_versions_supersedes_id_idx
  on public.ai_workflow_versions (supersedes_id);

drop policy if exists "accounting_accounts back_office read" on public.accounting_accounts;
drop policy if exists "journal_entries back_office read" on public.journal_entries;
drop policy if exists "journal_lines back_office read" on public.journal_lines;