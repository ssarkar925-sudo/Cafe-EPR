-- Production security/performance cleanup.
-- Keeps the database changes reproducible for every future environment.

ALTER VIEW public.active_journal_source_violations
  SET (security_invoker = true);

ALTER POLICY idempotency_requests_select_own
  ON public.idempotency_requests
  USING (
    (actor_id = (SELECT auth.uid()))
    OR (SELECT public.is_back_office())
  );

CREATE INDEX IF NOT EXISTS payment_routing_defaults_user_id_idx
  ON public.payment_routing_defaults (user_id)
  WHERE user_id IS NOT NULL;
