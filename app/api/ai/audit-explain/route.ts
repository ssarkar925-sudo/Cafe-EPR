import { NextRequest, NextResponse } from "next/server";
import { generateAuditExplanation, type AuditExplanationRequest } from "@/lib/ai/audit-ai";

export async function POST(req: NextRequest) {
  try {
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

