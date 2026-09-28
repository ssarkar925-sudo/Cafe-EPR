import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { listSaiContradictions } from "@/lib/sai/core/simulation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limitValue = Number(new URL(request.url).searchParams.get("limit") ?? "50");
  const actor = { userId: auth.user.id, businessId: auth.user.id, role: role as string };
  try {
    return NextResponse.json({ contradictions: await listSaiContradictions(actor, Number.isFinite(limitValue) ? limitValue : 50) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read SAI contradictions" }, { status: 400 });
  }
}
