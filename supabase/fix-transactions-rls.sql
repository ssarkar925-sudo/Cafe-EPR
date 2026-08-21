-- SECURITY: the core financial ledger (public.transactions) had RLS policies defined
-- but RLS was never ENABLED, so the policies were inert and any authenticated role
-- could read/write/delete rows directly. Enable RLS and (re)create back-office-gated
-- policies. Idempotent — safe to run repeatedly.
alter table public.transactions enable row level security;

drop policy if exists "transactions all" on public.transactions;
drop policy if exists "transactions back_office" on public.transactions;

create policy "transactions select" on public.transactions for select to authenticated using (public.is_back_office());
create policy "transactions insert" on public.transactions for insert to authenticated with check (public.is_back_office());
create policy "transactions update" on public.transactions for update to authenticated using (public.is_back_office()) with check (public.is_back_office());
