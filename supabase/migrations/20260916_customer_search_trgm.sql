-- Canonical customer search: trigram + functional indexes backing
-- server-side ilike lookups on customers(name, phone, code).
create extension if not exists pg_trgm;

create index if not exists customers_name_trgm_idx
  on public.customers using gin (name gin_trgm_ops);
create index if not exists customers_phone_trgm_idx
  on public.customers using gin (phone gin_trgm_ops);
create index if not exists customers_code_lower_idx
  on public.customers (lower(code));
