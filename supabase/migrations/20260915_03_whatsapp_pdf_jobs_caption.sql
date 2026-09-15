-- Greeting caption for queued WhatsApp invoice PDFs.
-- Attached to the document message (the PDF is still delivered as a document).
-- Separate additive migration so it applies cleanly whether or not the base
-- whatsapp_pdf_jobs table migration has already run.

alter table public.whatsapp_pdf_jobs
  add column if not exists caption text;
