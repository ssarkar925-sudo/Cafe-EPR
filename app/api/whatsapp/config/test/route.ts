import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsAppViaConfig } from "@/lib/whatsapp-sender";
import { formatWhatsAppPhone, type WhatsAppConfig } from "@/lib/whatsapp-shared";

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { phone, use_template, template_name } = await req.json();
    const recipient = formatWhatsAppPhone(phone || "");
    if (recipient.length < 10) return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });
    const db = createAdminClient();
    let row: any = null;
    let secrets: any = null;

    try {
      const [{ data: r, error: rErr }, { data: s }] = await Promise.all([
        db.from("whatsapp_templates").select("config").eq("id", "default").maybeSingle(),
        db.from("whatsapp_gateway_secrets").select("meta_access_token, meta_phone_number_id, waba_id, verify_token").eq("id", "default").maybeSingle(),
      ]);
      if (rErr && rErr.code === "42501") {
        const userClient = await createClient();
        const { data: uRow } = await userClient.from("whatsapp_templates").select("config").eq("id", "default").maybeSingle();
        row = uRow;
      } else {
        row = r;
      }
      secrets = s;
    } catch {
      const userClient = await createClient();
      const { data: uRow } = await userClient.from("whatsapp_templates").select("config").eq("id", "default").maybeSingle();
      row = uRow;
    }
    const base = row?.config || {};
    const config: WhatsAppConfig = {
      ...base,
      provider: base.provider || "off",
      automations: base.automations,
      meta_phone_number_id: secrets?.meta_phone_number_id || base.meta_phone_number_id,
      meta_waba_id: secrets?.waba_id || base.meta_waba_id,
      meta_access_token: secrets?.meta_access_token,
      gateway_api_key: base.gateway_api_key,
      ultramsg_token: base.ultramsg_token,
      ultramsg_instance_id: base.ultramsg_instance_id,
    };

    const options = use_template || template_name
      ? { templateName: template_name || "hello_world", templateLang: "en_US" }
      : undefined;

    const result = await sendWhatsAppViaConfig(
      recipient,
      "Sarkar Cafe ERP WhatsApp connection test. If you received this message, the official Meta Cloud API sender is operational.",
      config,
      options
    );

    if (!result.success) return NextResponse.json(result, { status: result.status || 400 });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Test failed" }, { status: 500 });
  }
}
