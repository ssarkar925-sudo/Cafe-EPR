import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import type { WhatsAppConfig } from "@/lib/whatsapp";
import { sendWhatsAppViaConfig } from "@/lib/whatsapp-sender";

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { phone, message, config } = body as {
      phone: string;
      message: string;
      config: WhatsAppConfig;
    };

    const result = await sendWhatsAppViaConfig(phone, message, config);
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


