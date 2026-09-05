-- RLS helper used by catalog authorization policies.
-- Keep it callable by authenticated browser requests while preventing anonymous/public execution.
grant execute on function public.is_admin() to authenticated;
revoke execute on function public.is_admin() from anon, public;
