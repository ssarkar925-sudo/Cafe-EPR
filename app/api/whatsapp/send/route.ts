import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { getServerWhatsAppConfig, sendWhatsAppViaConfig } from "@/lib/whatsapp-sender";

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
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
