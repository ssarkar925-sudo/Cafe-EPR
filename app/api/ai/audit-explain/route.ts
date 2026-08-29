import { NextRequest, NextResponse } from "next/server";
import { generateAuditExplanation, type AuditExplanationRequest } from "@/lib/ai/audit-ai";
import { getUserRole, hasRole } from "@/lib/authz";

export async function POST(req: NextRequest) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: AuditExplanationRequest = await req.json();
    if (!body || !body.checkId) {
      return NextResponse.json({ error: "Missing checkId" }, { status: 400 });
    }

    const explanation = generateAuditExplanation(body);
    return NextResponse.json(explanation);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to generate explanation" }, { status: 500 });
  }
}

