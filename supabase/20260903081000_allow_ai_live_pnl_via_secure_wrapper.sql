create or replace function public.get_ai_current_month_pnl(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if not public.is_back_office() then
    raise exception 'Forbidden';
  end if;

  select public.get_pnl_internal(p_from, p_to) into v_result;
  return v_result;
end;
$function$;

revoke all on function public.get_ai_current_month_pnl(date,date) from public;
grant execute on function public.get_ai_current_month_pnl(date,date) to authenticated;
