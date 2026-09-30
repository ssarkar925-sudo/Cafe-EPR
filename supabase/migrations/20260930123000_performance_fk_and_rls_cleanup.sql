-- 20260930 performance follow-up
-- Add covering indexes for non-SAI foreign keys flagged by Supabase
-- Performance Advisor and optimize the only non-SAI auth RLS init-plan
-- finding. No application authorization semantics are changed.

BEGIN;

CREATE INDEX IF NOT EXISTS aeps_portal_collection_observations_portal_id_idx
  ON public.aeps_portal_collection_observations (portal_id);

CREATE INDEX IF NOT EXISTS aeps_pricing_rules_bank_id_idx
  ON public.aeps_pricing_rules (bank_id);

CREATE INDEX IF NOT EXISTS aeps_pricing_rules_customer_id_idx
  ON public.aeps_pricing_rules (customer_id);

CREATE INDEX IF NOT EXISTS aeps_watcher_configs_created_by_idx
  ON public.aeps_watcher_configs (created_by);

CREATE INDEX IF NOT EXISTS aeps_watcher_configs_portal_id_idx
  ON public.aeps_watcher_configs (portal_id);

CREATE INDEX IF NOT EXISTS ai_reconciliation_drafts_approved_by_idx
  ON public.ai_reconciliation_drafts (approved_by);

-- RLS filters every conversation by user_id; index the filter column.
CREATE INDEX IF NOT EXISTS ai_conversations_user_id_idx
  ON public.ai_conversations (user_id);

-- Evaluate auth.uid() once per statement rather than once per candidate row.
ALTER POLICY "ai_conversations_owner"
  ON public.ai_conversations
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

COMMIT;
