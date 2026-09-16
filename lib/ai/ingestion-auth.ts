/**
 * Shared authentication for the AI ingestion pipeline.
 *
 * Two identities, same least privilege:
 *  - owner/staff user session (Supabase auth cookies + role check), or
 *  - trusted machine worker presenting x-ingestion-worker-key matching the
 *    AI_INGESTION_WORKER_KEY server secret (constant-time compare).
 *
 * Worker identity may submit evidence and create drafts, and may read its own
 * pipeline state. It may NEVER approve drafts, execute writes, or touch
 * financial tables — those stay behind admin session auth.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getUserRole, hasRole } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { isValidWorkerKeyValue } from "@/lib/ai/secret-guard";

/**
 * Build fingerprint for the worker-auth implementation. Returned by the
 * temporary diagnostics endpoint so a probe can prove which code is
 * actually deployed. Bump when this file's auth logic changes.
 */
export const AUTH_BUILD = "worker-auth-v2-dual-source";

export type IngestionActor =
  | { type: "worker" }
  | { type: "user"; userId: string; role: string };

/**
 * Read the worker secret from every runtime source, mirroring the proven
 * Supabase admin pattern (lib/supabase/admin.ts): build-time process env
 * first, then the live Cloudflare Workers env bindings. A secret that is
 * bound to the Worker but missing from one source is still found.
 */
export function getWorkerKeyFromRuntime(): string {
  const fromProcess = String(process.env.AI_INGESTION_WORKER_KEY || "").trim();
  if (fromProcess) return fromProcess;
  try {
    const runtimeEnv = (getCloudflareContext()?.env as Record<string, unknown>) || {};
    return String(runtimeEnv.AI_INGESTION_WORKER_KEY || "").trim();
  } catch {
    // Non-Cloudflare runtimes (local tooling, plain Node tests).
    return "";
  }
}

export function isWorkerKeyConfigured(): boolean {
  return getWorkerKeyFromRuntime().length > 0;
}

export function isValidWorkerKey(presented: string | null | undefined): boolean {
  const given = String(presented || "").trim();
  return isValidWorkerKeyValue(given, getWorkerKeyFromRuntime());
}

/** Length of the secret as seen through process.env only (diagnostics). */
export function workerKeyProcessEnvLen(): number {
  try {
    return String(process.env.AI_INGESTION_WORKER_KEY || "").trim().length;
  } catch {
    return -1;
  }
}

/** Length of the secret as seen through Cloudflare env bindings only (diagnostics). */
export function workerKeyCloudEnvLen(): number {
  try {
    const runtimeEnv = (getCloudflareContext()?.env as Record<string, unknown>) || {};
    return String(runtimeEnv.AI_INGESTION_WORKER_KEY || "").trim().length;
  } catch {
    return -1;
  }
}

/**
 * Safe, temporary authentication diagnostics (no secret values, hashes,
 * cookies, or header contents — booleans and lengths only).
 */
export function describeWorkerAuthRequest(request: Request): {
  envPresent: boolean;
  expectedLen: number;
  processEnvLen: number;
  cloudEnvLen: number;
  hasHeader: boolean;
  receivedLen: number;
  selected: "worker" | "session" | "none";
} {
  const presented = String(request.headers.get("x-ingestion-worker-key") || "");
  const configured = getWorkerKeyFromRuntime();
  const match =
    presented.length > 0 &&
    configured.length > 0 &&
    isValidWorkerKeyValue(presented.trim(), configured);
  const cookieHeader = String(request.headers.get("cookie") || "");
  const hasSessionCookie = /sb-[a-z0-9-]+-auth-token|supabase-auth-token/i.test(cookieHeader);
  return {
    envPresent: configured.length > 0,
    expectedLen: configured.length,
    processEnvLen: workerKeyProcessEnvLen(),
    cloudEnvLen: workerKeyCloudEnvLen(),
    hasHeader: presented.length > 0,
    receivedLen: presented.length,
    selected: match ? "worker" : hasSessionCookie ? "session" : "none",
  };
}

export function requestPresentsWorkerKey(request: Request): boolean {
  return isValidWorkerKey(request.headers.get("x-ingestion-worker-key"));
}

/**
 * Resolve the caller as worker identity or authenticated back-office user.
 * Returns null when neither is satisfied. Allowed roles are checked by the
 * caller (GET/drafts(scope) typically admin+manager; POST evidence admin+
 * manager+staff) so each route keeps its own authorization boundary.
 */
export async function resolveIngestionActor(
  request: Request,
): Promise<IngestionActor | null> {
  if (requestPresentsWorkerKey(request)) return { type: "worker" };
  try {
    const role = await getUserRole();
    if (!role) return null;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    return { type: "user", userId: auth.user.id, role };
  } catch {
    return null;
  }
}

export function actorHasRoles(actor: IngestionActor | null, roles: string[]): boolean {
  if (!actor) return false;
  if (actor.type === "worker") return true;
  return hasRole(actor.role as any, roles as any);
}
