import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { requireOwnerApproval } from "@/lib/ai/approval-gate";
import { diagnoseApplication } from "@/lib/ai/self-healing";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const supabase = await createClient();
    const diagnosis = await diagnoseApplication(supabase);

    const repairable = diagnosis.findings.filter((finding) => finding.autoFixable && finding.repairKind);
    const shouldPrepareRepair = body?.prepareRepair === true;

    if (shouldPrepareRepair && repairable.length) {
      // Only a server-generated finding can become an approval payload. The
      // browser cannot select an arbitrary repair kind or configuration value.
      const finding = repairable[0];
      const approval = await requireOwnerApproval("repair_whatsapp", {
        repair_kind: finding.repairKind,
        finding_id: finding.id,
        evidence: finding.evidence,
        diagnosis_scanned_at: diagnosis.scannedAt,
      });
      return NextResponse.json({ mode: "approval-required", diagnosis, approval, message: `I found a verified ${finding.area} problem. I can apply the safe repair now, but I need your explicit owner approval first.` });
    }

    return NextResponse.json({ mode: "diagnosis", diagnosis, repairableCount: repairable.length, message: diagnosis.findings.length ? "I found application issues. Review the evidence below; no changes were made." : "Self-healing scan completed. No repair-worthy application issue was detected." });
  } catch (error) {
    console.error("AI self-healing diagnosis failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI self-healing scan failed" }, { status: 502 });
  }
}
