import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { requireOwnerApproval } from "@/lib/ai/approval-gate";
import { detectCodeBugs, prepareCodeRepair } from "@/lib/ai/code-repair";
import { investigateBugs, investigateAndPrepare } from "@/lib/ai/autonomous-bug-investigator";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const mode = body?.mode === "prepare" ? "prepare" : body?.mode === "investigate" ? "investigate" : "scan";
    if (mode === "investigate") return NextResponse.json({ mode, investigations: await investigateBugs(), investigatedAt: new Date().toISOString() });
    const bugs = await detectCodeBugs();
    if (mode === "scan") return NextResponse.json({ mode, bugs, scannedAt: new Date().toISOString() });

    const bug = bugs.find((item) => item.id === body?.bugId) || (body?.bug as any);
    const path = typeof body?.path === "string" ? body.path : "";
    if (!bug) return NextResponse.json({ error: "A detected bug is required." }, { status: 400 });
    const plan = path ? await prepareCodeRepair(bug, path) : (await investigateAndPrepare(bug.id)).repairPlan;
    if (!plan) return NextResponse.json({ error: "The investigator could not safely locate a source file. Select the relevant application source path manually." }, { status: 422 });
    const approval = await requireOwnerApproval("repair_code", { kind: "source_patch", plan });
    return NextResponse.json({ mode, plan: { ...plan, newContent: undefined }, approval });
  } catch (error) {
    console.error("AI code repair preparation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Code repair preparation failed" }, { status: 502 });
  }
}
