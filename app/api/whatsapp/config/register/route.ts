import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createSecretsAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_WABA_ID = "448036473626878";

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const pin = String(body?.pin || "").replace(/\D/g, "");
    if (!/^\d{6}$/.test(pin)) return NextResponse.json({ success: false, error: "Enter the 6-digit WhatsApp two-step verification PIN." }, { status: 400 });

    const db = createSecretsAdminClient();
    const [{ data: row }, { data: secrets }] = await Promise.all([
      db.from("whatsapp_templates").select("config").eq("id", "default").maybeSingle(),
      db.from("whatsapp_gateway_secrets").select("meta_access_token, meta_phone_number_id, provider").eq("id", "default").maybeSingle(),
    ]);

    const token = String(secrets?.meta_access_token || "").trim();
    if (!token) return NextResponse.json({ success: false, error: "Meta Access Token is missing from the server-side WhatsApp configuration." }, { status: 400 });

    const config = row?.config || {};
    const wabaId = String(config.meta_waba_id || process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || DEFAULT_WABA_ID).trim();
    const phoneId = String(secrets?.meta_phone_number_id || config.meta_phone_number_id || "").trim();
    if (!phoneId) return NextResponse.json({ success: false, error: "Cloud API Phone Number ID is missing. Resolve the sender ID first." }, { status: 400 });

    const graphVersion = (process.env.META_GRAPH_API_VERSION || "v25.0").trim();
    const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneId}/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const metaError = payload?.error;
      const details = metaError?.error_user_msg || metaError?.message || `Meta registration failed (HTTP ${response.status})`;
      return NextResponse.json({ success: false, error: details, metaCode: metaError?.code, metaSubcode: metaError?.error_subcode }, { status: response.status >= 500 ? 502 : 400 });
    }

    return NextResponse.json({ success: true, registered: true, wabaId, phoneNumberId: phoneId }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Registration failed" }, { status: 500 });
  }
}
