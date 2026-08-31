-- =====================================================================
-- WhatsApp opt-out list  (run after whatsapp-security-fix.sql)
-- =====================================================================
-- The gateway watches inbound messages for STOP / UNSUBSCRIBE and records
-- the sender here, then refuses all future sends to that number.
--
-- This is not just a compliance nicety. Repeatedly messaging someone who
-- asked you to stop is what produces "Report / Block" taps, and a cluster
-- of those reports is the most reliable way to get a WhatsApp number
-- permanently banned. For a cafe whose number IS its customer channel,
-- that is an expensive failure.
--
-- Service-role only: RLS on, no policies. The gateway reads and writes it
-- with SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
-- Idempotent -- safe to re-run.
-- =====================================================================

create table if not exists public.whatsapp_opt_outs (
  jid          text primary key,          -- e.g. 919876543210@s.whatsapp.net
  opted_out_at timestamptz not null default now(),
  revoked_at   timestamptz,               -- set when the customer replies START
  source       text default 'inbound_stop',
  note         text
);

create index if not exists whatsapp_opt_outs_active_idx
  on public.whatsapp_opt_outs (jid)
  where revoked_at is null;

alter table public.whatsapp_opt_outs enable row level security;

-- No policies on purpose: anon and authenticated get nothing.
revoke all on public.whatsapp_opt_outs from anon, authenticated;

-- Optional: let admins review the list from the dashboard. Uncomment if you
-- add a UI for it. Requires public.is_admin() from whatsapp-security-fix.sql.
--
-- create policy "opt_outs admin read"
--   on public.whatsapp_opt_outs
--   for select to authenticated
--   using (public.is_admin());
