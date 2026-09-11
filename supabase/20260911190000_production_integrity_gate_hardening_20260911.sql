create index if not exists idx_purchase_returns_created_by on public.purchase_returns(created_by);
create index if not exists idx_payment_routing_defaults_created_by on public.payment_routing_defaults(created_by);

create or replace function public.validate_accounting_integrity()
returns table(check_name text, check_status text, details text)
language sql
stable
security definer
set search_path = public
as $$
select 'journal_balance'::text, case when abs(coalesce(sum(debit),0)-coalesce(sum(credit),0)) < 0.01 then 'PASS' else 'FAIL' end, 'Debits='||round(coalesce(sum(debit),0),2)||' Credits='||round(coalesce(sum(credit),0),2) from public.journal_lines
union all
select 'orphan_journal_lines', case when count(*)=0 then 'PASS' else 'FAIL' end, 'Orphans='||count(*) from public.journal_lines jl left join public.journal_entries je on je.id=jl.journal_entry_id where je.id is null
union all
select 'invalid_account_lines', case when count(*)=0 then 'PASS' else 'FAIL' end, 'Invalid='||count(*) from public.journal_lines jl left join public.accounting_accounts a on a.id=jl.account_id where a.id is null
union all
select 'active_duplicate_sources', case when count(*)=0 then 'PASS' else 'FAIL' end, 'Duplicates='||count(*) from (select je.source_type,je.source_id,count(*) from public.journal_entries je where je.status='posted' and not exists (select 1 from public.journal_entries r where r.status='posted' and r.source_id=je.id and r.source_type ilike '%reversal%') group by je.source_type,je.source_id having count(*)>1) x;
$$;

create or replace function public.prevent_active_duplicate_journal_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_exists boolean;
BEGIN
  IF NEW.status = 'posted' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.journal_entries je
      WHERE je.source_type = NEW.source_type
        AND je.source_id = NEW.source_id
        AND je.status = 'posted'
        AND NOT EXISTS (
          SELECT 1
          FROM public.journal_entries r
          WHERE r.status = 'posted'
            AND r.source_id = je.id
            AND r.source_type ILIKE '%reversal%'
        )
    ) INTO v_exists;
    IF v_exists THEN
      RAISE EXCEPTION 'Active journal already exists for source % / %', NEW.source_type, NEW.source_id USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

revoke all on function public.prevent_active_duplicate_journal_source() from public, anon;

drop trigger if exists trg_prevent_active_duplicate_journal_source on public.journal_entries;
create trigger trg_prevent_active_duplicate_journal_source before insert on public.journal_entries for each row execute function public.prevent_active_duplicate_journal_source();

revoke all on function public.validate_accounting_integrity() from public, anon;
