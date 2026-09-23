/**
 * V1 application session context (server-only).
 *
 * Resolves the caller's V1 profile by `profiles.user_id` (the V1 baseline
 * keys profiles to auth.users via user_id; profile `id` is NOT the auth id).
 * Returns a mirror-only context: UI must hide/disable by role, but every
 * mutation must still expect backend denial.
 *
 * Import only from server components, route handlers, and server actions.
 * Never import from client components.
 */

import { createClient } from "@/lib/supabase/server";
import { isV1BackOffice, isV1Role, type V1Profile, type V1Role, type V1SessionContext } from "./v1-contracts";

export async function getV1SessionContext(): Promise<V1SessionContext | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, tenant_id, display_name, role, is_active")
      .eq("user_id", user.id)
      .single();
    if (error || !data) return null;
    if (!isV1Role(data.role)) return null;

    const profile: V1Profile = {
      id: data.id,
      user_id: data.user_id,
      tenant_id: data.tenant_id,
      display_name: data.display_name,
      role: data.role,
      is_active: data.is_active === true,
    };
    return {
      userId: user.id,
      profile,
      role: profile.role,
      tenantId: profile.tenant_id,
      isActive: profile.is_active,
      isAdmin: profile.role === "admin",
      isBackOffice: isV1BackOffice(profile.role),
    };
  } catch {
    return null;
  }
}

/** Require an active session; null when signed out, inactive, or role unknown. */
export async function requireActiveV1Session(): Promise<V1SessionContext | null> {
  const context = await getV1SessionContext();
  if (!context || !context.isActive) return null;
  return context;
}

/**
 * Page-level role check (mirror only). Returns true when the session holds
 * one of the allowed roles. Backend RLS/RPC authorization still decides
 * every read and mutation.
 */
export function requireV1Roles(
  session: V1SessionContext | null,
  allowed: readonly V1Role[],
): session is V1SessionContext {
  return session !== null && session.isActive && (allowed as readonly string[]).includes(session.role);
}

/** Admin-only page check. */
export function requireV1Admin(session: V1SessionContext | null): session is V1SessionContext {
  return requireV1Roles(session, ["admin"]);
}

/** Back-office (admin/manager) page check. */
export function requireV1BackOffice(session: V1SessionContext | null): session is V1SessionContext {
  return session !== null && session.isActive && isV1BackOffice(session.role);
}
