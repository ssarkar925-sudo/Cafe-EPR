import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_AUTOMATIONS, DEFAULT_WA_TEMPLATES, type WhatsAppProvider } from "@/lib/whatsapp-shared";

export async function GET() {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const db = createAdminClient();
    const [{ data: row, error: rowError }, { data: secrets, error: secretError }] = await Promise.all([
      db.from("whatsapp_templates").select("config, templates").eq("id", "default").maybeSingle(),
      db.from("whatsapp_gateway_secrets").select("meta_access_token, meta_phone_number_id, gateway_api_key, ultramsg_token, ultramsg_instance_id").eq("id", "default").maybeSingle(),
    ]);
    if (rowError) throw rowError;
    if (secretError) throw secretError;
    const config = row?.config || {};
    return NextResponse.json({
      provider: config.provider || "off",
      gateway_url: config.gateway_url || "",
      meta_phone_number_id: secrets?.meta_phone_number_id || config.meta_phone_number_id || "",
      meta_access_token_set: Boolean(secrets?.meta_access_token),
      automations: { ...DEFAULT_AUTOMATIONS, ...(config.automations || {}) },
      configured: Boolean(secrets?.meta_access_token && secrets?.meta_phone_number_id),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not load WhatsApp configuration" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin"])) return NextResponse.json({ error: "Only administrators can change WhatsApp configuration." }, { status: 403 });
    const body = await req.json();
    const provider = body.provider as WhatsAppProvider;
    if (!["off", "meta", "local_gateway", "ultramsg"].includes(provider)) return NextResponse.json({ error: "Invalid WhatsApp provider." }, { status: 400 });
    const db = createAdminClient();
    const { data: existing } = await db.from("whatsapp_templates").select("config, templates").eq("id", "default").maybeSingle();
    const config = {
      ...(existing?.config || {}),
      provider,
      gateway_url: body.gateway_url || "",
      automations: { ...DEFAULT_AUTOMATIONS, ...(body.automations || {}) },
    };
    delete config.meta_access_token;
    delete config.gateway_api_key;
    delete config.ultramsg_token;
    const { error: configError } = await db.from("whatsapp_templates").upsert({ id: "default", templates: existing?.templates || DEFAULT_WA_TEMPLATES, config, updated_at: new Date().toISOString() });
    if (configError) throw configError;
    const secretPatch: Record<string, string> = {};
    if (body.meta_phone_number_id !== undefined) secretPatch.meta_phone_number_id = String(body.meta_phone_number_id || "").trim();
    if (body.meta_access_token) secretPatch.meta_access_token = String(body.meta_access_token).trim();
    if (Object.keys(secretPatch).length) {
      const { error } = await db.from("whatsapp_gateway_secrets").upsert({ id: "default", ...secretPatch, updated_at: new Date().toISOString() });
      if (error) throw error;
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not save WhatsApp configuration" }, { status: 500 });
  }
}
