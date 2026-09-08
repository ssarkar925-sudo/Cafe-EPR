-- The financial RPC boundary calls idempotency_acquire from authenticated browser sessions.
-- Keep anonymous execution closed while explicitly allowing authenticated and service-role callers.
REVOKE EXECUTE ON FUNCTION public.idempotency_acquire(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.idempotency_acquire(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.idempotency_acquire(text, text, jsonb) TO service_role;
