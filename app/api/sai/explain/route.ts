import "@/lib/sai/capabilities/business-observe";
import "@/lib/sai/capabilities/pos-observe";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { getSaiTraceExplanation } from "@/lib/sai/core/explanation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const traceId = new URL(request.url).searchParams.get("traceId")?.trim();
  if (!traceId) return NextResponse.json({ error: "traceId is required" }, { status: 400 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const actor = { userId: auth.user.id, businessId: auth.user.id, role: role as string };
    return NextResponse.json(await getSaiTraceExplanation(actor, traceId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to explain SAI trace" }, { status: 404 });
  }
}
