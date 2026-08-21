-- Run this in Supabase SQL Editor (idempotent).
-- User avatar photos + global audit log for the Cafe ERP app.

-- ---------- Avatar column on profiles ----------
alter table public.profiles add column if not exists avatar_url text;

-- ---------- Storage bucket for user avatars ----------
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars insert" on storage.objects for insert to authenticated with check (bucket_id = 'avatars');
create policy "avatars update" on storage.objects for update to authenticated using (bucket_id = 'avatars');
create policy "avatars delete" on storage.objects for delete to authenticated using (bucket_id = 'avatars');

-- ---------- Audit log ----------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  action text not null,
  entity text not null,
  entity_id text,
  description text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity);
create index if not exists audit_logs_user_idx on public.audit_logs (user_id);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs all" on public.audit_logs;
create policy "audit_logs all" on public.audit_logs
  for all to authenticated using (true) with check (true);
