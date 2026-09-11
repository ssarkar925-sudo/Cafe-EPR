create or replace function public.prevent_active_duplicate_journal_source()
returns trigger
language plpgsql
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
