import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { runSaiInstruction } from "@/lib/sai/cognition/runtime";

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

  const result = await runSaiInstruction({
    instruction,
    actor: { userId: auth.user.id, businessId: String(body?.businessId || auth.user.id), role },
    route: typeof body?.route === "string" ? body.route : undefined,
  });

  return NextResponse.json(result);
}
