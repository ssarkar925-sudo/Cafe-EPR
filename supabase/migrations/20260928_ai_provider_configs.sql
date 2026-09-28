-- Migration: 20260928_ai_provider_configs.sql
-- Enables multi-provider AI model selection and Admin API key management.

CREATE TABLE IF NOT EXISTS public.ai_provider_configs (
  id text PRIMARY KEY DEFAULT 'default',
  active_provider text NOT NULL DEFAULT 'gemini',
  model_name text NOT NULL DEFAULT 'gemini-2.5-pro',
  api_key text,
  endpoint_url text,
  temperature numeric(3, 2) DEFAULT 0.2,
  max_tokens integer DEFAULT 2048,
  fallback_enabled boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

-- Seed default configuration row if not present
INSERT INTO public.ai_provider_configs (id, active_provider, model_name, fallback_enabled)
VALUES ('default', 'gemini', 'gemini-2.5-pro', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Security: Only authenticated admin role can view and update keys
ALTER TABLE public.ai_provider_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view and manage ai_provider_configs" ON public.ai_provider_configs;
CREATE POLICY "Admins can view and manage ai_provider_configs"
  ON public.ai_provider_configs
  FOR ALL
  USING (
    COALESCE(
      (SELECT p.role = 'admin' FROM public.profiles p WHERE p.id = auth.uid()),
      (SELECT u.role = 'admin' FROM public.users u WHERE u.id = auth.uid()),
      false
    )
  );

GRANT ALL ON public.ai_provider_configs TO authenticated;
GRANT ALL ON public.ai_provider_configs TO service_role;
REVOKE ALL ON public.ai_provider_configs FROM anon;
