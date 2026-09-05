import { formatWhatsAppPhone, type WhatsAppConfig, DEFAULT_AUTOMATIONS, DEFAULT_WA_TEMPLATES } from "@/lib/whatsapp-shared";
import { createAdminClient } from "@/lib/supabase/admin";

export interface SendWhatsAppResult {
  success: boolean;
  provider?: string;
  messageId?: string;
  data?: any;
  error?: string;
  errorCode?: number;
  verifyUrl?: string;
  status?: number;
}

export interface SendWhatsAppOptions {
  templateName?: string;
  templateLang?: string;
}

function normalizeGatewayUrl(raw: unknown): string | null {
  const value = String(raw ?? "").trim().replace(/\/$/, "");
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
    if (url.protocol !== "https:" && !localHttp) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Resolves the authoritative server-side WhatsApp configuration. */
export async function getServerWhatsAppConfig(): Promise<WhatsAppConfig> {
  const db = createAdminClient();
  const [{ data: row }, { data: secrets }] = await Promise.all([
    db.from("whatsapp_templates").select("config, templates, meta_waba_id, meta_display_phone_number").eq("id", "default").maybeSingle(),
    db.from("whatsapp_gateway_secrets").select("provider, meta_access_token, meta_phone_number_id, waba_id, verify_token").eq("id", "default").maybeSingle(),
  ]);

  const base = (row?.config as WhatsAppConfig) || {};
  const activeProvider = (secrets?.provider || base.provider || "off") as WhatsAppConfig["provider"];
  const phoneId = String(secrets?.meta_phone_number_id || base.meta_phone_number_id || process.env.META_PHONE_NUMBER_ID || "").trim();
  const wabaId = String(secrets?.waba_id || base.meta_waba_id || (row as any)?.meta_waba_id || process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || "").trim();
  const token = String(secrets?.meta_access_token || process.env.META_ACCESS_TOKEN || "").trim();
  const gatewayUrl = normalizeGatewayUrl(base.gateway_url || process.env.WHATSAPP_GATEWAY_URL);

  return {
    ...base,
    provider: activeProvider,
    gateway_url: gatewayUrl || "",
    meta_phone_number_id: phoneId,
    meta_waba_id: wabaId,
    meta_access_token: token,
    meta_display_phone_number: base.meta_display_phone_number || (row as any)?.meta_display_phone_number || "",
    automations: { ...DEFAULT_AUTOMATIONS, ...(base.automations || {}) },
    templates: { ...DEFAULT_WA_TEMPLATES, ...((row as any)?.templates || {}), ...(base.templates || {}) },
  };
}

export async function sendWhatsAppViaConfig(
  phone: string,
  message: string,
  config: WhatsAppConfig,
  options?: SendWhatsAppOptions
): Promise<SendWhatsAppResult> {
  if (!phone || (!message && !options?.templateName)) {
    return { success: false, error: "Phone number and message text or template are required.", status: 400 };
  }

  if (!config || config.provider === "off") {
    return { success: false, error: "WhatsApp integration is not enabled in Settings.", status: 400 };
  }

  if (config.provider === "meta") {
    const phoneId = config.meta_phone_number_id?.trim();
    const token = config.meta_access_token?.trim();
    const wabaId = config.meta_waba_id?.trim();

    if (!phoneId || !token) {
      return { success: false, error: "Meta Phone Number ID and Access Token are required.", status: 400 };
    }

    const cleanTo = formatWhatsAppPhone(phone);
    if (!cleanTo || cleanTo.length < 10) {
      return { success: false, error: "Invalid recipient phone number format.", status: 400 };
    }

    const metaUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}/messages`;
    const payload = options?.templateName
      ? {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanTo,
          type: "template",
          template: { name: options.templateName, language: { code: options.templateLang || "en_US" } },
        }
      : {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanTo,
          type: "text",
          text: { preview_url: true, body: message },
        };

    const metaRes = await fetch(metaUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const metaData = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok) {
      const code = metaData?.error?.code;
      const rawMsg = metaData?.error?.message || "Meta WhatsApp API Error";
      const verifyUrl = wabaId
        ? `https://business.facebook.com/latest/whatsapp_manager/phone_numbers?waba_id=${encodeURIComponent(wabaId)}`
        : undefined;
      let friendlyError = rawMsg;
      if (code === 133010) friendlyError = "Meta Error 133010 (Account not registered): verify the WhatsApp phone number in WhatsApp Manager.";
      else if (code === 131047) friendlyError = "Meta Error 131047: the 24-hour service window expired; use an approved template.";
      else if (code === 190) friendlyError = "Meta Error 190: the access token is invalid or expired.";
      else if (code === 100) friendlyError = `Meta Error 100: invalid parameter (${rawMsg}).`;
      return { success: false, error: friendlyError, errorCode: code, verifyUrl, status: 400, data: metaData };
    }
    return { success: true, provider: "meta", messageId: metaData?.messages?.[0]?.id, data: metaData };
  }

  if (config.provider === "local_gateway") {
    const gatewayUrl = normalizeGatewayUrl(config.gateway_url);
    if (!gatewayUrl) {
      return { success: false, error: "WhatsApp gateway URL is missing or invalid. Use HTTPS, or HTTP only for localhost.", status: 400 };
    }
    const isLocal = new URL(gatewayUrl).hostname.toLowerCase() === "localhost" || ["127.0.0.1", "::1"].includes(new URL(gatewayUrl).hostname.toLowerCase());

    if (message === "__PING_HEALTH_CHECK__") {
      if (isLocal) return { success: false, error: "Local PC gateway must be checked directly from the browser on this machine.", status: 400 };
      try {
        const pingRes = await fetch(`${gatewayUrl}/health`, { headers: { "Bypass-Tunnel-Reminder": "true" }, signal: AbortSignal.timeout(12000) });
        const pingData = await pingRes.json().catch(() => ({}));
        return { success: pingRes.ok && Boolean(pingData.connected), data: pingData };
      } catch (err: any) {
        return { success: false, error: `Could not reach WhatsApp Gateway: ${err?.message || "request failed"}`, status: 502 };
      }
    }

    const targetUrl = `${gatewayUrl}/send-message`;
    async function attemptSend(attempt = 1): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
      try {
        const res = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true", ...(config.gateway_api_key ? { "x-api-key": config.gateway_api_key } : {}) },
          body: JSON.stringify({ phone, number: phone, message, text: message }),
          signal: AbortSignal.timeout(60000),
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data, error: data?.error };
      } catch (err: any) {
        if (attempt === 1 && !isLocal) {
          await new Promise((r) => setTimeout(r, 5000));
          return attemptSend(2);
        }
        return { ok: false, status: 502, data: null, error: err?.message || "request failed" };
      }
    }

    const result = await attemptSend();
    if (!result.ok) {
      if (result.status === 502 || !result.data) return { success: false, error: "Could not connect to the configured WhatsApp gateway.", status: 502 };
      return { success: false, error: result.error || `Gateway returned HTTP ${result.status}`, status: 400 };
    }
    if (result.data?.status === "dispatched_mock") return { success: false, error: `Gateway is running at ${gatewayUrl}, but WhatsApp is not linked yet.`, status: 400 };
    return { success: true, provider: "local_gateway", data: result.data };
  }

  if (config.provider === "ultramsg") {
    const instanceId = config.ultramsg_instance_id?.trim();
    const token = config.ultramsg_token?.trim();
    if (!instanceId || !token) return { success: false, error: "UltraMsg Instance ID and Token are required.", status: 400 };
    const ultraUrl = `https://api.ultramsg.com/${encodeURIComponent(instanceId)}/messages/chat`;
    const params = new URLSearchParams({ token, to: phone, body: message });
    const res = await fetch(ultraUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString(), signal: AbortSignal.timeout(15000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) return { success: false, error: data?.error || "UltraMsg Error", status: 400 };
    return { success: true, provider: "ultramsg", data };
  }

  return { success: false, error: "Unknown WhatsApp provider", status: 400 };
}
