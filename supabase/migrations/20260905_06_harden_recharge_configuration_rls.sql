drop policy if exists "recharge slabs insert" on public.recharge_commission_slabs;
drop policy if exists "recharge slabs update" on public.recharge_commission_slabs;
drop policy if exists "recharge slabs delete" on public.recharge_commission_slabs;
create policy "recharge slabs insert backoffice" on public.recharge_commission_slabs for insert to authenticated with check (is_back_office());
create policy "recharge slabs update backoffice" on public.recharge_commission_slabs for update to authenticated using (is_back_office()) with check (is_back_office());
create policy "recharge slabs delete backoffice" on public.recharge_commission_slabs for delete to authenticated using (is_back_office());

drop policy if exists "recharge providers insert" on public.recharge_providers;
drop policy if exists "recharge providers update" on public.recharge_providers;
drop policy if exists "recharge providers delete" on public.recharge_providers;
create policy "recharge providers insert backoffice" on public.recharge_providers for insert to authenticated with check (is_back_office());
create policy "recharge providers update backoffice" on public.recharge_providers for update to authenticated using (is_back_office()) with check (is_back_office());
create policy "recharge providers delete backoffice" on public.recharge_providers for delete to authenticated using (is_back_office());
