import { formatWhatsAppPhone } from "@/lib/whatsapp-shared";
import type { WhatsAppConfig } from "@/lib/whatsapp-shared";

function parseResponse(raw: string) {
  const text = String(raw || "").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function responseError(status: number, data: any, path: string) {
  return String(
    data?.error ||
      data?.message ||
      data?.detail ||
      (data?.raw ? `HTTP ${status} from ${path}: ${data.raw}` : `HTTP ${status} from WhatsApp gateway at ${path}`)
  );
}

export async function sendCustomerInvoicePdf(phone: string, config: WhatsAppConfig, documentUrl: string, filename: string) {
  if (!phone || !documentUrl) return { success: false, error: "Phone and invoice PDF URL are required.", status: 400 };
  if (!config || config.provider === "off") return { success: false, error: "WhatsApp integration is not enabled in Settings.", status: 400 };
  const to = formatWhatsAppPhone(phone);
  if (!to || to.length < 10) return { success: false, error: "Invalid recipient phone number format.", status: 400 };

  if (config.provider === "meta") {
    const phoneId = config.meta_phone_number_id?.trim();
    const token = config.meta_access_token?.trim();
    if (!phoneId || !token) return { success: false, error: "Meta Phone Number ID and Access Token are required.", status: 400 };
    const response = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "document", document: { link: documentUrl, filename } }),
      signal: AbortSignal.timeout(15000),
    });
    const raw = await response.text();
    const data = parseResponse(raw);
    if (!response.ok) return { success: false, error: data?.error?.message || data?.error || "Meta WhatsApp document send failed.", status: response.status, data };
    return { success: true, provider: "meta", messageId: data?.messages?.[0]?.id, data };
  }

  if (config.provider === "local_gateway") {
    const gateway = String(config.gateway_url || "").trim().replace(/\/$/, "");
    if (!gateway) return { success: false, error: "WhatsApp gateway URL is missing.", status: 400 };

    const headers = {
      "Content-Type": "application/json",
      "Bypass-Tunnel-Reminder": "true",
      ...(config.gateway_api_key ? { "x-api-key": config.gateway_api_key } : {}),
    };
    const payload = {
      phone,
      number: phone,
      documentUrl,
      document: documentUrl,
      fileName: filename,
      filename,
      mimetype: "application/pdf",
    };

    async function callGateway(path: string) {
      const response = await fetch(`${gateway}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        redirect: "follow",
        signal: AbortSignal.timeout(60000),
      });
      const raw = await response.text();
      return { response, data: parseResponse(raw) };
    }

    try {
      let result = await callGateway("/send-document");
      let path = "/send-document";

      // Some older gateway/controller builds expose the same handler under /api/send-document.
      // Retry only on 404; a 5xx or transport failure must not be replayed automatically.
      if (result.response.status === 404) {
        result = await callGateway("/api/send-document");
        path = "/api/send-document";
      }

      if (!result.response.ok || result.data?.success === false) {
        return {
          success: false,
          error: responseError(result.response.status || 502, result.data, path),
          status: result.response.status || 502,
          data: result.data,
        };
      }

      if (result.data?.status === "dispatched_mock") {
        return {
          success: false,
          error: "WhatsApp gateway is reachable, but WhatsApp is not linked. Scan the QR code first.",
          status: 400,
          data: result.data,
        };
      }

      return {
        success: true,
        provider: "local_gateway",
        messageId: result.data?.messageId || result.data?.id,
        data: result.data,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Could not reach WhatsApp gateway: ${error?.message || "request failed"}`,
        status: 502,
      };
    }
  }

  if (config.provider === "ultramsg") {
    const instanceId = config.ultramsg_instance_id?.trim();
    const token = config.ultramsg_token?.trim();
    if (!instanceId || !token) return { success: false, error: "UltraMsg Instance ID and Token are required.", status: 400 };
    const params = new URLSearchParams({ token, to, filename, document: documentUrl });
    const response = await fetch(`https://api.ultramsg.com/${encodeURIComponent(instanceId)}/messages/document`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });
    const raw = await response.text();
    const data = parseResponse(raw);
    if (!response.ok || data?.error) return { success: false, error: data?.error || "UltraMsg document send failed.", status: response.status, data };
    return { success: true, provider: "ultramsg", messageId: data?.id || data?.messageId, data };
  }

  return { success: false, error: "Unknown WhatsApp provider.", status: 400 };
}
