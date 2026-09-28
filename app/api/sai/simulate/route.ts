import "@/lib/sai/capabilities/business-observe";
import "@/lib/sai/capabilities/pos-observe";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { compileSaiMissionPlan } from "@/lib/sai/cognition/plan-compiler";
import { simulateSaiPlan } from "@/lib/sai/core/simulation";
import { planSaiInstruction } from "@/lib/sai/cognition/planner";
import { loadSaiWorldState } from "@/lib/sai/core/world-state";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const actor = { userId: auth.user.id, businessId: auth.user.id, role: role as string };
  const mode = body?.mode === "background" ? "background" : "operator";

  try {
    let plan;
    if (typeof body?.missionId === "string" && body.missionId.trim()) {
      plan = await compileSaiMissionPlan(actor, body.missionId.trim());
    } else if (typeof body?.instruction === "string" && body.instruction.trim()) {
      const world = await loadSaiWorldState(actor, typeof body?.route === "string" ? body.route : undefined);
      plan = planSaiInstruction({ instruction: body.instruction.trim(), world });
    } else if (body?.plan && typeof body.plan === "object") {
      plan = body.plan;
    } else {
      return NextResponse.json({ error: "missionId, instruction, or plan is required" }, { status: 400 });
    }
    const simulation = await simulateSaiPlan({ actor, plan, mode });
    return NextResponse.json({ simulation });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to simulate SAI plan" }, { status: 400 });
  }
}
