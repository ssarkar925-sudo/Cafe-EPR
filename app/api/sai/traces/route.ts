import "@/lib/sai/capabilities/business-observe";
import "@/lib/sai/capabilities/pos-observe";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { getSaiTrace, getRecentSaiTraces } from "@/lib/sai/core/trace";
import { getSaiTraceExplanation } from "@/lib/sai/core/explanation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const traceId = url.searchParams.get("traceId")?.trim();
  const parsedLimit = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(parsedLimit) ? Math.round(parsedLimit) : 20;
  const actor = { userId: auth.user.id, businessId: auth.user.id, role: role as string };
  try {
    if (traceId) {
      const trace = await getSaiTrace(actor, traceId, limit);
      if (!trace.length) return NextResponse.json({ error: "Trace not found" }, { status: 404 });
      const { explanation } = await getSaiTraceExplanation(actor, traceId);
      return NextResponse.json({ traceId, trace, explanation, count: trace.length });
    }
    const recent = await getRecentSaiTraces(actor, limit);
    return NextResponse.json({ recent, count: recent.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read SAI traces" }, { status: 400 });
  }
}
