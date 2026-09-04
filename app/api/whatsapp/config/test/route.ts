import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { sendWhatsAppViaConfig } from "@/lib/whatsapp-sender";
import { formatWhatsAppPhone } from "@/lib/whatsapp-shared";
import { getServerWhatsAppConfig } from "@/lib/whatsapp-server";

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { phone } = await req.json();
    const recipient = formatWhatsAppPhone(phone || "");
    if (recipient.length < 12) return NextResponse.json({ error: "Enter a valid Indian 10-digit mobile number." }, { status: 400 });

    const config = await getServerWhatsAppConfig();

    if (config.provider === "off") {
      return NextResponse.json({ success: false, error: "WhatsApp provider is currently Disabled in Settings." }, { status: 400 });
    }

    let result;
    if (config.provider === "meta") {
      // For Meta, business-initiated test messages outside 24h customer window require the pre-approved hello_world template
      result = await sendWhatsAppViaConfig(
        recipient,
        "__META_HELLO_WORLD__",
        config,
        { templateName: "hello_world", templateLanguage: "en_US" }
      );
    } else {
      result = await sendWhatsAppViaConfig(
        recipient,
        "CafeERP WhatsApp connection test. If you received this message, the configured sender is working.",
        config
      );
    }

    if (!result.success) return NextResponse.json(result, { status: result.status || 400 });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Test failed" }, { status: 500 });
  }
}
