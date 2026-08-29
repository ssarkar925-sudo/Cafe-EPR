-- WhatsApp production schema drift repair
-- Keeps the database contract aligned with the live WhatsApp automation code.

create table if not exists public.whatsapp_templates (
  id text primary key default 'default',
  templates jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  gateway_session jsonb,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_templates add column if not exists gateway_session jsonb;
alter table public.settings add column if not exists whatsapp_config jsonb;
alter table public.settings add column if not exists whatsapp_automations jsonb default '{"auto_send_pos":true,"auto_send_quick":true,"auto_send_payment":true,"auto_send_due_reminder":true,"auto_send_document_ready":true,"auto_send_aeps":true,"auto_send_dmt":true,"auto_send_recharge":true,"auto_send_daily_summary":false,"auto_send_financial_alerts":true}'::jsonb;

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

create index if not exists whatsapp_outbox_queue_idx on public.whatsapp_outbox (status, next_attempt_at) where status in ('PENDING','PROCESSING');
create index if not exists whatsapp_outbox_created_at_idx on public.whatsapp_outbox (created_at desc);
create index if not exists whatsapp_outbox_phone_idx on public.whatsapp_outbox (phone);

alter table public.whatsapp_templates enable row level security;
alter table public.whatsapp_outbox enable row level security;

drop policy if exists "whatsapp_templates select" on public.whatsapp_templates;
drop policy if exists "whatsapp_templates insert" on public.whatsapp_templates;
drop policy if exists "whatsapp_templates update" on public.whatsapp_templates;
drop policy if exists "whatsapp_templates public read" on public.whatsapp_templates;
create policy "whatsapp_templates select" on public.whatsapp_templates for select to authenticated using (true);
create policy "whatsapp_templates insert" on public.whatsapp_templates for insert to authenticated with check (is_back_office());
create policy "whatsapp_templates update" on public.whatsapp_templates for update to authenticated using (is_back_office()) with check (is_back_office());

drop policy if exists "whatsapp_outbox select" on public.whatsapp_outbox;
drop policy if exists "whatsapp_outbox insert" on public.whatsapp_outbox;
drop policy if exists "whatsapp_outbox update" on public.whatsapp_outbox;
drop policy if exists "whatsapp_outbox public select" on public.whatsapp_outbox;
create policy "whatsapp_outbox select" on public.whatsapp_outbox for select to authenticated using (true);
create policy "whatsapp_outbox insert" on public.whatsapp_outbox for insert to authenticated with check (auth.uid() is not null or is_back_office());
create policy "whatsapp_outbox update" on public.whatsapp_outbox for update to authenticated using (auth.uid() is not null or is_back_office()) with check (auth.uid() is not null or is_back_office());

alter table public.customers add column if not exists whatsapp_opt_out boolean not null default false;
alter table public.customers add column if not exists notify_invoices boolean not null default true;
alter table public.customers add column if not exists notify_payments boolean not null default true;
alter table public.customers add column if not exists notify_dues boolean not null default true;
alter table public.customers add column if not exists notify_services boolean not null default true;

insert into public.whatsapp_templates (id, templates, config)
values ('default', '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

-- The login-attempt history RPC already enforces admin authorization internally.
-- It must nevertheless not be callable by anonymous clients.
revoke execute on function public.recent_login_attempts(integer) from anon;
