import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createSecretsAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_AUTOMATIONS, DEFAULT_WA_TEMPLATES, type WhatsAppProvider } from "@/lib/whatsapp-shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate", "Pragma": "no-cache", "Expires": "0", ...(init?.headers || {}) },
  });
}

function envFirst(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return "";
}

export async function GET() {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager"])) return noStoreJson({ error: "Forbidden" }, { status: 403 });
    const db = createSecretsAdminClient();
    const [{ data: row, error: rowError }, { data: secrets, error: secretError }] = await Promise.all([
      db.from("whatsapp_templates").select("config, templates").eq("id", "default").maybeSingle(),
      db.from("whatsapp_gateway_secrets").select("meta_access_token, meta_phone_number_id, gateway_api_key, ultramsg_token, ultramsg_instance_id, meta_app_secret, verify_token, provider").eq("id", "default").maybeSingle(),
    ]);
    if (rowError) throw rowError;
    if (secretError) throw secretError;

    const config = row?.config || {};
    const envToken = envFirst("META_ACCESS_TOKEN", "Meta_Access_Token", "META_WHATSAPP_ACCESS_TOKEN");
    const envAppSecret = envFirst("META_APP_SECRET", "Meta_App_Secret");
    const envVerifyToken = envFirst("META_WHATSAPP_VERIFY_TOKEN", "META_VERIFY_TOKEN", "Meta_WhatsApp_Verify_Token");
    const envAppId = envFirst("NEXT_PUBLIC_META_APP_ID", "META_APP_ID");
    const envConfigId = envFirst("NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID", "META_EMBEDDED_SIGNUP_CONFIG_ID", "NEXT_PUBLIC_META_CONFIG_ID", "META_CONFIG_ID");
    const effectiveToken = secrets?.meta_access_token || envToken;
    const effectiveAppSecret = secrets?.meta_app_secret || envAppSecret;
    const effectiveVerifyToken = secrets?.verify_token || envVerifyToken;
    const effectivePhoneId = secrets?.meta_phone_number_id || config.meta_phone_number_id || "";
    const effectiveAppId = String(config.meta_app_id || envAppId || "").trim();
    const effectiveConfigId = String(config.meta_embedded_signup_config_id || envConfigId || "").trim();
    const baseProvider = config.provider as WhatsAppProvider | undefined;
    const secretProvider = secrets?.provider as WhatsAppProvider | undefined;
    const metaReady = Boolean(effectiveToken && effectiveAppSecret && effectiveVerifyToken && effectivePhoneId);
    const provider: WhatsAppProvider = baseProvider && baseProvider !== "off" ? baseProvider : metaReady ? "meta" : (secretProvider || baseProvider || "off");
    const configured = provider === "meta"
      ? Boolean(effectiveToken && effectivePhoneId && effectiveAppSecret && effectiveVerifyToken)
      : provider === "off"
        ? false
        : Boolean((secrets?.meta_access_token || config.meta_access_token) && effectivePhoneId);

    return noStoreJson({
      provider,
      gateway_url: config.gateway_url || "",
      meta_waba_id: config.meta_waba_id || process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || "",
      meta_display_phone_number: config.meta_display_phone_number || "",
      meta_phone_number_id: effectivePhoneId,
      meta_app_id: effectiveAppId,
      meta_embedded_signup_config_id: effectiveConfigId,
      meta_access_token_set: Boolean(effectiveToken),
      meta_app_secret_set: Boolean(effectiveAppSecret),
      verify_token_set: Boolean(effectiveVerifyToken),
      automations: { ...DEFAULT_AUTOMATIONS, ...(config.automations || {}) },
      ai_customer_reply: { enabled: Boolean(config.ai_customer_reply?.enabled), language: config.ai_customer_reply?.language || "auto", tone: config.ai_customer_reply?.tone || "friendly_direct", instructions: config.ai_customer_reply?.instructions || "" },
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
    const config: Record<string, any> = {
      ...(existing?.config || {}), provider, gateway_url: body.gateway_url || "",
      meta_waba_id: String(body.meta_waba_id || existing?.config?.meta_waba_id || process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || "").trim(),
      meta_display_phone_number: String(body.meta_display_phone_number || existing?.config?.meta_display_phone_number || "").trim(),
      meta_app_id: String(body.meta_app_id || existing?.config?.meta_app_id || process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID || "").trim(),
      meta_embedded_signup_config_id: String(body.meta_embedded_signup_config_id || existing?.config?.meta_embedded_signup_config_id || process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID || process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || process.env.NEXT_PUBLIC_META_CONFIG_ID || process.env.META_CONFIG_ID || "").trim(),
      automations: { ...DEFAULT_AUTOMATIONS, ...(body.automations || {}) },
      ai_customer_reply: { enabled: Boolean(body.ai_customer_reply?.enabled), language: body.ai_customer_reply?.language || "auto", tone: body.ai_customer_reply?.tone || "friendly_direct", instructions: typeof body.ai_customer_reply?.instructions === "string" ? body.ai_customer_reply.instructions.trim() : "" },
    };
    delete config.meta_access_token; delete config.gateway_api_key; delete config.ultramsg_token;
    const { error: configError } = await db.from("whatsapp_templates").upsert({ id: "default", templates: existing?.templates || DEFAULT_WA_TEMPLATES, config, updated_at: new Date().toISOString() });
    if (configError) throw configError;

    const secretPatch: Record<string, string> = { provider };
    if (body.meta_phone_number_id !== undefined) secretPatch.meta_phone_number_id = String(body.meta_phone_number_id || "").trim();
    if (body.meta_access_token) secretPatch.meta_access_token = String(body.meta_access_token).trim();
    if (body.meta_app_secret) secretPatch.meta_app_secret = String(body.meta_app_secret).trim();
    if (body.verify_token) secretPatch.verify_token = String(body.verify_token).trim();
    const { error: secretError } = await db.from("whatsapp_gateway_secrets").upsert({ id: "default", ...secretPatch, updated_at: new Date().toISOString() });
    if (secretError) throw secretError;
    return noStoreJson({ success: true });
  } catch (err: any) {
    return noStoreJson({ error: err?.message || "Could not save WhatsApp configuration" }, { status: 500 });
  }
}