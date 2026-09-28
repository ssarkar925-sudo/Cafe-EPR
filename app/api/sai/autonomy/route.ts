import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { getSaiAutonomyPolicy, saveSaiAutonomyPolicy } from "@/lib/sai/core/policy";
import type { SaiRiskLevel } from "@/lib/sai/core/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actor = { userId: auth.user.id, businessId: auth.user.id, role: role as string };
  try {
    const policy = await getSaiAutonomyPolicy(actor);
    return NextResponse.json({ configured: Boolean(policy), policy });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read SAI autonomy policy" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid policy" }, { status: 400 });
  const actor = { userId: auth.user.id, businessId: auth.user.id, role: role as string };
  try {
    const policy = await saveSaiAutonomyPolicy(actor, {
      autonomyEnabled: typeof body.autonomyEnabled === "boolean" ? body.autonomyEnabled : undefined,
      maxAutoRisk: typeof body.maxAutoRisk === "string" && ["read","low","medium","high","critical"].includes(body.maxAutoRisk) ? body.maxAutoRisk as SaiRiskLevel : undefined,
      dailyActionBudget: Number.isInteger(body.dailyActionBudget) ? body.dailyActionBudget : undefined,
      quietHoursEnabled: typeof body.quietHoursEnabled === "boolean" ? body.quietHoursEnabled : undefined,
      quietHoursStart: typeof body.quietHoursStart === "string" ? body.quietHoursStart : undefined,
      quietHoursEnd: typeof body.quietHoursEnd === "string" ? body.quietHoursEnd : undefined,
      quietHoursTimezone: typeof body.quietHoursTimezone === "string" ? body.quietHoursTimezone : undefined,
      criticalInterrupt: typeof body.criticalInterrupt === "boolean" ? body.criticalInterrupt : undefined,
      requireApprovalForMutations: typeof body.requireApprovalForMutations === "boolean" ? body.requireApprovalForMutations : undefined,
    });
    return NextResponse.json({ configured: true, policy });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save SAI autonomy policy" }, { status: 400 });
  }
}
