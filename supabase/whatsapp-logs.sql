-- WhatsApp Message History Tracker Table & Audit Logging
create table if not exists public.whatsapp_logs (
  id uuid primary key default gen_random_uuid(),
  recipient_phone text not null,
  recipient_name text,
  message_type text not null default 'custom', -- 'pos_invoice', 'quick_sale', 'banking_txn', 'due_reminder', 'day_close', 'custom', 'test'
  ref_id text,
  ref_number text,
  message_text text not null,
  status text not null default 'sent', -- 'sent', 'delivered', 'failed', 'fallback_link'
  provider text not null default 'local_gateway', -- 'local_gateway', 'meta', 'ultramsg', 'manual_link'
  error_message text,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null
);

create index if not exists whatsapp_logs_created_at_idx on public.whatsapp_logs (created_at desc);
create index if not exists whatsapp_logs_phone_idx on public.whatsapp_logs (recipient_phone);
create index if not exists whatsapp_logs_ref_number_idx on public.whatsapp_logs (ref_number);
create index if not exists whatsapp_logs_status_idx on public.whatsapp_logs (status);

alter table public.whatsapp_logs enable row level security;

drop policy if exists "whatsapp_logs authenticated read" on public.whatsapp_logs;
create policy "whatsapp_logs authenticated read" on public.whatsapp_logs
  for select to authenticated using (true);

drop policy if exists "whatsapp_logs authenticated insert" on public.whatsapp_logs;
create policy "whatsapp_logs authenticated insert" on public.whatsapp_logs
  for insert to authenticated with check (true);

drop policy if exists "whatsapp_logs authenticated update" on public.whatsapp_logs;
create policy "whatsapp_logs authenticated update" on public.whatsapp_logs
  for update to authenticated using (true);

-- Statistics RPC
create or replace function public.get_whatsapp_stats()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_total bigint;
  v_today bigint;
  v_sent bigint;
  v_failed bigint;
begin
  select count(*) into v_total from public.whatsapp_logs;
  select count(*) into v_today from public.whatsapp_logs where created_at >= current_date;
  select count(*) into v_sent from public.whatsapp_logs where status in ('sent', 'delivered');
  select count(*) into v_failed from public.whatsapp_logs where status = 'failed';

  return jsonb_build_object(
    'total', coalesce(v_total, 0),
    'today', coalesce(v_today, 0),
    'sent', coalesce(v_sent, 0),
    'failed', coalesce(v_failed, 0)
  );
end;
$$;

revoke all on function public.get_whatsapp_stats() from public, anon;
grant execute on function public.get_whatsapp_stats() to authenticated;
