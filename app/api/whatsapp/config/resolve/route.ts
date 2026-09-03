import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createSecretsAdminClient } from "@/lib/supabase/admin";

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
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache" } });
}

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin"])) return json({ error: "Only administrators can resolve the Meta sender." }, 403);
    const body = await req.json().catch(() => ({}));
    const db = createSecretsAdminClient();
    const [{ data: row, error: rowError }, { data: secrets, error: secretError }] = await Promise.all([
      db.from("whatsapp_templates").select("config, templates").eq("id", "default").maybeSingle(),
      db.from("whatsapp_gateway_secrets").select("meta_access_token, meta_phone_number_id").eq("id", "default").maybeSingle(),
    ]);
    if (rowError) throw rowError;
    if (secretError) throw secretError;

    const config = row?.config || {};
    const token = String(secrets?.meta_access_token || envFirst("META_ACCESS_TOKEN", "Meta_Access_Token", "META_WHATSAPP_ACCESS_TOKEN")).trim();
    const wabaId = String(body.waba_id || config.meta_waba_id || process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || DEFAULT_WABA_ID).trim();
    const targetPhone = digits(String(body.display_phone_number || config.meta_display_phone_number || ""));
    const oldId = String(secrets?.meta_phone_number_id || "").trim();
    if (!token) return json({ error: "Meta Access Token is not saved on the server. Enter it once and click Save Securely." }, 400);
    if (!/^\d{10,20}$/.test(wabaId)) return json({ error: "Invalid WhatsApp Business Account (WABA) ID." }, 400);

    const graphVersion = (process.env.META_GRAPH_API_VERSION || "v25.0").trim();
    const url = `https://graph.facebook.com/${graphVersion}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status,is_on_biz_app&limit=100`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const meta = payload?.error;
      return json({ error: meta?.message || `Meta phone-number lookup failed (HTTP ${response.status})`, meta_error_code: meta?.code, meta_error_type: meta?.type }, response.status >= 400 && response.status < 500 ? response.status : 502);
    }

    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const match = rows.find((item: any) => {
      const id = String(item?.id || "").trim();
      const phone = digits(String(item?.display_phone_number || ""));
      return (targetPhone && phone === targetPhone) || (!targetPhone && oldId && id === oldId);
    }) || (rows.length === 1 ? rows[0] : null);
    if (!match?.id) {
      return json({
        error: targetPhone ? "Meta returned phone numbers for this WABA, but none matched the configured business phone number." : "Meta returned multiple phone numbers. Set the business display number before resolving the sender ID.",
        phones: rows.map((item: any) => ({ id: String(item?.id || ""), display_phone_number: String(item?.display_phone_number || ""), verified_name: String(item?.verified_name || ""), platform_type: String(item?.platform_type || ""), code_verification_status: String(item?.code_verification_status || ""), is_on_biz_app: Boolean(item?.is_on_biz_app) })),
      }, 409);
    }

    const resolvedId = String(match.id).trim();
    const resolvedPhone = String(match.display_phone_number || "").trim();
    const platformType = String(match.platform_type || "").trim().toUpperCase();
    const codeVerificationStatus = String(match.code_verification_status || "").trim().toUpperCase();
    const isOnBusinessApp = Boolean(match.is_on_biz_app) || platformType === "ON_PREMISE";
    const mergedConfig = { ...config, meta_waba_id: wabaId, meta_display_phone_number: resolvedPhone || config.meta_display_phone_number || "" };
    const { error: configError } = await db.from("whatsapp_templates").upsert({ id: "default", config: mergedConfig, templates: row?.templates || {}, updated_at: new Date().toISOString() });
    if (configError) throw configError;
    const { error: secretUpdateError } = await db.from("whatsapp_gateway_secrets").upsert({ id: "default", meta_phone_number_id: resolvedId, updated_at: new Date().toISOString() });
    if (secretUpdateError) throw secretUpdateError;

    return json({
      success: true,
      waba_id: wabaId,
      phone_number_id: resolvedId,
      display_phone_number: resolvedPhone,
      verified_name: String(match.verified_name || ""),
      quality_rating: String(match.quality_rating || ""),
      platform_type: platformType,
      code_verification_status: codeVerificationStatus,
      is_on_biz_app: isOnBusinessApp,
      coexistence_required: isOnBusinessApp,
      changed: resolvedId !== oldId,
    });
  } catch (err: any) {
    return json({ error: err?.message || "Could not resolve Meta Phone Number ID." }, 500);
  }
}
