import { NextResponse } from "next/server";
import type { WhatsAppConfig } from "@/lib/whatsapp";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phone, message, config } = body as {
      phone: string;
      message: string;
      config: WhatsAppConfig;
    };

    if (!phone || !message) {
      return NextResponse.json(
        { success: false, error: "Phone number and message text are required." },
        { status: 400 }
      );
    }

    if (!config || config.provider === "off") {
      return NextResponse.json(
        { success: false, error: "WhatsApp integration is not enabled in Settings." },
        { status: 400 }
      );
    }

    // 1. Meta Official WhatsApp Cloud API
    if (config.provider === "meta") {
      const phoneId = config.meta_phone_number_id?.trim();
      const token = config.meta_access_token?.trim();

      if (!phoneId || !token) {
        return NextResponse.json(
          { success: false, error: "Meta Phone Number ID and Access Token are required." },
          { status: 400 }
        );
      }

      const metaUrl = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
      const metaRes = await fetch(metaUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phone,
          type: "text",
          text: { preview_url: true, body: message },
        }),
      });

      const metaData = await metaRes.json();
      if (!metaRes.ok) {
        const errorMsg = metaData?.error?.message || "Meta WhatsApp API Error";
        return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        provider: "meta",
        messageId: metaData?.messages?.[0]?.id,
      });
    }

    // 2. Local / Self-Hosted Gateway (e.g. Baileys / WPPConnect / http://localhost:3001)
    if (config.provider === "local_gateway") {
      const gatewayUrl = (config.gateway_url?.trim() || "http://localhost:3001").replace(/\/$/, "");
      const targetUrl = `${gatewayUrl}/send-message`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.gateway_api_key ? { "x-api-key": config.gateway_api_key } : {}),
          },
          body: JSON.stringify({
            phone,
            number: phone,
            message,
            text: message,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          return NextResponse.json(
            { success: false, error: data?.error || `Local Gateway returned HTTP ${res.status}` },
            { status: 400 }
          );
        }

        return NextResponse.json({
          success: true,
          provider: "local_gateway",
          data,
        });
      } catch (err: any) {
        clearTimeout(timeout);
        return NextResponse.json(
          {
            success: false,
            error: `Could not connect to Local WhatsApp Gateway at ${gatewayUrl}. Please ensure your local background gateway service is running.`,
          },
          { status: 502 }
        );
      }
    }

    // 3. UltraMsg Gateway
    if (config.provider === "ultramsg") {
      const instanceId = config.ultramsg_instance_id?.trim();
      const token = config.ultramsg_token?.trim();

      if (!instanceId || !token) {
        return NextResponse.json(
          { success: false, error: "UltraMsg Instance ID and Token are required." },
          { status: 400 }
        );
      }

      const ultraUrl = `https://api.ultramsg.com/${instanceId}/messages/chat`;
      const params = new URLSearchParams({
        token,
        to: phone,
        body: message,
      });

      const res = await fetch(ultraUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      const data = await res.json();
      if (!res.ok || data?.error) {
        return NextResponse.json(
          { success: false, error: data?.error || "UltraMsg Error" },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true, provider: "ultramsg", data });
    }

    return NextResponse.json({ success: false, error: "Unknown provider" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

