-- ==============================================================================
-- AI DATA INGESTION PLATFORM (events inbox + reconciliation drafts)
-- ==============================================================================
-- One normalized pipeline for every provider (portal, phone notification,
-- SMS, email, manual upload, API):
--   SOURCE -> COLLECT -> NORMALIZE -> VALIDATE -> DEDUPE -> MATCH
--     -> ERP DRAFT -> APPROVAL -> APPLY
--
-- These tables NEVER execute financial writes. ai_ingestion_events stores
-- collected evidence; ai_reconciliation_drafts stores proposed writes that
-- only application code may apply after owner approval.
--
-- No secrets policy: OTPs, PINs, passwords, CVVs, card numbers and payment
-- authorization codes must never be stored here. Collectors redact them
-- before POSTing; the API route rejects payloads that contain them.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Ingestion events inbox (canonical AiIngestionEvent model).
-- ------------------------------------------------------------------------------
create table if not exists public.ai_ingestion_events (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default 'default',
  source_type text not null check (source_type in ('portal','phone_notification','sms','email','manual_upload','api')),
  source_provider text not null,
  source_instance text,
  external_event_id text,
  external_reference text,
  event_type text not null,
  status text not null default 'pending',
  occurred_at timestamptz,
  amount numeric(14,2),
  fee numeric(14,2),
  commission numeric(14,2),
  currency text not null default 'INR',
  customer_name text,
  customer_mobile text,
  account_last4 text check (account_last4 is null or account_last4 ~ '^[0-9]{4}$'),
  bank_name text,
  beneficiary text,
  metadata jsonb not null default '{}'::jsonb,
  raw_payload jsonb,
  content_hash text not null,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  validation_state text not null default 'unvalidated'
    check (validation_state in ('unvalidated','valid','needs_review','rejected')),
  matched_customer_id uuid,
  matched_transaction_id uuid,
  state text not null default 'pending'
    check (state in ('pending','needs_review','reconciled','duplicate','failed')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Duplicate protection at the database level (in addition to API checks):
-- same business + provider + external event id can exist only once.
create unique index if not exists ai_ingestion_events_provider_event_uq
  on public.ai_ingestion_events (business_id, source_provider, external_event_id)
  where external_event_id is not null;

create index if not exists ai_ingestion_events_state_idx
  on public.ai_ingestion_events (business_id, state, created_at desc);

create index if not exists ai_ingestion_events_hash_idx
  on public.ai_ingestion_events (business_id, content_hash);

create index if not exists ai_ingestion_events_source_idx
  on public.ai_ingestion_events (business_id, source_type, source_provider, created_at desc);

alter table public.ai_ingestion_events enable row level security;

drop policy if exists "ai ingestion events owner staff read" on public.ai_ingestion_events;
create policy "ai ingestion events owner staff read"
  on public.ai_ingestion_events for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role in ('admin', 'manager', 'staff')
    )
  );

drop policy if exists "ai ingestion events backoffice create" on public.ai_ingestion_events;
create policy "ai ingestion events backoffice create"
  on public.ai_ingestion_events for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role in ('admin', 'manager', 'staff')
    )
  );

drop policy if exists "ai ingestion events backoffice update" on public.ai_ingestion_events;
create policy "ai ingestion events backoffice update"
  on public.ai_ingestion_events for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role in ('admin', 'manager', 'staff')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role in ('admin', 'manager', 'staff')
    )
  );

comment on table public.ai_ingestion_events is 'Canonical AI ingestion inbox. Evidence only; never executes financial writes. Secrets (OTP/PIN/passwords) must never be stored here.';

-- ------------------------------------------------------------------------------
-- 2. Reconciliation drafts (proposed writes; application-owned apply only).
-- ------------------------------------------------------------------------------
create table if not exists public.ai_reconciliation_drafts (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default 'default',
  source_event_id uuid references public.ai_ingestion_events(id) on delete set null,
  action_type text not null check (action_type in ('link_customer','reconcile_transaction','record_customer_payment','record_provider_transaction','record_commission','categorize','mark_duplicate')),
  target_entity text not null,
  target_id uuid,
  proposed_payload jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  risk_level text not null default 'medium' check (risk_level in ('low','medium','high')),
  state text not null default 'pending'
    check (state in ('pending','approved','rejected','applied','failed','superseded')),
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  applied_ref text,
  created_at timestamptz not null default now()
);

create index if not exists ai_reconciliation_drafts_state_idx
  on public.ai_reconciliation_drafts (business_id, state, created_at desc);

create index if not exists ai_reconciliation_drafts_event_idx
  on public.ai_reconciliation_drafts (source_event_id);

alter table public.ai_reconciliation_drafts enable row level security;

drop policy if exists "ai reconciliation drafts owner staff read" on public.ai_reconciliation_drafts;
create policy "ai reconciliation drafts owner staff read"
  on public.ai_reconciliation_drafts for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role in ('admin', 'manager', 'staff')
    )
  );

drop policy if exists "ai reconciliation drafts backoffice create" on public.ai_reconciliation_drafts;
create policy "ai reconciliation drafts backoffice create"
  on public.ai_reconciliation_drafts for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role in ('admin', 'manager', 'staff')
    )
  );

drop policy if exists "ai reconciliation drafts admin decide" on public.ai_reconciliation_drafts;
create policy "ai reconciliation drafts admin decide"
  on public.ai_reconciliation_drafts for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

comment on table public.ai_reconciliation_drafts is 'Proposed ERP writes from AI ingestion. AI creates drafts; only application code applies them after owner approval.';
