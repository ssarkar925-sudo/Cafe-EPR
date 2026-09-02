import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createSecretsAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_AUTOMATIONS, DEFAULT_WA_TEMPLATES, type WhatsAppProvider } from "@/lib/whatsapp-shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      ...(init?.headers || {}),
    },
  });
}

export async function GET() {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager"])) return noStoreJson({ error: "Forbidden" }, { status: 403 });
    const db = createSecretsAdminClient();
    const [{ data: row, error: rowError }, { data: secrets, error: secretError }] = await Promise.all([
      db.from("whatsapp_templates").select("config, templates").eq("id", "default").maybeSingle(),
      db.from("whatsapp_gateway_secrets").select("meta_access_token, meta_phone_number_id, gateway_api_key, ultramsg_token, ultramsg_instance_id, meta_app_secret, verify_token").eq("id", "default").maybeSingle(),
    ]);
    if (rowError) throw rowError;
    if (secretError) throw secretError;
    const config = row?.config || {};
    const provider = config.provider || "off";
    const metaReady = Boolean(
      provider === "meta" &&
      secrets?.meta_access_token &&
      secrets?.meta_phone_number_id &&
      secrets?.meta_app_secret &&
      secrets?.verify_token
    );
    const configured = provider === "meta"
      ? metaReady
      : Boolean((secrets?.meta_access_token || config.meta_access_token) && (secrets?.meta_phone_number_id || config.meta_phone_number_id));
    return noStoreJson({
      provider,
      gateway_url: config.gateway_url || "",
      meta_phone_number_id: secrets?.meta_phone_number_id || config.meta_phone_number_id || "",
      meta_access_token_set: Boolean(secrets?.meta_access_token),
      meta_app_secret_set: Boolean(secrets?.meta_app_secret),
      verify_token_set: Boolean(secrets?.verify_token),
      automations: { ...DEFAULT_AUTOMATIONS, ...(config.automations || {}) },
      ai_customer_reply: {
        enabled: Boolean(config.ai_customer_reply?.enabled),
        language: config.ai_customer_reply?.language || "auto",
        tone: config.ai_customer_reply?.tone || "friendly_direct",
        instructions: config.ai_customer_reply?.instructions || "",
      },
      configured,
    });
  } catch (err: any) {
    return noStoreJson({ error: err?.message || "Could not load WhatsApp configuration" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin"])) return noStoreJson({ error: "Only administrators can change WhatsApp configuration." }, { status: 403 });
    const body = await req.json();
    const provider = body.provider as WhatsAppProvider;
    if (!["off", "meta", "local_gateway", "ultramsg"].includes(provider)) return noStoreJson({ error: "Invalid WhatsApp provider." }, { status: 400 });
    const db = createSecretsAdminClient();
    const { data: existing } = await db.from("whatsapp_templates").select("config, templates").eq("id", "default").maybeSingle();
    const config = {
      ...(existing?.config || {}),
      provider,
      gateway_url: body.gateway_url || "",
      automations: { ...DEFAULT_AUTOMATIONS, ...(body.automations || {}) },
      ai_customer_reply: {
        enabled: Boolean(body.ai_customer_reply?.enabled),
        language: body.ai_customer_reply?.language || "auto",
        tone: body.ai_customer_reply?.tone || "friendly_direct",
        instructions: typeof body.ai_customer_reply?.instructions === "string" ? body.ai_customer_reply.instructions.trim() : "",
      },
    };
    delete config.meta_access_token;
    delete config.gateway_api_key;
    delete config.ultramsg_token;
    const { error: configError } = await db.from("whatsapp_templates").upsert({
      id: "default",
      templates: existing?.templates || DEFAULT_WA_TEMPLATES,
      config,
      updated_at: new Date().toISOString(),
    });
    if (configError) throw configError;

    const secretPatch: Record<string, string> = { provider };
    if (body.meta_phone_number_id !== undefined) secretPatch.meta_phone_number_id = String(body.meta_phone_number_id || "").trim();
    if (body.meta_access_token) secretPatch.meta_access_token = String(body.meta_access_token).trim();
    if (body.meta_app_secret) secretPatch.meta_app_secret = String(body.meta_app_secret).trim();
    if (body.verify_token) secretPatch.verify_token = String(body.verify_token).trim();
    if (Object.keys(secretPatch).length) {
      const { error } = await db.from("whatsapp_gateway_secrets").upsert({ id: "default", ...secretPatch, updated_at: new Date().toISOString() });
      if (error) throw error;
    }

    return noStoreJson({ success: true });
  } catch (err: any) {
    return noStoreJson({ error: err?.message || "Could not save WhatsApp configuration" }, { status: 500 });
  }
}
