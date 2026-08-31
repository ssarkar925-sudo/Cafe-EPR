-- Common accounting transaction register + true General Ledger foundation.
-- Journal entries are the canonical accounting register; source_type/source_id links
-- every posted entry back to POS, purchase, expense, service, settlement, etc.

create index if not exists journal_entries_status_date_idx
  on public.journal_entries(status, entry_date desc);

create or replace view public.accounting_transaction_register
with (security_invoker = true) as
select
  je.id,
  je.entry_number,
  je.entry_date,
  je.source_type,
  je.source_id,
  je.description,
  je.status,
  je.posted_by,
  je.created_at,
  coalesce(sum(jl.debit), 0)::numeric(18,2) as total_debit,
  coalesce(sum(jl.credit), 0)::numeric(18,2) as total_credit,
  count(jl.id)::integer as line_count
from public.journal_entries je
left join public.journal_lines jl on jl.journal_entry_id = je.id
group by je.id;

create or replace view public.accounting_general_ledger
with (security_invoker = true) as
select
  jl.id as line_id,
  je.id as journal_entry_id,
  je.entry_number,
  je.entry_date,
  je.source_type,
  je.source_id,
  je.description as entry_description,
  je.status,
  aa.id as account_id,
  aa.code as account_code,
  aa.name as account_name,
  aa.account_type,
  jl.line_no,
  jl.debit,
  jl.credit,
  jl.description as line_description,
  jl.created_at
from public.journal_lines jl
join public.journal_entries je on je.id = jl.journal_entry_id
join public.accounting_accounts aa on aa.id = jl.account_id;

-- Keep accounting records visible only to authenticated back-office users.
alter table public.accounting_accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;

drop policy if exists "accounting_accounts back_office read" on public.accounting_accounts;
create policy "accounting_accounts back_office read"
  on public.accounting_accounts for select to authenticated
  using ((select public.is_back_office()));

drop policy if exists "journal_entries back_office read" on public.journal_entries;
create policy "journal_entries back_office read"
  on public.journal_entries for select to authenticated
  using ((select public.is_back_office()));

drop policy if exists "journal_lines back_office read" on public.journal_lines;
create policy "journal_lines back_office read"
  on public.journal_lines for select to authenticated
  using ((select public.is_back_office()));

-- Prevent direct mutation through the public API; accounting posting must be done
-- by trusted server-side/RPC workflows.
revoke insert, update, delete on public.accounting_accounts from authenticated;
revoke insert, update, delete on public.journal_entries from authenticated;
revoke insert, update, delete on public.journal_lines from authenticated;
