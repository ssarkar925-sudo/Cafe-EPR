-- Migration: Add ai_config JSONB column to settings table
-- This enables dual-persistence of AI provider configuration
-- alongside the ai_provider_configs table.

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS ai_config jsonb;

COMMENT ON COLUMN public.settings.ai_config IS
  'Stores AI provider configuration: active provider, model, and per-provider API keys (encrypted at app layer).';
