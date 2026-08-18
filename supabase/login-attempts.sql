-- Run this in Supabase SQL Editor (idempotent).
-- Records every sign-in attempt (success + failure) so failed logins are not lost.
-- The table is write-only via a security definer RPC; only admins can read it.

create table if not exists public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text,
  success boolean not null default false,
  error_message text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists login_attempts_email_idx on public.login_attempts (email);
create index if not exists login_attempts_created_idx on public.login_attempts (created_at desc);

alter table public.login_attempts enable row level security;
create policy "login_attempts no direct read" on public.login_attempts
  for select using (false);

create or replace function public.log_login_attempt(p_email text, p_success boolean, p_error text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_headers jsonb;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  insert into public.login_attempts (email, success, error_message, ip, user_agent)
  values (nullif(p_email, ''), coalesce(p_success, false), nullif(p_error, ''),
          nullif(v_headers->>'x-forwarded-for', ''), nullif(v_headers->>'user-agent', ''));
end;
$$;

create or replace function public.recent_login_attempts(p_limit int default 20)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role <> 'admin' then raise exception 'Forbidden'; end if;
  return coalesce((
    select jsonb_agg(x order by x.created_at desc)
    from (
      select email, success, error_message, ip, created_at
      from public.login_attempts
      order by created_at desc
      limit greatest(1, p_limit)
    ) x
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.log_login_attempt(text, boolean, text) to anon, authenticated;
grant execute on function public.recent_login_attempts(integer) to authenticated;