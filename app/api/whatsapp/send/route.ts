import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import type { WhatsAppConfig } from "@/lib/whatsapp-shared";
import { getServerWhatsAppConfig, sendWhatsAppViaConfig } from "@/lib/whatsapp-sender";

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { phone, message, config, options } = body as {
      phone: string;
      message: string;
      config?: Partial<WhatsAppConfig>;
      options?: any;
    };

    // Server-side authoritative hydration: ensure permanent access token and correct phone ID
    const serverConfig = await getServerWhatsAppConfig();
    const activeConfig: WhatsAppConfig = {
      ...serverConfig,
      ...(config || {}),
      // Server-side secrets are authoritative:
      meta_access_token: serverConfig.meta_access_token || config?.meta_access_token,
      meta_phone_number_id:
        config?.meta_phone_number_id && config.meta_phone_number_id !== "448036473626878"
          ? config.meta_phone_number_id
          : serverConfig.meta_phone_number_id,
      meta_waba_id: config?.meta_waba_id || serverConfig.meta_waba_id,
      provider: config?.provider || serverConfig.provider,
    };

    const result = await sendWhatsAppViaConfig(phone, message, activeConfig, options);
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


