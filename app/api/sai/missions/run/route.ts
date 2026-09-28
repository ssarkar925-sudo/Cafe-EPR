import "@/lib/sai/capabilities/business-observe";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { runNextSaiMission, runSaiMission } from "@/lib/sai/core/mission-runner";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const missionId = typeof body?.missionId === "string" ? body.missionId.trim() : "";
  const approvalId = typeof body?.approvalId === "string" ? body.approvalId.trim() || undefined : undefined;
  const actor = { userId: auth.user.id, businessId: auth.user.id, role: role as string };

  try {
    const result = missionId
      ? await runSaiMission(actor, missionId, approvalId)
      : await runNextSaiMission(actor, approvalId);
    if (!result) return NextResponse.json({ queued: false, message: "No queued SAI mission" });
    return NextResponse.json({ queued: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run SAI mission";
    const status = ["SAI_MISSION_NOT_FOUND", "SAI_MISSION_CLAIM_LOST"].includes(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
