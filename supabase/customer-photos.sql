-- Run this in Supabase SQL Editor (idempotent).
-- Customer profile photos: column + public storage bucket + policies.

alter table public.customers add column if not exists avatar_url text;

insert into storage.buckets (id, name, public) values ('customer-photos', 'customer-photos', true)
on conflict (id) do nothing;

create policy "customer-photos read" on storage.objects for select using (bucket_id = 'customer-photos');
create policy "customer-photos insert" on storage.objects for insert to authenticated with check (bucket_id = 'customer-photos');
create policy "customer-photos update" on storage.objects for update to authenticated using (bucket_id = 'customer-photos');
create policy "customer-photos delete" on storage.objects for delete to authenticated using (bucket_id = 'customer-photos');
