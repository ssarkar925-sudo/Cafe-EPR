-- WhatsApp Templates & Multi-Device Sync Migration
-- Run this script in the Supabase SQL Editor: https://supabase.com/dashboard/project/tvxehxnvuwojjbhysajp/sql

-- 1. Create whatsapp_templates table
create table if not exists public.whatsapp_templates (
  id text primary key default 'default',
  templates jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  gateway_session jsonb,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_templates add column if not exists gateway_session jsonb;

-- Enable RLS
alter table public.whatsapp_templates enable row level security;

-- Drop existing policies if any to avoid collision
drop policy if exists "whatsapp_templates select" on public.whatsapp_templates;
drop policy if exists "whatsapp_templates insert" on public.whatsapp_templates;
drop policy if exists "whatsapp_templates update" on public.whatsapp_templates;
drop policy if exists "whatsapp_templates public read" on public.whatsapp_templates;

-- Create policies for multi-device sync
create policy "whatsapp_templates select" on public.whatsapp_templates for select to authenticated using (true);
create policy "whatsapp_templates insert" on public.whatsapp_templates for insert to authenticated with check (true);
create policy "whatsapp_templates update" on public.whatsapp_templates for update to authenticated using (true);
create policy "whatsapp_templates public read" on public.whatsapp_templates for select to anon using (true);

-- 2. Add whatsapp_config column to settings table as an extra fallback
alter table public.settings add column if not exists whatsapp_config jsonb;
