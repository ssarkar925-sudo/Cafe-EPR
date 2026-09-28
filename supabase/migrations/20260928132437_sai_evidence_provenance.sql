create table if not exists public.sai_evidence_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  evidence_id text not null references public.sai_evidence(evidence_id) on delete cascade,
  subject_type text not null check (subject_type in ('event','plan','goal','mission','command','command_step','command_result','verification','attention','evidence')),
  subject_id text not null,
  relation text not null check (relation in ('supports','derived_from','verifies','caused_by','explains')),
  created_at timestamptz not null default now()
);
create unique index if not exists sai_evidence_links_unique_idx
  on public.sai_evidence_links(actor_user_id,evidence_id,subject_type,subject_id,relation);
create index if not exists sai_evidence_links_subject_idx
  on public.sai_evidence_links(actor_user_id,subject_type,subject_id,created_at desc);
create index if not exists sai_evidence_links_evidence_idx
  on public.sai_evidence_links(actor_user_id,evidence_id,created_at desc);

alter table public.sai_evidence_links enable row level security;
grant select, insert on public.sai_evidence_links to authenticated;

drop policy if exists sai_evidence_links_staff_read on public.sai_evidence_links;
create policy sai_evidence_links_staff_read on public.sai_evidence_links for select to authenticated
using (
  actor_user_id=(select auth.uid())
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff'))
);

drop policy if exists sai_evidence_links_staff_insert on public.sai_evidence_links;
create policy sai_evidence_links_staff_insert on public.sai_evidence_links for insert to authenticated
with check (
  actor_user_id=(select auth.uid())
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff'))
  and exists(select 1 from public.sai_evidence e where e.evidence_id=sai_evidence_links.evidence_id and e.business_id=sai_evidence_links.business_id)
);