-- =====================================================================
-- WhatsApp Security Fix  (run this in the Supabase SQL Editor)
-- =====================================================================
-- WHY THIS EXISTS
--
-- supabase/whatsapp-templates.sql created this policy:
--
--   create policy "whatsapp_templates public read"
--     on public.whatsapp_templates for select to anon using (true);
--
-- The same row stores `gateway_session`, which scripts/whatsapp-gateway.js
-- fills with the contents of auth_info_baileys/*.json -- i.e. the WhatsApp
-- login credentials. The Supabase anon key is public by design (it ships in
-- the browser bundle on cafeerp.vercel.app), so ANY visitor could run:
--
--   GET /rest/v1/whatsapp_templates?id=eq.default&select=gateway_session
--
-- ...and walk away with the credentials needed to impersonate the shop's
-- WhatsApp account. The same row also leaks `config.gateway_url` and
-- `config.meta_access_token`.
--
-- This migration:
--   1. Removes anonymous access entirely.
--   2. Moves every secret into a table that ONLY the service role can touch.
--   3. Limits writes on the remaining (non-secret) config to admins.
--
-- This migration is idempotent -- safe to run more than once.
--
-- AFTER RUNNING THIS: rotate your credentials. See the checklist at the end.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Admin helper. Used by the write policies below.
--    security definer so it can read profiles without recursing into RLS.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;


-- ---------------------------------------------------------------------
-- 2. Secrets table: service role only.
--
--    RLS is enabled and NO policies are created. That is deliberate --
--    with RLS on and zero policies, anon and authenticated get nothing.
--    The service role bypasses RLS, so only the gateway (which runs
--    server-side with SUPABASE_SERVICE_ROLE_KEY) can read or write.
-- ---------------------------------------------------------------------
create table if not exists public.whatsapp_gateway_secrets (
  id                text primary key default 'default',
  -- AES-256-GCM ciphertext of the Baileys auth files, not plaintext JSON.
  session_encrypted text,
  -- Sensitive provider credentials, moved out of whatsapp_templates.config.
  gateway_api_key   text,
  meta_access_token text,
  meta_phone_number_id text,
  ultramsg_token    text,
  ultramsg_instance_id text,
  updated_at        timestamptz not null default now()
);

alter table public.whatsapp_gateway_secrets enable row level security;

-- Belt and braces: strip the API-level grants too, so even a policy added
-- here by mistake later cannot expose this table to the public roles.
revoke all on public.whatsapp_gateway_secrets from anon, authenticated;

insert into public.whatsapp_gateway_secrets (id)
values ('default')
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 3. Migrate any existing secrets across, then destroy the originals.
-- ---------------------------------------------------------------------
do $$
declare
  v_cfg jsonb;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'whatsapp_templates'
      and column_name  = 'gateway_session'
  ) then
    -- The old session is plaintext and already considered compromised, so we
    -- deliberately do NOT carry it over. The gateway will prompt for a fresh
    -- QR scan and store the new session encrypted. Re-linking is the only
    -- way to invalidate keys that may already have been copied.
    execute 'alter table public.whatsapp_templates drop column gateway_session';
    raise notice 'Dropped exposed gateway_session column. Re-scan the QR code to relink.';
  end if;

  select config into v_cfg
  from public.whatsapp_templates
  where id = 'default';

  if v_cfg is not null then
    update public.whatsapp_gateway_secrets s
    set gateway_api_key      = coalesce(s.gateway_api_key,      v_cfg->>'gateway_api_key'),
        meta_access_token    = coalesce(s.meta_access_token,    v_cfg->>'meta_access_token'),
        meta_phone_number_id = coalesce(s.meta_phone_number_id, v_cfg->>'meta_phone_number_id'),
        ultramsg_token       = coalesce(s.ultramsg_token,       v_cfg->>'ultramsg_token'),
        ultramsg_instance_id = coalesce(s.ultramsg_instance_id, v_cfg->>'ultramsg_instance_id'),
        updated_at           = now()
    where s.id = 'default';

    -- Scrub the secrets out of the authenticated-readable config blob.
    update public.whatsapp_templates
    set config = config
                   - 'gateway_api_key'
                   - 'meta_access_token'
                   - 'ultramsg_token',
        updated_at = now()
    where id = 'default';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 4. Rebuild whatsapp_templates policies. No anon. Writes are admin-only.
-- ---------------------------------------------------------------------
alter table public.whatsapp_templates enable row level security;

drop policy if exists "whatsapp_templates select"      on public.whatsapp_templates;
drop policy if exists "whatsapp_templates insert"      on public.whatsapp_templates;
drop policy if exists "whatsapp_templates update"      on public.whatsapp_templates;
drop policy if exists "whatsapp_templates public read" on public.whatsapp_templates;  -- the hole
drop policy if exists "whatsapp_templates admin write" on public.whatsapp_templates;

-- Staff need to read templates to render message previews in the UI.
create policy "whatsapp_templates select"
  on public.whatsapp_templates
  for select to authenticated
  using (true);

-- Only admins may change gateway_url / automations / templates. Previously any
-- authenticated user could repoint gateway_url at their own server and collect
-- every customer phone number and message the app sent.
create policy "whatsapp_templates admin insert"
  on public.whatsapp_templates
  for insert to authenticated
  with check (public.is_admin());

create policy "whatsapp_templates admin update"
  on public.whatsapp_templates
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.whatsapp_templates from anon;


-- ---------------------------------------------------------------------
-- 5. settings.whatsapp_config was added as a "fallback" copy of the same
--    data. Scrub secrets out of it so it cannot become a second leak.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'settings'
      and column_name  = 'whatsapp_config'
  ) then
    update public.settings
    set whatsapp_config = whatsapp_config
                            - 'gateway_api_key'
                            - 'meta_access_token'
                            - 'ultramsg_token'
    where whatsapp_config is not null;
  end if;
end $$;

commit;


-- =====================================================================
-- VERIFY: run these after the migration.
-- =====================================================================
-- (a) Expect ZERO rows. Any row means something is still public.
--
--   select tablename, policyname, roles
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('whatsapp_templates', 'whatsapp_gateway_secrets')
--     and 'anon' = any(roles);
--
-- (b) Expect ZERO rows -- confirms the secrets table has no policies at all.
--
--   select policyname from pg_policies
--   where schemaname = 'public' and tablename = 'whatsapp_gateway_secrets';
--
-- (c) From a terminal, with your PUBLIC anon key, this must now return
--     an empty array or a permission error rather than credentials:
--
--   curl "https://<project>.supabase.co/rest/v1/whatsapp_templates?id=eq.default&select=*" \
--        -H "apikey: <ANON_KEY>"
--
-- =====================================================================
-- POST-MIGRATION CHECKLIST -- the SQL alone is not enough
-- =====================================================================
-- 1. Unlink the old WhatsApp session from your phone:
--    WhatsApp -> Settings -> Linked Devices -> remove the old entry.
--    The leaked keys stay valid until you do this.
--
-- 2. Rotate the Supabase service role key (Dashboard -> Settings -> API).
--    Note: supabase/whatsapp-templates.sql line 2 has your project URL
--    committed in a comment. That is not secret on its own, but combined
--    with the anon policy it was a complete path in.
--
-- 3. If you ever configured Meta or UltraMsg, rotate those tokens too --
--    they were readable by any authenticated user, and by anon while the
--    public-read policy existed.
--
-- 4. Generate the new gateway secrets (see DEPLOY-GCP-FREE.md step 6):
--      openssl rand -hex 32   # GATEWAY_API_KEY
--      openssl rand -hex 32   # SESSION_ENCRYPTION_KEY
--
-- 5. Re-scan the QR code once the hardened gateway is running.
-- =====================================================================
