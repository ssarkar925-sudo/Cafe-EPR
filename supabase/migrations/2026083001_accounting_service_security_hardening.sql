-- Canonical service/subservice model
alter table public.services add column if not exists service_code text;
alter table public.services add column if not exists service_type text default 'general';
alter table public.services add column if not exists parent_service_id uuid references public.services(id) on delete restrict;
alter table public.transactions add column if not exists service_id uuid references public.services(id) on delete restrict;
alter table public.transactions add column if not exists subservice_id uuid references public.services(id) on delete restrict;
create unique index if not exists services_service_code_uidx on public.services(service_code) where service_code is not null;
create index if not exists services_parent_service_id_idx on public.services(parent_service_id);
create index if not exists transactions_service_id_idx on public.transactions(service_id);
create index if not exists transactions_subservice_id_idx on public.transactions(subservice_id);

create table if not exists public.accounting_accounts(id uuid primary key default gen_random_uuid(),code text not null unique,name text not null,account_type text not null check(account_type in ('asset','liability','equity','income','expense','contra_asset','contra_income')),is_active boolean not null default true,created_at timestamptz not null default now());
create table if not exists public.journal_entries(id uuid primary key default gen_random_uuid(),entry_number text not null unique,entry_date date not null default current_date,source_type text not null,source_id uuid,description text not null,status text not null default 'posted' check(status in ('posted','reversed','void')),posted_by uuid references auth.users(id),created_at timestamptz not null default now(),unique(source_type,source_id));
create table if not exists public.journal_lines(id uuid primary key default gen_random_uuid(),journal_entry_id uuid not null references public.journal_entries(id) on delete restrict,account_id uuid not null references public.accounting_accounts(id) on delete restrict,line_no integer not null,debit numeric(18,2) not null default 0 check(debit>=0),credit numeric(18,2) not null default 0 check(credit>=0),description text,created_at timestamptz not null default now(),check((debit>0 and credit=0) or (credit>0 and debit=0)),unique(journal_entry_id,line_no));
create index if not exists journal_entries_date_idx on public.journal_entries(entry_date);
create index if not exists journal_entries_source_idx on public.journal_entries(source_type,source_id);
create index if not exists journal_lines_entry_idx on public.journal_lines(journal_entry_id);
create index if not exists journal_lines_account_idx on public.journal_lines(account_id);
insert into public.accounting_accounts(code,name,account_type) values('1000','Cash Drawer','asset'),('1010','Bank Accounts','asset'),('1020','UPI / QR','asset'),('1030','Wallets','asset'),('1040','AEPS Float','asset'),('1050','DMT Float','asset'),('1060','Credit Card Float','asset'),('1200','Inventory','asset'),('1300','Accounts Receivable','asset'),('1400','Business Clearing','asset'),('2000','Accounts Payable','liability'),('2100','GST Output','liability'),('2200','GST Input','asset'),('3000','Owner Equity','equity'),('4000','Product Sales','income'),('4010','Service Revenue','income'),('4020','Service Fees','income'),('4030','Commission Income','income'),('5000','Cost of Goods Sold','expense'),('5100','Sales Returns','contra_income'),('5200','Inventory Adjustment','expense'),('6000','Operating Expenses','expense') on conflict(code) do nothing;
create sequence if not exists public.journal_entry_seq;

-- Security hardening for the public API surface.
do $$ declare r record; begin for r in select p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef loop execute format('revoke execute on function public.%I(%s) from public',r.proname,r.args); execute format('revoke execute on function public.%I(%s) from anon',r.proname,r.args); end loop; end $$;

drop policy if exists "Authenticated users can insert/update audit findings" on public.audit_findings;
drop policy if exists "Staff can view audit findings" on public.audit_findings;
create policy "audit_findings back_office read" on public.audit_findings for select to authenticated using((select public.is_back_office()));
drop policy if exists "Authenticated users can insert/update audit" on public.audit_runs;
drop policy if exists "Staff can view audit runs" on public.audit_runs;
create policy "audit_runs back_office read" on public.audit_runs for select to authenticated using((select public.is_back_office()));
revoke all on public.audit_findings,public.audit_runs from anon;
revoke insert,update,delete on public.audit_findings,public.audit_runs from authenticated;
