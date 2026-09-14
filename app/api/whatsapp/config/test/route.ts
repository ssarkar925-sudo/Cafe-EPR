import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { getServerWhatsAppConfig, sendWhatsAppViaConfig } from "@/lib/whatsapp-sender";
import { formatWhatsAppPhone } from "@/lib/whatsapp-shared";

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { phone, use_template, template_name } = await req.json();
    const recipient = formatWhatsAppPhone(phone || "");
    if (recipient.length < 10) return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });

    const serverConfig = await getServerWhatsAppConfig();

    const options = (serverConfig.provider === "meta" && (use_template || template_name))
      ? { templateName: template_name || "hello_world", templateLang: "en_US" }
      : undefined;

    const testMessage = serverConfig.provider === "local_gateway"
      ? `👋 *Greetings from Sarkar Communication!*\n\n✅ WhatsApp Gateway is *LIVE & CONNECTED* to your business number (+91 70030 37208).\n⚡ Cloud Gateway: ${serverConfig.gateway_url || "https://sccomm-whatsapp-gateway.onrender.com"}\n📅 Date: ${new Date().toLocaleDateString("en-IN")}\n⏰ Time: ${new Date().toLocaleTimeString("en-IN")}\n\nBackground delivery is active 24/7!`
      : "Sarkar Cafe ERP WhatsApp connection test. If you received this message, the official Meta Cloud API sender is operational.";

    const result = await sendWhatsAppViaConfig(
      recipient,
      testMessage,
      serverConfig,
      options
    );

    if (!result.success) return NextResponse.json(result, { status: result.status || 400 });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Test failed" }, { status: 500 });
  }
}
