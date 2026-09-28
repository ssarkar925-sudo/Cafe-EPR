create table if not exists public.sai_diagnoses (
 diagnosis_id uuid primary key default gen_random_uuid(),
 attention_id uuid references public.sai_attention(attention_id) on delete set null,
 business_id uuid, actor_user_id uuid, source_type text not null, source_ref text,
 category text not null, confidence numeric not null check (confidence >= 0 and confidence <= 1),
 summary text not null, findings jsonb not null default '[]'::jsonb,
 next_action text not null check (next_action in ('review','retry_verification','reconcile','manual_check')),
 evidence_ids text[] not null default '{}',
 status text not null default 'open' check (status in ('open','accepted','resolved')),
 created_at timestamptz not null default now(), resolved_at timestamptz
);
create index if not exists sai_diagnoses_business_status_idx on public.sai_diagnoses(business_id,status,created_at desc);
alter table public.sai_diagnoses enable row level security;
drop policy if exists sai_diagnoses_staff_read on public.sai_diagnoses;
create policy sai_diagnoses_staff_read on public.sai_diagnoses for select to authenticated using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.role in ('admin','manager','staff')));
drop policy if exists sai_diagnoses_staff_insert on public.sai_diagnoses;
create policy sai_diagnoses_staff_insert on public.sai_diagnoses for insert to authenticated with check (actor_user_id=auth.uid() and exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.role in ('admin','manager','staff')));
drop policy if exists sai_diagnoses_staff_update on public.sai_diagnoses;
create policy sai_diagnoses_staff_update on public.sai_diagnoses for update to authenticated using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.role in ('admin','manager','staff'))) with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.role in ('admin','manager','staff')));
