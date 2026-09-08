import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { requireOwnerApproval } from "@/lib/ai/approval-gate";
import { runCommandCenter } from "@/lib/ai/command-center";

export const dynamic = "force-dynamic";

const MAX_TASK_LENGTH = 4000;

export async function POST(request: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const task = typeof body?.task === "string" ? body.task.trim() : "";
    if (!task) return NextResponse.json({ error: "Task is required" }, { status: 400 });
    if (task.length > MAX_TASK_LENGTH) return NextResponse.json({ error: "Task is too long" }, { status: 413 });

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const command = await runCommandCenter({ supabase, task, prepareRepair: body?.prepareRepair === true });
    let approval = null;
    const repair = command.actions.find((action) => action.action === "repair_whatsapp" && action.requiresApproval);

    if (body?.prepareRepair === true && repair?.payload) {
      approval = await requireOwnerApproval("repair_whatsapp", repair.payload);
    }

    return NextResponse.json({
      ...command,
      mode: approval ? "approval-required" : "command-center",
      approval,
    });
  } catch (error) {
    console.error("Cafe AI command center failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Command Center failed" }, { status: 502 });
  }
}
