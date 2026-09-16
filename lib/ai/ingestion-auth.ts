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

export function isValidWorkerKey(presented: string | null | undefined): boolean {
  const given = String(presented || "").trim();
  return isValidWorkerKeyValue(given, getWorkerKeyFromRuntime());
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
