import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Records the browser direct-delivery outcome for a queued invoice PDF job.
 * - { jobId, messageId } marks the job SENT (gateway confirmed to the device).
 * - { jobId, error } records the device error but leaves the job PENDING so
 *   the gateway poller still delivers it over the proven Supabase path.
 */
export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const jobId = String(body?.jobId || "").trim();
    if (!UUID_RE.test(jobId)) {
      return NextResponse.json({ success: false, error: "Valid job ID is required." }, { status: 400 });
    }
    const db = createAdminClient();
    const messageId = String(body?.messageId || "").trim();
    if (messageId) {
      const updated = await db
        .from("whatsapp_pdf_jobs")
        .update({ status: "sent", provider_message_id: messageId.slice(0, 200), sent_at: new Date().toISOString() })
        .eq("id", jobId)
        .eq("status", "pending");
      if (updated.error) {
        return NextResponse.json({ success: false, error: "Unable to update job status." }, { status: 500 });
      }
      return NextResponse.json({ success: true, jobId, status: "sent" });
    }
    const deviceError = String(body?.error || "Direct device delivery failed.").slice(0, 300);
    const noted = await db
      .from("whatsapp_pdf_jobs")
      .update({ error_message: deviceError, next_attempt_at: new Date(Date.now() + 2 * 60 * 1000).toISOString() })
      .eq("id", jobId)
      .eq("status", "pending");
    if (noted.error) {
      return NextResponse.json({ success: false, error: "Unable to update job status." }, { status: 500 });
    }
    return NextResponse.json({ success: true, jobId, status: "pending" });
  } catch (error: any) {
    console.error("WhatsApp PDF job status error:", error?.message || error);
    return NextResponse.json({ success: false, error: "Internal server error." }, { status: 500 });
  }
}
