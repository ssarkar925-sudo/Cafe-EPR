create or replace view public.active_journal_source_violations as
select je.source_type, je.source_id, count(*) as active_count, array_agg(je.id order by je.created_at) as journal_entry_ids
from public.journal_entries je
where je.status='posted'
  and not exists (
    select 1 from public.journal_entries r
    where r.status='posted'
      and r.source_id=je.id
      and r.source_type ilike '%reversal%'
  )
group by je.source_type, je.source_id
having count(*) > 1;
