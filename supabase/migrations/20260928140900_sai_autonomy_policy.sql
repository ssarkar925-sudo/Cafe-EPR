create table if not exists public.sai_autonomy_policies (
  policy_id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  autonomy_enabled boolean not null default true,
  max_auto_risk text not null default 'low' check (max_auto_risk in ('read','low','medium','high','critical')),
  daily_action_budget integer not null default 20 check (daily_action_budget between 0 and 1000),
  autonomous_actions_used integer not null default 0 check (autonomous_actions_used >= 0),
  budget_date date not null default current_date,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  quiet_hours_timezone text not null default 'Asia/Kolkata',
  critical_interrupt boolean not null default true,
  require_approval_for_mutations boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, actor_user_id)
);
create index if not exists sai_autonomy_policies_actor_idx on public.sai_autonomy_policies(actor_user_id, business_id);
alter table public.sai_autonomy_policies enable row level security;
grant select, insert, update on public.sai_autonomy_policies to authenticated;
drop policy if exists sai_autonomy_policies_staff_read on public.sai_autonomy_policies;
create policy sai_autonomy_policies_staff_read on public.sai_autonomy_policies for select to authenticated using (
  actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager','staff'))
);
drop policy if exists sai_autonomy_policies_management_write on public.sai_autonomy_policies;
create policy sai_autonomy_policies_management_write on public.sai_autonomy_policies for all to authenticated using (
  actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager'))
) with check (
  actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager'))
);
create or replace function public.sai_consume_autonomy_budget(p_business_id uuid,p_actor_user_id uuid) returns boolean
language plpgsql security definer set search_path=public
as $$
declare v_ok boolean := false;
begin
  if p_actor_user_id <> (select auth.uid()) then return false; end if;
  update public.sai_autonomy_policies
    set budget_date=current_date,
        autonomous_actions_used=case when budget_date < current_date then 0 else autonomous_actions_used end,
        updated_at=now()
    where business_id=p_business_id and actor_user_id=p_actor_user_id and autonomy_enabled;
  update public.sai_autonomy_policies
    set autonomous_actions_used=autonomous_actions_used+1, updated_at=now()
    where business_id=p_business_id and actor_user_id=p_actor_user_id and autonomy_enabled
      and autonomous_actions_used < daily_action_budget;
  get diagnostics v_ok = row_count;
  return coalesce(v_ok,false);
end;
$$;
revoke execute on function public.sai_consume_autonomy_budget(uuid,uuid) from public, anon;
grant execute on function public.sai_consume_autonomy_budget(uuid,uuid) to authenticated;