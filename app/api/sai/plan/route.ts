import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { loadSaiWorldState } from "@/lib/sai/core/world-state";
import { planSaiInstruction } from "@/lib/sai/cognition/planner";

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
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) return NextResponse.json({ error: "Instruction is required" }, { status: 400 });

  try {
    const world = await loadSaiWorldState({
      userId: auth.user.id,
      businessId: auth.user.id,
      role: role as string,
    }, typeof body.route === "string" ? body.route : undefined);

    const plan = planSaiInstruction({ instruction, world });
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to compile plan",
    }, { status: 400 });
  }
}
