begin;
create table if not exists public.api_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public,anon,authenticated;
create or replace function public.consume_api_rate_limit(p_key text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_now timestamptz:=clock_timestamp(); v_row public.api_rate_limits%rowtype;
begin
  if coalesce(trim(p_key),'')='' or p_limit<=0 or p_window_seconds<=0 then return false; end if;
  insert into public.api_rate_limits(rate_key,window_started_at,request_count,updated_at)
  values(p_key,v_now,1,v_now)
  on conflict(rate_key) do update
    set request_count=case when v_now-public.api_rate_limits.window_started_at >= make_interval(secs=>p_window_seconds) then 1 else public.api_rate_limits.request_count+1 end,
        window_started_at=case when v_now-public.api_rate_limits.window_started_at >= make_interval(secs=>p_window_seconds) then v_now else public.api_rate_limits.window_started_at end,
        updated_at=v_now
  returning * into v_row;
  return v_row.request_count <= p_limit;
end;
$$;
revoke all on function public.consume_api_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_api_rate_limit(text,integer,integer) to service_role;
create index if not exists api_rate_limits_updated_at_idx on public.api_rate_limits(updated_at);
commit;
