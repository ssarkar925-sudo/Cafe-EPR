-- Migration: Create ai_conversations table for cross-session memory
-- Stores recent AI conversation turns so the agent remembers context
-- across browser sessions and page reloads.

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast per-user ordered lookup
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_created
  ON public.ai_conversations (user_id, created_at DESC);

-- Enable RLS — users can only read/write their own conversations
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_conversations_owner" ON public.ai_conversations
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-prune: keep only last 100 turns per user (trigger)
CREATE OR REPLACE FUNCTION public.prune_ai_conversations()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.ai_conversations
  WHERE user_id = NEW.user_id
    AND id NOT IN (
      SELECT id FROM public.ai_conversations
      WHERE user_id = NEW.user_id
      ORDER BY created_at DESC
      LIMIT 100
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prune_ai_conversations ON public.ai_conversations;
CREATE TRIGGER trg_prune_ai_conversations
  AFTER INSERT ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.prune_ai_conversations();

COMMENT ON TABLE public.ai_conversations IS
  'Stores AI conversation history per user for cross-session memory. Auto-pruned to last 100 turns.';
