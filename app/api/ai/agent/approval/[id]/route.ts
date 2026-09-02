import { NextResponse } from "next/server";
import { approveAction } from "@/lib/ai/approval-gate";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Approval id is required" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  try {
    const approval = await approveAction(id, typeof body?.note === "string" ? body.note : undefined);
    return NextResponse.json({ approval, mode: "approved", executed: false });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to approve action" },
      { status: 403 }
    );
  }
}
