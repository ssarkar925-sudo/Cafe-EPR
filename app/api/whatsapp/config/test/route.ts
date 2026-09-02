import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createSecretsAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppViaConfig } from "@/lib/whatsapp-sender";
import { formatWhatsAppPhone, type WhatsAppConfig } from "@/lib/whatsapp-shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { phone } = await req.json();
    const recipient = formatWhatsAppPhone(phone || "");
    if (recipient.length < 12) return NextResponse.json({ error: "Enter a valid Indian 10-digit mobile number." }, { status: 400 });

    const db = createSecretsAdminClient();
    const [{ data: row }, { data: secrets }] = await Promise.all([
      db.from("whatsapp_templates").select("config").eq("id", "default").maybeSingle(),
      db.from("whatsapp_gateway_secrets").select("meta_access_token, meta_phone_number_id, gateway_api_key, ultramsg_token, ultramsg_instance_id, provider").eq("id", "default").maybeSingle(),
    ]);

    const base = row?.config || {};

    // The durable UI setting is authoritative when it explicitly selects a
    // provider. Older records can contain a stale `secrets.provider=off` value
    // even though the Meta credentials are present; in that case prefer Meta.
    const baseProvider = base.provider as WhatsAppConfig["provider"] | undefined;
    const secretProvider = secrets?.provider as WhatsAppConfig["provider"] | undefined;
    const metaCredentialsPresent = Boolean(secrets?.meta_phone_number_id && secrets?.meta_access_token);
    const provider: WhatsAppConfig["provider"] =
      baseProvider && baseProvider !== "off"
        ? baseProvider
        : metaCredentialsPresent
          ? "meta"
          : secretProvider || baseProvider || "off";

    if (provider === "meta" && !metaCredentialsPresent) {
      return NextResponse.json({
        success: false,
        error: "Meta Phone Number ID and Access Token are required in the server-side WhatsApp configuration.",
      }, { status: 400 });
    }

    const config: WhatsAppConfig = {
      ...base,
      provider,
      automations: base.automations,
      meta_phone_number_id: secrets?.meta_phone_number_id,
      meta_access_token: secrets?.meta_access_token,
      gateway_api_key: secrets?.gateway_api_key,
      ultramsg_token: secrets?.ultramsg_token,
      ultramsg_instance_id: secrets?.ultramsg_instance_id,
    };

    const result = await sendWhatsAppViaConfig(
      recipient,
      "CafeERP WhatsApp connection test. If you received this message, the configured sender is working.",
      config
    );

    if (!result.success) return NextResponse.json(result, { status: result.status || 400 });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Test failed" }, { status: 500 });
  }
}
