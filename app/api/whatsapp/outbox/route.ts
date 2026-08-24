import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const [
      { count: pendingCount },
      { count: processingCount },
      { count: sentCount },
      { count: failedCount },
      { data: recentMessages },
    ] = await Promise.all([
      supabase.from("whatsapp_outbox").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
      supabase.from("whatsapp_outbox").select("id", { count: "exact", head: true }).eq("status", "PROCESSING"),
      supabase.from("whatsapp_outbox").select("id", { count: "exact", head: true }).eq("status", "SENT"),
      supabase.from("whatsapp_outbox").select("id", { count: "exact", head: true }).eq("status", "FAILED"),
      supabase.from("whatsapp_outbox").select("*").order("created_at", { ascending: false }).limit(50),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        pending: pendingCount || 0,
        processing: processingCount || 0,
        sent: sentCount || 0,
        failed: failedCount || 0,
      },
      messages: recentMessages || [],
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();

    // Fetch batch of up to 10 pending messages due for processing
    const { data: messages, error } = await supabase
      .from("whatsapp_outbox")
      .select("*")
      .eq("status", "PENDING")
      .lte("next_attempt_at", now)
      .limit(10);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ success: true, processed: 0, sent: 0, failed: 0 });
    }

    // Get active WhatsApp config from settings
    const { data: settings } = await supabase
      .from("settings")
      .select("whatsapp_config")
      .eq("id", 1)
      .maybeSingle();

    const config = settings?.whatsapp_config || { provider: "off" };

    let sent = 0;
    let failed = 0;

    for (const msg of messages) {
      // Mark as PROCESSING
      await supabase
        .from("whatsapp_outbox")
        .update({ status: "PROCESSING", attempt_count: msg.attempt_count + 1 })
        .eq("id", msg.id);

      try {
        if (config.provider === "off") {
          await supabase
            .from("whatsapp_outbox")
            .update({ status: "CANCELLED", error_message: "Provider is turned OFF in Settings." })
            .eq("id", msg.id);
          continue;
        }

        // Send via internal send API handler
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
        const sendRes = await fetch(`${baseUrl}/api/whatsapp/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: msg.phone,
            message: msg.message_body,
            config,
          }),
        });

        const resData = await sendRes.json().catch(() => ({}));

        if (sendRes.ok && (resData.success || resData.ok)) {
          await supabase
            .from("whatsapp_outbox")
            .update({
              status: "SENT",
              sent_at: new Date().toISOString(),
              provider_message_id: resData.messageId || resData.data?.id || null,
              error_message: null,
            })
            .eq("id", msg.id);
          sent++;
        } else {
          throw new Error(resData.error || `Transport error ${sendRes.status}`);
        }
      } catch (err: any) {
        failed++;
        const nextAttempts = msg.attempt_count + 1;
        const newStatus = nextAttempts >= 4 ? "FAILED" : "PENDING";
        const backoffMinutes = nextAttempts === 1 ? 1 : nextAttempts === 2 ? 5 : 15;
        const nextAttemptAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

        await supabase
          .from("whatsapp_outbox")
          .update({
            status: newStatus,
            error_message: err.message,
            next_attempt_at: nextAttemptAt,
          })
          .eq("id", msg.id);
      }
    }

    return NextResponse.json({
      success: true,
      processed: messages.length,
      sent,
      failed,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Internal error" }, { status: 500 });
  }
}

