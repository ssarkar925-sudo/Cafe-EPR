-- The login-attempt history RPC is admin-facing and must not be callable by anonymous/public clients.
revoke all on function public.recent_login_attempts(integer) from public;
revoke execute on function public.recent_login_attempts(integer) from anon;
grant execute on function public.recent_login_attempts(integer) to authenticated;
