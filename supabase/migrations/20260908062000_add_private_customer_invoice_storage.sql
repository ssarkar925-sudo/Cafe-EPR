-- Store customer invoice PDFs in a private Supabase Storage bucket.
-- External WhatsApp providers receive short-lived signed URLs instead of
-- trying to fetch the Vercel-hosted PDF route, which may be behind
-- Deployment Protection for non-browser callers.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'customer-invoices',
  'customer-invoices',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
