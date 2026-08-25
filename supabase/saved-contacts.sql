-- ==============================================================================
-- saved_contacts: opt-in contact book for DMT / UPI data entry.
-- UI/data-entry convenience only. No financial logic, no ledger linkage.
-- Suggestion sources merge: recent transactions first, then these saved rows.
-- ==============================================================================

create table if not exists public.saved_contacts (
  id uuid primary key default gen_random_uuid(),
  -- deterministic dedupe key, e.g. 'sender|name|mobile', 'beneficiary|ifsc|account', 'upi_receiver|upi_id'
  key text not null unique,
  kind text not null check (kind in ('sender', 'beneficiary', 'upi_receiver')),
  name text,
  mobile text,
  bank text,
  ifsc text,
  account_number text,
  upi_id text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_contacts_kind_idx on public.saved_contacts (kind);

alter table public.saved_contacts enable row level security;
drop policy if exists "saved_contacts all" on public.saved_contacts;

create policy "saved_contacts owner access"
on public.saved_contacts
for all
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());
