-- Keep journal source corrections readable only to authorized back-office users.
alter table public.journal_source_corrections enable row level security;
drop policy if exists "journal source corrections back office read" on public.journal_source_corrections;
create policy "journal source corrections back office read"
  on public.journal_source_corrections
  for select
  to authenticated
  using (is_back_office());