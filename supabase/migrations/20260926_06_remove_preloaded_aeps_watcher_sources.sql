-- Remove code-seeded watcher sources from all environments.
-- User-configured sources are retained (created_by is set by the operator API).
delete from public.aeps_portal_sources
where created_by is null;