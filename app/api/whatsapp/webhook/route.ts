import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/whatsapp/webhook
 * Handshake and verification endpoint for Meta WhatsApp Business Cloud API.
 *
 * Meta sends GET requests with query parameters:
 * - hub.mode: "subscribe"
 * - hub.verify_token: Token configured in Meta Developer Portal
 * - hub.challenge: Random challenge string to echo back upon successful verification
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    const expectedToken = (
      process.env.META_WHATSAPP_VERIFY_TOKEN ||
      process.env.META_VERIFY_TOKEN ||
      process.env.WHATSAPP_VERIFY_TOKEN ||
      ""
    ).trim();

    if (!expectedToken) {
      console.warn("[WhatsApp Webhook] Verification token is not set in environment variables.");
    }

    if (mode === "subscribe" && expectedToken && token === expectedToken) {
      console.log("[WhatsApp Webhook] Meta GET verification handshake successful.");
      return new Response(challenge || "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    console.warn("[WhatsApp Webhook] Verification handshake failed. Forbidden.");
    return new Response("Forbidden", { status: 403 });
  } catch (err: any) {
    console.error("[WhatsApp Webhook] GET verification exception:", err?.message || err);
    return new Response("Internal Server Error", { status: 500 });
  }
}

/**
 * POST /api/whatsapp/webhook
 * Event notification endpoint for Meta WhatsApp Business Cloud API.
 *
 * Receives:
 * 1. Delivery status events (sent, delivered, read, failed)
 * 2. Inbound customer messages
 *
 * Security:
 * Validates X-Hub-Signature-256 header using META_APP_SECRET (HMAC-SHA256).
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("x-hub-signature-256") || req.headers.get("X-Hub-Signature-256");
    const appSecret = (
      process.env.META_APP_SECRET ||
      process.env.WHATSAPP_APP_SECRET ||
      ""
    ).trim();

    // 1. Signature Verification using Meta App Secret
    if (!appSecret) {
      console.error(
        "[WhatsApp Webhook] META_APP_SECRET not configured in environment variables. Webhook signature verification failed closed."
      );
      return NextResponse.json(
        { error: "Server misconfiguration: META_APP_SECRET not set" },
        { status: 500 }
      );
    }

    if (!signatureHeader) {
      console.warn("[WhatsApp Webhook] Missing X-Hub-Signature-256 header.");
      return NextResponse.json({ error: "Missing signature header" }, { status: 401 });
    }

    const expectedSig = signatureHeader.replace(/^sha256=/, "").trim();
    const computedSig = crypto
      .createHmac("sha256", appSecret)
      .update(rawBody)
      .digest("hex");

    try {
      const expectedBuf = Buffer.from(expectedSig, "hex");
      const computedBuf = Buffer.from(computedSig, "hex");

      if (
        expectedBuf.length !== computedBuf.length ||
        !crypto.timingSafeEqual(expectedBuf, computedBuf)
      ) {
        console.error("[WhatsApp Webhook] Invalid HMAC-SHA256 signature.");
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    } catch (sigErr) {
      console.error("[WhatsApp Webhook] Error comparing HMAC signature:", sigErr);
      return NextResponse.json({ error: "Invalid signature formatting" }, { status: 403 });
    }

    // 2. Parse JSON Payload
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    if (payload?.object !== "whatsapp_business_account") {
      return NextResponse.json({ status: "ignored", message: "Not a WhatsApp account payload" }, { status: 200 });
    }

    const supabase = createAdminClient();

    // 3. Process Webhook Payload Entries
    if (Array.isArray(payload.entry)) {
      for (const entry of payload.entry) {
        if (!Array.isArray(entry.changes)) continue;

        for (const change of entry.changes) {
          const value = change?.value;
          if (!value) continue;

          // A. Process Delivery & Read Status Updates
          if (Array.isArray(value.statuses)) {
            for (const statusItem of value.statuses) {
              const msgId = statusItem.id;
              const statusStr = statusItem.status; // "sent" | "delivered" | "read" | "failed"
              const timestampIso = statusItem.timestamp
                ? new Date(parseInt(statusItem.timestamp, 10) * 1000).toISOString()
                : new Date().toISOString();

              if (!msgId) continue;

              const outboxFields: Record<string, any> = {};
              if (statusStr === "sent") {
                outboxFields.status = "SENT";
                outboxFields.sent_at = timestampIso;
              } else if (statusStr === "delivered") {
                outboxFields.status = "DELIVERED";
                outboxFields.delivered_at = timestampIso;
              } else if (statusStr === "read") {
                outboxFields.status = "READ";
                outboxFields.read_at = timestampIso;
              } else if (statusStr === "failed") {
                outboxFields.status = "FAILED";
                const errDetail =
                  statusItem.errors?.[0]?.title ||
                  statusItem.errors?.[0]?.message ||
                  "Meta WhatsApp delivery failed";
                outboxFields.error_message = errDetail;
              }

              if (Object.keys(outboxFields).length > 0) {
                await supabase
                  .from("whatsapp_outbox")
                  .update(outboxFields)
                  .eq("provider_message_id", msgId);
              }

              const logStatusMap: Record<string, string> = {
                sent: "sent",
                delivered: "delivered",
                read: "read",
                failed: "failed",
              };

              if (logStatusMap[statusStr]) {
                await supabase
                  .from("whatsapp_logs")
                  .update({
                    status: logStatusMap[statusStr],
                    ...(statusStr === "failed"
                      ? { error_message: statusItem.errors?.[0]?.title || "Meta WhatsApp delivery failed" }
                      : {}),
                  })
                  .or(`ref_id.eq.${msgId},ref_number.eq.${msgId}`);
              }
            }
          }

          // B. Process Inbound Messages
          if (Array.isArray(value.messages)) {
            const contactNameMap = new Map<string, string>();
            if (Array.isArray(value.contacts)) {
              for (const contact of value.contacts) {
                if (contact.wa_id && contact.profile?.name) {
                  contactNameMap.set(contact.wa_id, contact.profile.name);
                }
              }
            }

            for (const msg of value.messages) {
              const msgId = msg.id;
              const fromPhone = msg.from;
              const timestampIso = msg.timestamp
                ? new Date(parseInt(msg.timestamp, 10) * 1000).toISOString()
                : new Date().toISOString();

              const profileName = contactNameMap.get(fromPhone) || "WhatsApp Customer";

              let messageBody = "";
              if (msg.type === "text" && msg.text?.body) {
                messageBody = msg.text.body;
              } else if (msg.type === "button" && msg.button?.text) {
                messageBody = msg.button.text;
              } else if (msg.type === "interactive") {
                messageBody =
                  msg.interactive?.button_reply?.title ||
                  msg.interactive?.list_reply?.title ||
                  "[Interactive Reply]";
              } else if (msg.type === "image") {
                messageBody = `[Image: ${msg.image?.caption || "No caption"}]`;
              } else if (msg.type === "document") {
                messageBody = `[Document: ${msg.document?.filename || "Attached file"}]`;
              } else if (msg.type === "audio" || msg.type === "voice") {
                messageBody = "[Voice Message]";
              } else if (msg.type === "location") {
                messageBody = `[Location: ${msg.location?.name || "Shared Location"}]`;
              } else {
                messageBody = `[${msg.type || "Inbound"} message]`;
              }

              const cleanDigits = fromPhone.replace(/\D/g, "");
              let customerId: string | null = null;
              let recipientName = profileName;

              if (cleanDigits.length >= 8) {
                const { data: cust } = await supabase
                  .from("customers")
                  .select("id, name")
                  .or(`phone.eq.${cleanDigits},phone.eq.+${cleanDigits},phone.ilike.%${cleanDigits.slice(-10)}%`)
                  .maybeSingle();

                if (cust) {
                  customerId = cust.id;
                  if (cust.name) recipientName = cust.name;
                }
              }

              // Record inbound message in whatsapp_logs
              await supabase.from("whatsapp_logs").insert({
                recipient_phone: fromPhone,
                recipient_name: recipientName,
                message_type: "inbound",
                ref_id: msgId,
                message_text: messageBody,
                status: "delivered",
                provider: "meta",
                created_at: timestampIso,
              });

              // Record inbound message in whatsapp_outbox for real-time UI tracking
              try {
                await supabase.from("whatsapp_outbox").insert({
                  customer_id: customerId,
                  phone: fromPhone,
                  recipient_name: recipientName,
                  message_type: "inbound",
                  message_body: messageBody,
                  provider: "meta",
                  provider_message_id: msgId,
                  status: "DELIVERED",
                  created_at: timestampIso,
                  delivered_at: timestampIso,
                  idempotency_key: `inbound_${msgId}`,
                });
              } catch {
                // Ignore idempotency duplicate error if Meta re-delivers webhook
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true, received: true }, { status: 200 });
  } catch (err: any) {
    console.error("[WhatsApp Webhook] POST processing exception:", err?.message || err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
