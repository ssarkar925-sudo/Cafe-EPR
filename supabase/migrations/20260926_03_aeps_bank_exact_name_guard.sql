-- Enforce one active CafeERP AEPS bank master name, case-insensitive.
-- This supports the strict source-to-master exact-name matching rule and
-- prevents operators from creating duplicate active banks that differ only
-- by casing or surrounding whitespace.

create unique index if not exists aeps_banks_active_name_exact_uidx
  on public.aeps_banks (lower(btrim(name)))
  where is_active = true;
