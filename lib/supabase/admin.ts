import { createClient } from "@supabase/supabase-js";

function getAdminConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for server-side admin operations.");
  }

  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for server-side admin operations.");
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
