-- Break the RLS self-reference used to validate parent SAI spans.
-- The helper can inspect parent rows as its owner, but only answers for the
-- authenticated actor and same business/trace; callers cannot inspect row data.
create schema if not exists private authorization postgres;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.sai_execution_trace_parent_allowed(
  p_parent_span_id uuid,
  p_actor_user_id uuid,
  p_business_id uuid,
  p_trace_id text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select p_actor_user_id = (select auth.uid())
    and exists (
      select 1
      from public.sai_execution_traces parent
      where parent.span_id = p_parent_span_id
        and parent.actor_user_id = p_actor_user_id
        and parent.business_id = p_business_id
        and parent.trace_id = p_trace_id
    );
$$;

revoke all on function private.sai_execution_trace_parent_allowed(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.sai_execution_trace_parent_allowed(uuid, uuid, uuid, text) to authenticated;

drop policy if exists sai_execution_traces_staff_insert on public.sai_execution_traces;
create policy sai_execution_traces_staff_insert
on public.sai_execution_traces
for insert
to authenticated
with check (
  actor_user_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('admin', 'manager', 'staff')
  )
  and (
    parent_span_id is null
    or private.sai_execution_trace_parent_allowed(
      parent_span_id,
      actor_user_id,
      business_id,
      trace_id
    )
  )
);
