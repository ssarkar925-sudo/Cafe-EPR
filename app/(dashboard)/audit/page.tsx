import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import AuditClient from "@/components/audit/audit-client";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin"])) redirect("/dashboard");

  const supabase = await createClient();
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  return <AuditClient initialLogs={(logs ?? []) as any} />;
}
