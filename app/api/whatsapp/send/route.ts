import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import type { WhatsAppConfig } from "@/lib/whatsapp-shared";
import { sendWhatsAppViaConfig, type SendWhatsAppOptions } from "@/lib/whatsapp-sender";
import { getServerWhatsAppConfig } from "@/lib/whatsapp-server";

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { phone, message, config: clientConfig, templateName, templateLanguage, templateComponents } = body as {
      phone: string;
      message: string;
      config?: Partial<WhatsAppConfig>;
      templateName?: string;
      templateLanguage?: string;
      templateComponents?: any[];
    };

    // Resolve authoritative server-side configuration and secrets
    const serverConfig = await getServerWhatsAppConfig();
    const effectiveConfig: WhatsAppConfig = {
      ...serverConfig,
      provider: clientConfig?.provider && clientConfig.provider !== "off" ? clientConfig.provider : serverConfig.provider,
      meta_phone_number_id: serverConfig.meta_phone_number_id || clientConfig?.meta_phone_number_id,
      meta_access_token: serverConfig.meta_access_token || clientConfig?.meta_access_token,
      gateway_url: serverConfig.gateway_url || clientConfig?.gateway_url,
      gateway_api_key: serverConfig.gateway_api_key || clientConfig?.gateway_api_key,
    };

    const options: SendWhatsAppOptions = {
      templateName,
      templateLanguage,
      templateComponents,
    };

    const result = await sendWhatsAppViaConfig(phone, message, effectiveConfig, options);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to send message" },
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
