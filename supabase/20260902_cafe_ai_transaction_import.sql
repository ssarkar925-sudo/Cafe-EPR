-- Provider-neutral transaction ingestion inbox.
-- This is an audit/reconciliation staging layer; it does NOT execute a financial write.
create table if not exists public.ai_transaction_imports (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  provider_name text not null,
  source_type text not null check (source_type in ('aeps','upi_merchant','phone_merchant','money_transfer','other')),
  external_transaction_id text not null,
  external_reference text,
  status text not null,
  transaction_type text not null,
  amount numeric(14,2) not null check (amount > 0),
  fee numeric(14,2),
  commission numeric(14,2),
  occurred_at timestamptz,
  customer_name text,
  customer_mobile text,
  raw_data jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  state text not null default 'pending' check (state in ('pending','approved','rejected','imported','duplicate','needs_review')),
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, fingerprint)
);

create index if not exists ai_transaction_imports_created_by_idx
  on public.ai_transaction_imports(created_by, created_at desc);
create index if not exists ai_transaction_imports_state_idx
  on public.ai_transaction_imports(state, created_at desc);

alter table public.ai_transaction_imports enable row level security;

drop policy if exists "ai transaction imports owner staff read" on public.ai_transaction_imports;
create policy "ai transaction imports owner staff read"
  on public.ai_transaction_imports for select
  to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

drop policy if exists "ai transaction imports owner staff create" on public.ai_transaction_imports;
create policy "ai transaction imports owner staff create"
  on public.ai_transaction_imports for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
  );

comment on table public.ai_transaction_imports is 'Completed external transaction inbox for AI collection/reconciliation. It never initiates the external financial transaction.';
