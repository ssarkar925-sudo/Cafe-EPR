import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createSecretsAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppViaConfig } from "@/lib/whatsapp-sender";
import { formatWhatsAppPhone, type WhatsAppConfig } from "@/lib/whatsapp-shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_WABA_ID = "448036473626878";
function digits(value: string) { return String(value || "").replace(/\D/g, ""); }
function envFirst(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return "";
}

async function resolveProductionPhoneId(accessToken: string, wabaId: string, displayPhone: string, currentPhoneId: string) {
  const graphVersion = (process.env.META_GRAPH_API_VERSION || "v25.0").trim();
  const url = `https://graph.facebook.com/${graphVersion}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&limit=100`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Meta phone-number lookup failed (HTTP ${response.status})`);
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const target = digits(displayPhone);
  const match = rows.find((item: any) => {
    const id = String(item?.id || "");
    const phone = digits(String(item?.display_phone_number || ""));
    return (target && phone === target) || (!target && currentPhoneId && id === currentPhoneId);
  }) || (rows.length === 1 ? rows[0] : null);
  if (!match?.id) throw new Error(target ? "Meta returned phone numbers for this WABA, but none matched the configured business number." : "Meta returned multiple phone numbers. Set the business display number first.");
  return { id: String(match.id), phone: String(match.display_phone_number || "") };
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
    const envToken = envFirst("META_ACCESS_TOKEN", "Meta_Access_Token", "META_WHATSAPP_ACCESS_TOKEN");
    const token = String(secrets?.meta_access_token || envToken).trim();
    const baseProvider = base.provider as WhatsAppConfig["provider"] | undefined;
    const secretProvider = secrets?.provider as WhatsAppConfig["provider"] | undefined;
    const provider: WhatsAppConfig["provider"] = baseProvider && baseProvider !== "off" ? baseProvider : token ? "meta" : secretProvider || baseProvider || "off";

    if (provider === "meta") {
      if (!token) return NextResponse.json({ success: false, error: "Meta Access Token is missing from the server-side WhatsApp configuration." }, { status: 400 });
      const wabaId = String(base.meta_waba_id || process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || DEFAULT_WABA_ID).trim();
      const displayPhone = String(base.meta_display_phone_number || "+91 70030 37208").trim();
      let phoneId = String(secrets?.meta_phone_number_id || base.meta_phone_number_id || "").trim();
      const resolved = await resolveProductionPhoneId(token, wabaId, displayPhone, phoneId);
      if (resolved.id !== phoneId) {
        phoneId = resolved.id;
        await db.from("whatsapp_gateway_secrets").upsert({ id: "default", meta_phone_number_id: phoneId, updated_at: new Date().toISOString() });
      }
      await db.from("whatsapp_templates").update({ config: { ...base, provider: "meta", meta_waba_id: wabaId, meta_display_phone_number: resolved.phone || displayPhone }, updated_at: new Date().toISOString() }).eq("id", "default");

      const config: WhatsAppConfig = { ...base, provider: "meta", automations: base.automations, meta_phone_number_id: phoneId, meta_access_token: token, gateway_api_key: secrets?.gateway_api_key, ultramsg_token: secrets?.ultramsg_token, ultramsg_instance_id: secrets?.ultramsg_instance_id };
      const result = await sendWhatsAppViaConfig(recipient, "CafeERP WhatsApp connection test. If you received this message, the configured sender is working.", config);
      if (!result.success) return NextResponse.json(result, { status: result.status || 400 });
      return NextResponse.json({ ...result, resolvedPhoneNumberId: phoneId }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    const config: WhatsAppConfig = { ...base, provider, automations: base.automations, meta_phone_number_id: secrets?.meta_phone_number_id, meta_access_token: token || secrets?.meta_access_token, gateway_api_key: secrets?.gateway_api_key, ultramsg_token: secrets?.ultramsg_token, ultramsg_instance_id: secrets?.ultramsg_instance_id };
    const result = await sendWhatsAppViaConfig(recipient, "CafeERP WhatsApp connection test. If you received this message, the configured sender is working.", config);
    if (!result.success) return NextResponse.json(result, { status: result.status || 400 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Test failed" }, { status: 500 });
  }
}
