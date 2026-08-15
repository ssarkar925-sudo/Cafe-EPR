-- Run this in Supabase SQL Editor (idempotent).
-- Required for the Settings module (shop name, logo, receipt details).

create table if not exists public.settings (
  id smallint primary key default 1 check (id = 1),
  shop_name text not null default 'SCC OMM Cafe',
  phone text,
  address text,
  receipt_footer text,
  currency_symbol text not null default '₹',
  logo_url text,
  updated_at timestamptz default now()
);

insert into public.settings (id, shop_name) values (1, 'SCC OMM Cafe')
on conflict (id) do nothing;

alter table public.settings enable row level security;
create policy "settings all" on public.settings for all to authenticated using (true) with check (true);

-- Storage bucket for the shop logo
insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy "logos read" on storage.objects for select using (bucket_id = 'logos');
create policy "logos insert" on storage.objects for insert to authenticated with check (bucket_id = 'logos');
create policy "logos update" on storage.objects for update to authenticated using (bucket_id = 'logos');
create policy "logos delete" on storage.objects for delete to authenticated using (bucket_id = 'logos');
