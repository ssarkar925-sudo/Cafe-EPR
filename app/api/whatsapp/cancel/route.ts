import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRole, hasRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const messageId = String(body?.messageId || "").trim();
    if (!messageId) {
      return NextResponse.json({ success: false, error: "messageId is required." }, { status: 400 });
    }

    // Use admin client to bypass RLS and ensure update always works for owner
    const db = createAdminClient();

    // Fetch message to check current status
    const { data: msg, error: fetchErr } = await db
      .from("whatsapp_outbox")
      .select("id, status")
      .eq("id", messageId)
      .maybeSingle();

    if (fetchErr || !msg) {
      console.error("WhatsApp cancel: message not found", messageId, fetchErr);
      return NextResponse.json({ success: false, error: "Message not found." }, { status: 404 });
    }

    const cancellable = ["PENDING", "FAILED"];
    if (!cancellable.includes(msg.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot abort a "${msg.status}" message. Only PENDING or FAILED messages can be cancelled.` },
        { status: 409 }
      );
    }

    // Update only columns that exist on the table (no updated_at column)
    const { error: updateErr } = await db
      .from("whatsapp_outbox")
      .update({
        status: "CANCELLED",
        error_message: `Manually cancelled by owner at ${new Date().toISOString()}`,
      })
      .eq("id", messageId)
      .in("status", cancellable);

    if (updateErr) {
      console.error("WhatsApp cancel: update failed", updateErr);
      return NextResponse.json({ success: false, error: updateErr.message || "Failed to cancel message." }, { status: 500 });
    }

    return NextResponse.json({ success: true, messageId });
  } catch (error) {
    console.error("WhatsApp cancel error:", error);
    return NextResponse.json({ success: false, error: "Internal server error." }, { status: 500 });
  }
}
