import "@/lib/sai/capabilities/business-observe";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { compileSaiMissionPlan } from "@/lib/sai/cognition/plan-compiler";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const missionId = typeof body?.missionId === "string" ? body.missionId.trim() : "";
  if (!missionId) return NextResponse.json({ error: "missionId is required" }, { status: 400 });

  try {
    const plan = await compileSaiMissionPlan(
      { userId: auth.user.id, businessId: auth.user.id, role: role as string },
      missionId
    );
    return NextResponse.json({ plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to compile mission plan";
    return NextResponse.json(
      { error: message },
      { status: message === "SAI_MISSION_NOT_FOUND" || message === "SAI_GOAL_NOT_FOUND" ? 404 : 400 }
    );
  }
}
