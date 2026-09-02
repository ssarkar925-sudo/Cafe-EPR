import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createSecretsAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppViaConfig } from "@/lib/whatsapp-sender";
import { formatWhatsAppPhone, type WhatsAppConfig } from "@/lib/whatsapp-shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_WABA_ID = "448036473626878";

function digits(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

async function resolveProductionPhoneId(
  accessToken: string,
  recipient: string,
  currentPhoneId?: string | null
): Promise<string | null> {
  const graphVersion = (process.env.META_GRAPH_API_VERSION || "v25.0").trim();
  const wabaId = (process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || DEFAULT_WABA_ID).trim();
  const url = `https://graph.facebook.com/${graphVersion}/${wabaId}/phone_numbers?fields=id,display_phone_number&limit=100`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return null;

    const list = Array.isArray(payload?.data) ? payload.data : [];
    const target10 = digits(recipient).slice(-10);
    const match = list.find((item: any) => {
      const id = String(item?.id || "");
      const display = digits(String(item?.display_phone_number || ""));
      return display.slice(-10) === target10 && id;
    });

    if (match?.id) return String(match.id);

    // Only use an unambiguous single sender as a last resort.
    if (list.length === 1 && list[0]?.id) return String(list[0].id);
    return currentPhoneId ? String(currentPhoneId) : null;
  } catch {
    return currentPhoneId ? String(currentPhoneId) : null;
  }
}

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
    const baseProvider = base.provider as WhatsAppConfig["provider"] | undefined;
    const secretProvider = secrets?.provider as WhatsAppConfig["provider"] | undefined;
    const metaCredentialsPresent = Boolean(secrets?.meta_phone_number_id && secrets?.meta_access_token);
    const provider: WhatsAppConfig["provider"] =
      baseProvider && baseProvider !== "off"
        ? baseProvider
        : metaCredentialsPresent
          ? "meta"
          : secretProvider || baseProvider || "off";

    if (provider === "meta" && !secrets?.meta_access_token) {
      return NextResponse.json({ success: false, error: "Meta Access Token is missing from the server-side WhatsApp configuration." }, { status: 400 });
    }

    if (provider === "meta") {
      let phoneId = secrets?.meta_phone_number_id ? String(secrets.meta_phone_number_id).trim() : "";

      // The previously entered value can be a WhatsApp Business phone-profile
      // ID rather than the Cloud API sender phone-number ID. Resolve the
      // production sender directly from the WABA and persist the correct ID.
      const resolvedPhoneId = await resolveProductionPhoneId(String(secrets?.meta_access_token || ""), recipient, phoneId);
      if (resolvedPhoneId && resolvedPhoneId !== phoneId) {
        phoneId = resolvedPhoneId;
        await db.from("whatsapp_gateway_secrets").update({
          meta_phone_number_id: phoneId,
          updated_at: new Date().toISOString(),
        }).eq("id", "default");
      }

      if (!phoneId) {
        return NextResponse.json({ success: false, error: "Could not resolve a WhatsApp Cloud API Phone Number ID for the configured WABA." }, { status: 400 });
      }

      const config: WhatsAppConfig = {
        ...base,
        provider: "meta",
        automations: base.automations,
        meta_phone_number_id: phoneId,
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
      return NextResponse.json({ ...result, resolvedPhoneNumberId: phoneId }, {
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
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
