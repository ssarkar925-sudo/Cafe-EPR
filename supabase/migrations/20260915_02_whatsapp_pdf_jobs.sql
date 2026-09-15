-- Durable outbox for WhatsApp invoice PDF delivery.
--
-- Background: the synchronous ERP -> gateway and browser -> gateway HTTPS hops
-- can both be rejected (Cloudflare edge 1003 on Workers egress; shop-network
-- blocks on direct delivery). The gateway already talks to Supabase over REST
-- on a proven path, so invoice PDFs are queued here and pulled by the gateway
-- poller. Live fast-paths (server send, browser direct) remain as accelerators;
-- this table is the delivery guarantee underneath them.
--
-- Security: invoice PDFs are customer financial documents. The table carries
-- no API keys, tokens, or provider credentials — only the recipient, the PDF
-- bytes (short-lived delivery payload), and delivery state. Row Level Security
-- restricts reads/writes to authenticated back-office staff; the gateway uses
-- the service-role key, which bypasses RLS by design.

create table if not exists public.whatsapp_pdf_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  invoice_id uuid not null,
  invoice_number text not null,
  recipient_phone text not null,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  document_base64 text not null,
  document_url text,
  provider text not null default 'local_gateway',
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_message_id text,
  error_message text,
  sent_at timestamptz
);

create index if not exists whatsapp_pdf_jobs_pending_idx
  on public.whatsapp_pdf_jobs (status, next_attempt_at, created_at)
  where status = 'pending';

alter table public.whatsapp_pdf_jobs enable row level security;

drop policy if exists "whatsapp_pdf_jobs select" on public.whatsapp_pdf_jobs;
create policy "whatsapp_pdf_jobs select"
  on public.whatsapp_pdf_jobs for select to authenticated
  using (public.is_back_office());

drop policy if exists "whatsapp_pdf_jobs insert" on public.whatsapp_pdf_jobs;
create policy "whatsapp_pdf_jobs insert"
  on public.whatsapp_pdf_jobs for insert to authenticated
  with check (public.is_back_office());

drop policy if exists "whatsapp_pdf_jobs update" on public.whatsapp_pdf_jobs;
create policy "whatsapp_pdf_jobs update"
  on public.whatsapp_pdf_jobs for update to authenticated
  using (public.is_back_office())
  with check (public.is_back_office());
