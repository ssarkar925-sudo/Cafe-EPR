import { formatWhatsAppPhone } from "@/lib/whatsapp-shared";
import type { WhatsAppConfig } from "@/lib/whatsapp-shared";

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
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { success: false, error: data?.error?.message || "Meta WhatsApp document send failed.", status: 400, data };
    return { success: true, provider: "meta", messageId: data?.messages?.[0]?.id, data };
  }

  if (config.provider === "local_gateway") {
    const gateway = String(config.gateway_url || "").replace(/\/$/, "");
    if (!gateway) return { success: false, error: "WhatsApp gateway URL is missing.", status: 400 };
    const response = await fetch(`${gateway}/send-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true", ...(config.gateway_api_key ? { "x-api-key": config.gateway_api_key } : {}) },
      body: JSON.stringify({ phone, documentUrl, fileName: filename }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false) return { success: false, error: data?.error || "WhatsApp gateway document send failed.", status: response.status || 400, data };
    if (data?.status === "dispatched_mock") return { success: false, error: "WhatsApp gateway is not linked yet. Scan the QR code first.", status: 400 };
    return { success: true, provider: "local_gateway", messageId: data?.messageId, data };
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
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.error) return { success: false, error: data?.error || "UltraMsg document send failed.", status: 400, data };
    return { success: true, provider: "ultramsg", messageId: data?.id || data?.messageId, data };
  }

  return { success: false, error: "Unknown WhatsApp provider.", status: 400 };
}
