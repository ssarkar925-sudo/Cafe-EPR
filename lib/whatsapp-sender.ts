import type { WhatsAppConfig } from "@/lib/whatsapp-shared";

export interface SendWhatsAppResult {
  success: boolean;
  provider?: string;
  messageId?: string;
  data?: any;
  error?: string;
  status?: number;
}

export async function sendWhatsAppViaConfig(
  phone: string,
  message: string,
  config: WhatsAppConfig
): Promise<SendWhatsAppResult> {
  if (!phone || !message) return { success: false, error: "Phone number and message text are required.", status: 400 };
  if (!config || config.provider === "off") return { success: false, error: "WhatsApp integration is not enabled in Settings.", status: 400 };

  if (config.provider === "meta") {
    const phoneId = config.meta_phone_number_id?.trim();
    const token = config.meta_access_token?.trim();
    if (!phoneId || !token) return { success: false, error: "Meta Phone Number ID and Access Token are required.", status: 400 };

    const graphVersion = (process.env.META_GRAPH_API_VERSION || "v25.0").trim();
    const metaUrl = `https://graph.facebook.com/${graphVersion}/${phoneId}/messages`;
    const metaRes = await fetch(metaUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: { preview_url: true, body: message },
      }),
    });
    const metaData = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok) return { success: false, error: metaData?.error?.message || "Meta WhatsApp API Error", status: 400 };
    return { success: true, provider: "meta", messageId: metaData?.messages?.[0]?.id, data: metaData };
  }

  if (config.provider === "local_gateway") {
    const gatewayUrl = (config.gateway_url?.trim() || "http://localhost:3001").replace(/\/$/, "");
    const isLocal = gatewayUrl.includes("localhost") || gatewayUrl.includes("127.0.0.1");
    if (message === "__PING_HEALTH_CHECK__") {
      if (isLocal) return { success: false, error: "Local PC gateway must be checked directly from the browser on this machine.", status: 400 };
      try {
        const pingController = new AbortController();
        const pingTimeout = setTimeout(() => pingController.abort(), 12000);
        const pingRes = await fetch(`${gatewayUrl}/health`, { headers: { "Bypass-Tunnel-Reminder": "true" }, signal: pingController.signal });
        clearTimeout(pingTimeout);
        const pingData = await pingRes.json().catch(() => ({}));
        return { success: pingRes.ok && Boolean(pingData.connected), data: pingData };
      } catch (pingErr: any) {
        return { success: false, error: `Could not reach ${gatewayUrl}: ${pingErr.message}`, status: 502 };
      }
    }
    if (isLocal) return { success: false, error: "Direct connection required for Local PC Gateway. Start the gateway on port 3001.", status: 502 };
    const targetUrl = `${gatewayUrl}/send-message`;
    async function attemptSend(attempt = 1): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      try {
        const res = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true", ...(config.gateway_api_key ? { "x-api-key": config.gateway_api_key } : {}) },
          body: JSON.stringify({ phone, number: phone, message, text: message }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data, error: data?.error };
      } catch (err: any) {
        clearTimeout(timeout);
        if (attempt === 1 && !isLocal) {
          await new Promise((r) => setTimeout(r, 5000));
          return attemptSend(2);
        }
        return { ok: false, status: 502, data: null, error: err.message };
      }
    }
    const result = await attemptSend(1);
    if (!result.ok) return { success: false, error: result.error || `Gateway returned HTTP ${result.status}`, status: result.status === 502 ? 502 : 400 };
    if (result.data?.status === "dispatched_mock") return { success: false, error: `Gateway is running at ${gatewayUrl}, but WhatsApp is not linked yet.`, status: 400 };
    return { success: true, provider: "local_gateway", data: result.data, messageId: result.data?.messageId || result.data?.id };
  }

  if (config.provider === "ultramsg") {
    const instanceId = config.ultramsg_instance_id?.trim();
    const token = config.ultramsg_token?.trim();
    if (!instanceId || !token) return { success: false, error: "UltraMsg Instance ID and Token are required.", status: 400 };
    const ultraUrl = `https://api.ultramsg.com/${instanceId}/messages/chat`;
    const params = new URLSearchParams({ token, to: phone, body: message });
    const res = await fetch(ultraUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) return { success: false, error: data?.error || "UltraMsg Error", status: 400 };
    return { success: true, provider: "ultramsg", data };
  }

  return { success: false, error: "Unknown provider", status: 400 };
}
