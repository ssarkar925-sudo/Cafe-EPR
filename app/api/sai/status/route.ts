import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) {
    return NextResponse.json({ online: false }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ online: false }, { status: 401 });

  const [{ count: pendingApprovals }, { count: attention }] = await Promise.all([
    supabase.from("ai_action_approvals").select("id", { count: "exact", head: true }).eq("requested_by", auth.user.id).eq("status", "pending"),
    supabase.from("ai_reconciliation_drafts").select("id", { count: "exact", head: true }).eq("created_by", auth.user.id).eq("status", "needs_review"),
  ]);

  return NextResponse.json({
    online: true,
    activeTasks: 0,
    pendingApprovals: pendingApprovals ?? 0,
    attention: attention ?? 0,
  });
}
