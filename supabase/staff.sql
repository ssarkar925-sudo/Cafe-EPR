-- Run this in Supabase SQL Editor (idempotent).
-- Required for staff/user management.

alter table public.profiles add column if not exists is_active boolean not null default true;
