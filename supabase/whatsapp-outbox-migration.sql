-- ==============================================================================
-- WHATSAPP AUTOMATION 2.0 — DURABLE OUTBOX & PREFERENCE MIGRATION
-- ==============================================================================

-- 1. Create WhatsApp Outbox Table
create table if not exists public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  phone text not null,
  recipient_name text,
  message_type text not null,
  template_id text,
  message_body text not null,
  reference_type text,
  reference_id text,
  idempotency_key text unique,
  status text not null default 'PENDING',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider text not null default 'local_gateway',
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  user_id uuid references auth.users(id) on delete set null
);

-- Indices for rapid queue polling and phone search
create index if not exists whatsapp_outbox_queue_idx on public.whatsapp_outbox (status, next_attempt_at) where status in ('PENDING', 'PROCESSING');
create index if not exists whatsapp_outbox_created_at_idx on public.whatsapp_outbox (created_at desc);
create index if not exists whatsapp_outbox_phone_idx on public.whatsapp_outbox (phone);
create index if not exists whatsapp_outbox_idempotency_idx on public.whatsapp_outbox (idempotency_key);

-- Row Level Security
alter table public.whatsapp_outbox enable row level security;
create policy "whatsapp_outbox select" on public.whatsapp_outbox for select to authenticated using (true);
create policy "whatsapp_outbox insert" on public.whatsapp_outbox for insert to authenticated with check (true);
create policy "whatsapp_outbox update" on public.whatsapp_outbox for update to authenticated using (true);
create policy "whatsapp_outbox public select" on public.whatsapp_outbox for select to anon using (true);

-- 2. Add WhatsApp Notification Preferences to Customers Table
alter table public.customers add column if not exists whatsapp_opt_out boolean not null default false;
alter table public.customers add column if not exists notify_invoices boolean not null default true;
alter table public.customers add column if not exists notify_payments boolean not null default true;
alter table public.customers add column if not exists notify_dues boolean not null default true;
alter table public.customers add column if not exists notify_services boolean not null default true;

-- 3. Add Automation Rules Configuration to Settings Table
alter table public.settings add column if not exists whatsapp_automations jsonb default '{
  "auto_send_pos": true,
  "auto_send_quick": true,
  "auto_send_payment": true,
  "auto_send_due_reminder": true,
  "auto_send_document_ready": true,
  "auto_send_aeps": true,
  "auto_send_dmt": true,
  "auto_send_recharge": true,
  "auto_send_daily_summary": false,
  "auto_send_financial_alerts": true
}'::jsonb;

