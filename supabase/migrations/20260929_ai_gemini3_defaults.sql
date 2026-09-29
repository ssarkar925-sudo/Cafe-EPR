-- Migration: Move CafeERP AI defaults to current Gemini 3.x models.
-- Gemini 2.5 is restricted for new users/projects; keep the saved API keys but
-- stop selecting the restricted 2.5 models by default. See:
-- https://ai.google.dev/gemini-api/docs/deprecations

DO $
BEGIN
  IF to_regclass('public.ai_provider_configs') IS NOT NULL THEN
    UPDATE public.ai_provider_configs
    SET model_name = 'gemini-3.8-flash',
        updated_at = now()
    WHERE active_provider = 'gemini'
      AND model_name IN (
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-2.0-flash-001',
        'gemini-2.0-flash-lite',
        'gemini-2.0-flash-lite-001'
      );
  END IF;
END $;

UPDATE public.settings
SET ai_config = jsonb_set(
  COALESCE(ai_config, '{}'::jsonb),
  '{model_name}',
  '"gemini-3.8-flash"'::jsonb,
  true
),
updated_at = now()
WHERE COALESCE(ai_config->>'active_provider', '') = 'gemini'
  AND COALESCE(ai_config->>'model_name', '') IN (
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-001',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash-lite-001'
  );
