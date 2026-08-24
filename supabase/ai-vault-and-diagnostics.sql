-- ==============================================================================
-- AI Intelligence Suite: Document Vault & Audit Snapshots
-- ==============================================================================

-- 1. AI Document Vault Table (GST Challans, Distributor Invoices, Tax Bills, KYC)
create table if not exists public.ai_document_vault (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'tax_bill', -- 'gst_challan', 'tax_bill', 'distributor_invoice', 'rent_receipt', 'bank_statement', 'kyc_doc', 'other'
  file_url text,
  document_date date not null default current_date,
  amount numeric default 0,
  vendor_name text,
  reference_number text,
  tags text[] default '{}'::text[],
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_document_vault enable row level security;

create policy "Authenticated users can read ai_document_vault"
  on public.ai_document_vault for select
  to authenticated
  using (true);

create policy "Staff/Admins can insert ai_document_vault"
  on public.ai_document_vault for insert
  to authenticated
  with check (public.is_back_office());

create policy "Staff/Admins can update ai_document_vault"
  on public.ai_document_vault for update
  to authenticated
  using (public.is_back_office());

create policy "Admins can delete ai_document_vault"
  on public.ai_document_vault for delete
  to authenticated
  using (public.is_admin());

-- 2. AI Audit Snapshots (Stores Periodic Health Scores & Closing Audit Summaries)
create table if not exists public.ai_audit_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_type text not null default 'daily', -- 'daily', 'month_end', 'quarterly', 'half_yearly', 'year_end', 'diagnostic'
  period_label text not null,
  health_score integer not null default 100,
  compliance_score integer not null default 100,
  metrics jsonb not null default '{}'::jsonb,
  anomalies jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.ai_audit_snapshots enable row level security;

create policy "Authenticated users can read ai_audit_snapshots"
  on public.ai_audit_snapshots for select
  to authenticated
  using (true);

create policy "Staff/Admins can insert ai_audit_snapshots"
  on public.ai_audit_snapshots for insert
  to authenticated
  with check (public.is_back_office());
