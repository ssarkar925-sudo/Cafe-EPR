import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

function getRuntimeEnv(): Record<string, unknown> {
  try {
    const context = getCloudflareContext();
    return (context?.env as Record<string, unknown>) || {};
  } catch {
    // The helper also runs in non-Cloudflare environments (for local Next.js tooling).
    return {};
  }
}

function getAdminConfig() {
  const runtimeEnv = getRuntimeEnv();
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || runtimeEnv.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  // Prefer the canonical name, but support the existing Cloudflare secret alias
  // so an already-configured production secret can continue to be used.
  const serviceKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      runtimeEnv.SUPABASE_SERVICE_ROLE_KEY ||
      runtimeEnv.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      ""
  ).trim();

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for server-side admin operations.");
  }

  if (!serviceKey) {
    throw new Error("Supabase server secret is not available to the Worker runtime. Configure SUPABASE_SERVICE_ROLE_KEY as a Worker secret and redeploy.");
  }

  return { url, serviceKey };
}

export function createAdminClient() {
  const { url, serviceKey } = getAdminConfig();

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Server-only Supabase client for operations that must bypass RLS, such as
 * reading and writing WhatsApp credentials. Never expose this client or key
 * to the browser.
 */
export function createSecretsAdminClient() {
  const { url, serviceKey } = getAdminConfig();

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
