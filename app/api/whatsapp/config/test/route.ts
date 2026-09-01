import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppViaConfig } from "@/lib/whatsapp-sender";
import { formatWhatsAppPhone, type WhatsAppConfig } from "@/lib/whatsapp";

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { phone } = await req.json();
    const recipient = formatWhatsAppPhone(phone || "");
    if (recipient.length < 12) return NextResponse.json({ error: "Enter a valid Indian 10-digit mobile number." }, { status: 400 });
    const db = createAdminClient();
    const [{ data: row }, { data: secrets }] = await Promise.all([
      db.from("whatsapp_templates").select("config").eq("id", "default").maybeSingle(),
      db.from("whatsapp_gateway_secrets").select("meta_access_token, meta_phone_number_id, gateway_api_key, ultramsg_token, ultramsg_instance_id").eq("id", "default").maybeSingle(),
    ]);
    const base = row?.config || {};
    const config: WhatsAppConfig = {
      ...base,
      provider: base.provider || "off",
      automations: base.automations,
      meta_phone_number_id: secrets?.meta_phone_number_id,
      meta_access_token: secrets?.meta_access_token,
      gateway_api_key: secrets?.gateway_api_key,
      ultramsg_token: secrets?.ultramsg_token,
      ultramsg_instance_id: secrets?.ultramsg_instance_id,
    };
    const result = await sendWhatsAppViaConfig(recipient, "CafeERP WhatsApp connection test. If you received this message, the configured sender is working.", config);
    if (!result.success) return NextResponse.json(result, { status: result.status || 400 });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Test failed" }, { status: 500 });
  }
}
