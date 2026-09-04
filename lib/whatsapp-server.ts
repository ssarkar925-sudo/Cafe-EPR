import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_AUTOMATIONS, DEFAULT_WA_TEMPLATES, type WhatsAppConfig, type WhatsAppProvider } from "@/lib/whatsapp-shared";

/**
 * Server-only helper to load authoritative WhatsApp configuration and secrets.
 * Merges:
 * 1. Database table `whatsapp_templates` (id = 'default')
 * 2. Database table `whatsapp_gateway_secrets` (id = 'default')
 * 3. Environment variables (fallbacks/overrides for Meta & Gateway):
 *    - META_PHONE_NUMBER_ID / WHATSAPP_META_PHONE_NUMBER_ID
 *    - META_ACCESS_TOKEN / WHATSAPP_META_ACCESS_TOKEN
 *    - WHATSAPP_GATEWAY_URL, WHATSAPP_GATEWAY_API_KEY
 *    - WHATSAPP_PROVIDER
 */
export async function getServerWhatsAppConfig(): Promise<WhatsAppConfig> {
  const envProvider = (process.env.WHATSAPP_PROVIDER || "").toLowerCase().trim() as WhatsAppProvider;
  const envMetaPhoneId = (process.env.META_PHONE_NUMBER_ID || process.env.WHATSAPP_META_PHONE_NUMBER_ID || "").trim();
  const envMetaToken = (process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_META_ACCESS_TOKEN || "").trim();
  const envGatewayUrl = (process.env.WHATSAPP_GATEWAY_URL || "").trim();
  const envGatewayApiKey = (process.env.WHATSAPP_GATEWAY_API_KEY || "").trim();
  const envUltraInstance = (process.env.ULTRAMSG_INSTANCE_ID || "").trim();
  const envUltraToken = (process.env.ULTRAMSG_TOKEN || "").trim();

  let dbConfig: Partial<WhatsAppConfig> = {};
  let dbTemplates = DEFAULT_WA_TEMPLATES;
  let dbSecrets: Record<string, any> = {};

  try {
    const db = createAdminClient();
    const [{ data: row, error: rowError }, { data: secrets, error: secretError }] = await Promise.all([
      db.from("whatsapp_templates").select("config, templates").eq("id", "default").maybeSingle(),
      db.from("whatsapp_gateway_secrets").select("meta_access_token, meta_phone_number_id, gateway_api_key, ultramsg_token, ultramsg_instance_id").eq("id", "default").maybeSingle(),
    ]);

    if (!rowError && row) {
      dbConfig = row.config || {};
      if (row.templates) {
        dbTemplates = { ...DEFAULT_WA_TEMPLATES, ...row.templates };
      }
    }

    if (!secretError && secrets) {
      dbSecrets = secrets;
    }
  } catch (err) {
    console.warn("[getServerWhatsAppConfig] Warning reading database configuration:", err);
  }

  const effectiveProvider: WhatsAppProvider =
    (["meta", "local_gateway", "ultramsg", "off"].includes(envProvider) ? envProvider : null) ||
    dbConfig.provider ||
    (envMetaToken && envMetaPhoneId ? "meta" : "off");

  const effectiveMetaPhoneId =
    dbSecrets.meta_phone_number_id ||
    dbConfig.meta_phone_number_id ||
    envMetaPhoneId ||
    "";

  const effectiveMetaToken =
    dbSecrets.meta_access_token ||
    envMetaToken ||
    "";

  const effectiveGatewayUrl =
    dbConfig.gateway_url ||
    envGatewayUrl ||
    "http://localhost:3001";

  const effectiveGatewayApiKey =
    dbSecrets.gateway_api_key ||
    dbConfig.gateway_api_key ||
    envGatewayApiKey ||
    "";

  const effectiveUltraInstance =
    dbSecrets.ultramsg_instance_id ||
    dbConfig.ultramsg_instance_id ||
    envUltraInstance ||
    "";

  const effectiveUltraToken =
    dbSecrets.ultramsg_token ||
    dbConfig.ultramsg_token ||
    envUltraToken ||
    "";

  return {
    provider: effectiveProvider,
    automations: { ...DEFAULT_AUTOMATIONS, ...(dbConfig.automations || {}) },
    templates: dbTemplates,
    meta_phone_number_id: effectiveMetaPhoneId,
    meta_access_token: effectiveMetaToken,
    gateway_url: effectiveGatewayUrl,
    gateway_api_key: effectiveGatewayApiKey,
    ultramsg_instance_id: effectiveUltraInstance,
    ultramsg_token: effectiveUltraToken,
  };
}
