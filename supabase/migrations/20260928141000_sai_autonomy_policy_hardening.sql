alter table public.sai_autonomy_policies alter column autonomy_enabled set default false;
drop policy if exists sai_autonomy_policies_management_write on public.sai_autonomy_policies;
create policy sai_autonomy_policies_management_insert on public.sai_autonomy_policies for insert to authenticated with check (
  actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager'))
);
create policy sai_autonomy_policies_management_update on public.sai_autonomy_policies for update to authenticated using (
  actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager'))
) with check (
  actor_user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role in ('admin','manager'))
);
revoke delete, truncate, references, trigger on table public.sai_autonomy_policies from authenticated;