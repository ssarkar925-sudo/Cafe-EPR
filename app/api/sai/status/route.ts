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

  const { count: pendingApprovals } = await supabase
    .from("ai_action_approvals")
    .select("id", { count: "exact", head: true })
    .eq("requested_by", auth.user.id)
    .eq("status", "pending");

  const { count: openAttention } = await supabase
    .from("sai_attention")
    .select("attention_id", { count: "exact", head: true })
    .eq("actor_user_id", auth.user.id)
    .in("status", ["open", "acknowledged"]);

  return NextResponse.json({
    online: true,
    activeTasks: 0,
    pendingApprovals: pendingApprovals ?? 0,
    attention: openAttention ?? 0,
  });
}
