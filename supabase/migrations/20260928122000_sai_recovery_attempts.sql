create table if not exists public.sai_recovery_attempts (
  recovery_id uuid primary key default gen_random_uuid(),
  attention_id uuid not null references public.sai_attention(attention_id) on delete cascade,
  business_id uuid,
  actor_user_id uuid,
  attempt_number integer not null check (attempt_number > 0),
  strategy text not null check (strategy in ('retry_verification','manual_recheck')),
  status text not null default 'planned' check (status in ('planned','executing','succeeded','failed','blocked')),
  reason text,
  result jsonb not null default '{}'::jsonb,
  evidence_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(attention_id, attempt_number)
);

create index if not exists sai_recovery_attempts_attention_idx
  on public.sai_recovery_attempts(attention_id, attempt_number desc);

alter table public.sai_recovery_attempts enable row level security;

drop policy if exists sai_recovery_staff_read on public.sai_recovery_attempts;
create policy sai_recovery_staff_read on public.sai_recovery_attempts for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role in ('admin','manager','staff')
  )
);

drop policy if exists sai_recovery_staff_insert on public.sai_recovery_attempts;
create policy sai_recovery_staff_insert on public.sai_recovery_attempts for insert to authenticated
with check (
  actor_user_id = auth.uid() and
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role in ('admin','manager','staff')
  )
);

drop policy if exists sai_recovery_staff_update on public.sai_recovery_attempts;
create policy sai_recovery_staff_update on public.sai_recovery_attempts for update to authenticated
using (
  actor_user_id = auth.uid() and
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role in ('admin','manager','staff')
  )
)
with check (
  actor_user_id = auth.uid() and
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role in ('admin','manager','staff')
  )
);
