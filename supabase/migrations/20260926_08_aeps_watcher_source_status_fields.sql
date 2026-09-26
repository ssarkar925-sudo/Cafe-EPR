alter table public.aeps_portal_sources
  add column if not exists http_status integer,
  add column if not exists extraction_confidence text,
  add column if not exists last_successful_check timestamptz;

create index if not exists aeps_portal_collection_runs_portal_completed_idx
  on public.aeps_portal_collection_runs(portal_id, completed_at desc);