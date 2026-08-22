-- Run this in Supabase SQL Editor (idempotent).
-- 1. Enable DELETE policy on cash_entries for authenticated back-office users
alter table public.cash_entries enable row level security;
drop policy if exists ""cash_entries delete"" on public.cash_entries;
create policy ""cash_entries delete"" on public.cash_entries for delete to authenticated using (public.is_back_office());

-- 2. Deduplicate any duplicate transaction cash_entries (keeps latest single entry per direction)
delete from public.cash_entries
where id in (
  select id from (
    select id, row_number() over (partition by ref_type, ref_id, direction order by created_at desc) as rn
    from public.cash_entries
    where ref_type = 'transaction'
  ) t
  where t.rn > 1
);
