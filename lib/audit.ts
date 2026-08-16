import { createClient } from "@/lib/supabase/client";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "cancel"
  | "reverse"
  | "payment"
  | "login"
  | "logout"
  | "upload"
  | "settings";

/**
 * Insert an audit log row. Fire-and-forget: never throws, never blocks the
 * main action. RLS allows all authenticated users to insert.
 */
export async function logAudit(entry: {
  action: string;
  entity: string;
  entity_id?: string | null;
  description: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    let user_name: string | null = null;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      user_name = (data?.full_name as string | null) ?? null;
    } catch {
      /* ignore */
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      user_name,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entity_id ?? null,
      description: entry.description,
      details: entry.details ?? null,
    });
  } catch {
    /* ignore */
  }
}
