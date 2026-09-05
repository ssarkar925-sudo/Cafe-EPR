import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerWhatsAppConfig, sendWhatsAppViaConfig } from "@/lib/whatsapp-sender";

function clientIp(req: Request): string {
  return String(req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim();
}

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const limited = await createAdminClient().rpc("consume_api_rate_limit", {
      p_key: `whatsapp-send:${clientIp(req)}`,
      p_limit: 20,
      p_window_seconds: 60,
    });
    if (limited.error || limited.data !== true) {
      return NextResponse.json({ success: false, error: "Too many WhatsApp send requests. Please retry shortly." }, { status: 429 });
    }

    const body = await req.json();
    const { phone, message, options } = body as {
      phone: string;
      message: string;
      options?: { templateName?: string; templateLang?: string };
    };

    // Provider credentials, gateway URL, phone/WABA IDs and tokens are always
    // authoritative server-side values. Never allow browser-supplied config to
    // override them (prevents configuration injection / SSRF).
    const serverConfig = await getServerWhatsAppConfig();
    const result = await sendWhatsAppViaConfig(phone, message, serverConfig, options);

    if (!result.success) {
      return NextResponse.json(
        { ...result, success: false, error: result.error || "Failed to send message" },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
