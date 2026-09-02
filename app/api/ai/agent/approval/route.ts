import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { requireOwnerApproval } from "@/lib/ai/approval-gate";
import type { AgentAction } from "@/lib/ai/agent-policy";

export const dynamic = "force-dynamic";

const allowedActions = new Set<AgentAction>([
  "create_sale",
  "create_invoice",
  "write_transaction",
  "delete_record",
  "change_rule",
]);

export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const action = body?.action as AgentAction;
  if (!allowedActions.has(action)) {
    return NextResponse.json({ error: "Unsupported or unsafe AI action" }, { status: 400 });
  }

  const payload = body?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "A structured action payload is required" }, { status: 400 });
  }

  try {
    const approval = await requireOwnerApproval(action, payload as Record<string, unknown>);
    return NextResponse.json({ approval, mode: "approval-required", executed: false });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create approval request" },
      { status: 400 }
    );
  }
}
