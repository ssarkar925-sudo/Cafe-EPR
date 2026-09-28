import "@/lib/sai/capabilities/business-observe";
import "@/lib/sai/capabilities/pos-observe";
import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { getSaiEvidenceTrace } from "@/lib/sai/core/evidence";
import type { SaiEvidenceSubjectType } from "@/lib/sai/core/types";

export const dynamic = "force-dynamic";

const SUBJECT_TYPES = new Set<SaiEvidenceSubjectType>([
  "event", "plan", "goal", "mission", "command", "command_step", "command_result", "verification", "attention", "evidence",
]);

export async function GET(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const subjectType = url.searchParams.get("subjectType") as SaiEvidenceSubjectType | null;
  const subjectId = url.searchParams.get("subjectId")?.trim() ?? "";

  if (!subjectType || !SUBJECT_TYPES.has(subjectType) || !subjectId) {
    return NextResponse.json({ error: "subjectType and subjectId are required" }, { status: 400 });
  }

  const { data: auth } = await (await import("@/lib/supabase/server")).createClient().then((supabase) => supabase.auth.getUser());
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const trace = await getSaiEvidenceTrace(
      { userId: auth.user.id, businessId: auth.user.id, role: role as string },
      subjectType,
      subjectId,
    );
    return NextResponse.json({ subjectType, subjectId, trace, count: trace.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read SAI evidence trace" },
      { status: 400 },
    );
  }
}
