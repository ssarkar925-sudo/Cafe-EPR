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

/**
 * Resolves the authoritative server-side WhatsApp configuration, merging database templates
 * and secure secrets from whatsapp_gateway_secrets (protected from exposure to client browsers).
 */
export async function getServerWhatsAppConfig(): Promise<WhatsAppConfig> {
  const db = createAdminClient();
  const [{ data: row }, { data: secrets }] = await Promise.all([
    db.from("whatsapp_templates").select("config, templates, meta_waba_id, meta_display_phone_number").eq("id", "default").maybeSingle(),
    db.from("whatsapp_gateway_secrets").select("provider, meta_access_token, meta_phone_number_id, waba_id, verify_token").eq("id", "default").maybeSingle(),
  ]);

  const base = (row?.config as WhatsAppConfig) || {};
  const activeProvider = (secrets?.provider || base.provider || "meta") as WhatsAppConfig["provider"];
  let phoneId = secrets?.meta_phone_number_id || base.meta_phone_number_id || process.env.META_PHONE_NUMBER_ID || "";
  const wabaId = secrets?.waba_id || base.meta_waba_id || (row as any)?.meta_waba_id || process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || "448036473626878";
  const token = secrets?.meta_access_token || process.env.META_ACCESS_TOKEN || "";

  // Auto-correct: Never let the WABA ID (448036473626878) be treated as the Phone Number ID
  if (phoneId === "448036473626878" || phoneId === wabaId) {
    phoneId = "252079703694976";
  }

  return {
    ...base,
    provider: activeProvider,
    gateway_url: base.gateway_url || "http://localhost:3001",
    meta_phone_number_id: phoneId,
    meta_waba_id: wabaId,
    meta_access_token: token,
    meta_display_phone_number: base.meta_display_phone_number || (row as any)?.meta_display_phone_number || "+91 70030 37208",
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

  // 1. Meta Official WhatsApp Cloud API
  if (config.provider === "meta") {
    let phoneId = config.meta_phone_number_id?.trim();
    let token = config.meta_access_token?.trim();
    const wabaId = config.meta_waba_id?.trim() || "448036473626878";

    // Auto-correct if WABA ID was passed as Phone ID
    if (!phoneId || phoneId === "448036473626878" || phoneId === wabaId) {
      phoneId = "252079703694976";
    }

    // Hydrate token from server if omitted
    if (!token) {
      try {
        const srv = await getServerWhatsAppConfig();
        token = srv.meta_access_token?.trim();
        if (!phoneId) phoneId = srv.meta_phone_number_id?.trim() || "252079703694976";
      } catch {}
    }

    if (!phoneId || !token) {
      return { success: false, error: "Meta Phone Number ID and Access Token are required.", status: 400 };
    }

    const cleanTo = formatWhatsAppPhone(phone);
    if (!cleanTo || cleanTo.length < 10) {
      return { success: false, error: "Invalid recipient phone number format.", status: 400 };
    }

    const metaUrl = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
    const payload = options?.templateName
      ? {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanTo,
          type: "template",
          template: {
            name: options.templateName,
            language: { code: options.templateLang || "en_US" },
          },
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
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const metaData = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok) {
      const code = metaData?.error?.code;
      const rawMsg = metaData?.error?.message || "Meta WhatsApp API Error";
      const wabaId = config.meta_waba_id?.trim() || "448036473626878";
      const verifyUrl = `https://business.facebook.com/latest/whatsapp_manager/phone_numbers?business_id=2078690092683215&waba_id=${wabaId}`;
      let friendlyError = rawMsg;
      if (code === 133010) {
        friendlyError = `Meta Error 133010 (Account not registered): Phone number is added in Meta WABA, but pending 1-time SMS/Voice verification in WhatsApp Manager. Once verified with the 6-digit OTP, live messages will send immediately.`;
      } else if (code === 131047) {
        friendlyError = `Meta Error 131047: 24-hour service window expired. Free-form text can only be sent within 24 hours of customer reply. Send an approved template message to initiate conversations.`;
      } else if (code === 190) {
        friendlyError = `Meta Error 190: Access token is invalid or expired. Please update your Permanent System User Token.`;
      } else if (code === 100) {
        friendlyError = `Meta Error 100: Invalid parameter or phone number format (${rawMsg}).`;
      }
      return { success: false, error: friendlyError, errorCode: code, verifyUrl, status: 400, data: metaData };
    }

    return {
      success: true,
      provider: "meta",
      messageId: metaData?.messages?.[0]?.id,
      data: metaData,
    };
  }

  // 2. Local / Self-Hosted Gateway (e.g. Baileys / Render Cloud / http://localhost:3001)
  if (config.provider === "local_gateway") {
    const gatewayUrl = (config.gateway_url?.trim() || "http://localhost:3001").replace(/\/$/, "");
    const isLocal = gatewayUrl.includes("localhost") || gatewayUrl.includes("127.0.0.1");

    // Handle ping health check
    if (message === "__PING_HEALTH_CHECK__") {
      if (isLocal) {
        return {
          success: false,
          error: "Local PC gateway must be checked directly from the browser on this machine.",
          status: 400,
        };
      }
      try {
        const pingController = new AbortController();
        const pingTimeout = setTimeout(() => pingController.abort(), 12000);
        const pingRes = await fetch(`${gatewayUrl}/health`, {
          headers: { "Bypass-Tunnel-Reminder": "true" },
          signal: pingController.signal,
        });
        clearTimeout(pingTimeout);
        const pingData = await pingRes.json().catch(() => ({}));
        return {
          success: pingRes.ok && Boolean(pingData.connected),
          data: pingData,
        };
      } catch (pingErr: any) {
        return {
          success: false,
          error: `Could not reach ${gatewayUrl}: ${pingErr.message}`,
          status: 502,
        };
      }
    }

    if (isLocal) {
      return {
        success: false,
        error: `Direct connection required: When using Local PC Gateway (http://localhost:3001), your browser communicates directly with the PC gateway. Please verify PM2 or Node.js is running on port 3001.`,
        status: 502,
      };
    }

    const targetUrl = `${gatewayUrl}/send-message`;

    // Resilient fetch with automatic wake-up retry (up to 60s for Render free-tier cold starts)
    async function attemptSend(attempt = 1): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout for Render cold wake-up

      try {
        const res = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Bypass-Tunnel-Reminder": "true",
            ...(config.gateway_api_key ? { "x-api-key": config.gateway_api_key } : {}),
          },
          body: JSON.stringify({
            phone,
            number: phone,
            message,
            text: message,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data, error: data?.error };
      } catch (err: any) {
        clearTimeout(timeout);
        if (attempt === 1 && !isLocal) {
          // Give Render container 5s to finish booting and retry once
          await new Promise((r) => setTimeout(r, 5000));
          return attemptSend(2);
        }
        return { ok: false, status: 502, data: null, error: err.message };
      }
    }

    const result = await attemptSend(1);

    if (!result.ok) {
      if (result.status === 502 || !result.data) {
        return {
          success: false,
          error: `Could not connect to WhatsApp Gateway at ${gatewayUrl}. Please ensure your service is running (or wait 20s if Render Cloud is waking up).`,
          status: 502,
        };
      }

      return {
        success: false,
        error: result.error || `Gateway returned HTTP ${result.status}`,
        status: 400,
      };
    }

    if (result.data?.status === "dispatched_mock") {
      return {
        success: false,
        error: `Gateway is running at ${gatewayUrl}, but WhatsApp is not linked yet. Please open ${gatewayUrl} in your browser and scan the QR code with WhatsApp.`,
        status: 400,
      };
    }

    return {
      success: true,
      provider: "local_gateway",
      data: result.data,
    };
  }

  // 3. UltraMsg Gateway
  if (config.provider === "ultramsg") {
    const instanceId = config.ultramsg_instance_id?.trim();
    const token = config.ultramsg_token?.trim();

    if (!instanceId || !token) {
      return { success: false, error: "UltraMsg Instance ID and Token are required.", status: 400 };
    }

    const ultraUrl = `https://api.ultramsg.com/${instanceId}/messages/chat`;
    const params = new URLSearchParams({
      token,
      to: phone,
      body: message,
    });

    const res = await fetch(ultraUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
      return {
        success: false,
        error: data?.error || "UltraMsg Error",
        status: 400,
      };
    }

    return { success: true, provider: "ultramsg", data };
  }

  return { success: false, error: "Unknown provider", status: 400 };
}
