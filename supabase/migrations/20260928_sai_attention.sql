create table if not exists public.sai_attention (
 attention_id uuid primary key default gen_random_uuid(),
 business_id uuid,
 actor_user_id uuid,
 type text not null,
 severity text not null check (severity in ('info','warning','critical')),
 title text not null,
 detail text,
 evidence_ids text[] not null default '{}',
 source_type text,
 source_ref text,
 status text not null default 'open' check (status in ('open','acknowledged','resolved')),
 resolution text,
 created_at timestamptz not null default now(),
 resolved_at timestamptz
);
create index if not exists sai_attention_business_status_idx on public.sai_attention(business_id,status,created_at desc);
alter table public.sai_attention enable row level security;
drop policy if exists sai_attention_staff_read on public.sai_attention;
create policy sai_attention_staff_read on public.sai_attention for select to authenticated
using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.role in ('admin','manager','staff')));
drop policy if exists sai_attention_staff_insert on public.sai_attention;
create policy sai_attention_staff_insert on public.sai_attention for insert to authenticated
with check (actor_user_id = auth.uid() and exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.role in ('admin','manager','staff')));
drop policy if exists sai_attention_staff_update on public.sai_attention;
create policy sai_attention_staff_update on public.sai_attention for update to authenticated
using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.role in ('admin','manager','staff')))
with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.role in ('admin','manager','staff')));