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

/**
 * Cloudflare edge rejection marker.
 *
 * The ERP runs on Cloudflare Workers (OpenNext). The gateway host
 * (*.onrender.com) is itself behind Cloudflare. When Workers egress hits that
 * edge, Cloudflare can answer with HTTP 403 + a 16-byte text/plain body
 * ("error code: 1003" = "Direct IP Access Not Allowed") instead of proxying
 * to Render. The PDF never reaches the gateway in that case.
 */
export const CLOUDFLARE_EDGE_REJECTION_CODE = "CLOUDFLARE_EDGE_1003";

export function isCloudflareEdgeRejection(status: number, data: any): boolean {
  if (status !== 403) return false;
  const raw = String(data?.raw || data?.error || data?.message || "");
  return /error\s*code:\s*1003/i.test(raw) || /direct\s+ip\s+access\s+not\s+allowed/i.test(raw);
}

/** Host + path only — never includes query strings that may carry signed tokens. */
export function describeEndpointForLog(url: string): { host: string; path: string } {
  try {
    const u = new URL(String(url));
    return { host: u.host.toLowerCase(), path: u.pathname || "/" };
  } catch {
    return { host: "invalid", path: "/" };
  }
}

export async function sendCustomerInvoicePdf(
  phone: string,
  config: WhatsAppConfig,
  documentUrl: string,
  filename: string,
  documentBase64?: string,
  options?: { timeoutMs?: number; caption?: string }
) {
  if (!phone || !documentUrl) return { success: false, error: "Phone and invoice PDF URL are required.", status: 400 };
  if (!config || config.provider === "off") return { success: false, error: "WhatsApp integration is not enabled in Settings.", status: 400 };
  const to = formatWhatsAppPhone(phone);
  if (!to || to.length < 10) return { success: false, error: "Invalid recipient phone number format.", status: 400 };

  if (config.provider === "meta") {
    const phoneId = config.meta_phone_number_id?.trim();
    const token = config.meta_access_token?.trim();
    if (!phoneId || !token) return { success: false, error: "Meta Phone Number ID and Access Token are required.", status: 400 };
    const metaCaption = String(options?.caption || "").trim().slice(0, 800);
    const response = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "document", document: { link: documentUrl, filename, ...(metaCaption ? { caption: metaCaption } : {}) } }),
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
    const gatewayCaption = String(options?.caption || "").trim().slice(0, 800);
    const payload = {
      phone,
      number: phone,
      documentUrl,
      document: documentUrl,
      fileName: filename,
      filename,
      mimetype: "application/pdf",
      ...(documentBase64 ? { documentBase64, pdfBase64: documentBase64 } : {}),
      ...(gatewayCaption ? { caption: gatewayCaption } : {}),
    };

    const timeoutMs = options?.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : 60000;

    async function callGateway(path: string) {
      const response = await fetch(`${gateway}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const raw = await response.text();
      return { response, data: parseResponse(raw) };
    }

    function isTimeoutError(err: any): boolean {
      return err?.name === "TimeoutError" || err?.name === "AbortError";
    }

    function sleep(ms: number): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    try {
      // One retry for transient network throws (fast failures only — never on
      // timeouts) and proxy-level 502/503/504. HTTP answers such as the 1003
      // edge rejection are definitive and are never retried.
      let result: { response: Response; data: any } | null = null;
      let path = "/send-document";
      let lastThrow: any = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          result = await callGateway(path);
          lastThrow = null;
        } catch (err: any) {
          lastThrow = err;
          result = null;
          if (isTimeoutError(err) || attempt >= 2) break;
          await sleep(2000);
          continue;
        }
        if ((result.response.status === 502 || result.response.status === 503 || result.response.status === 504) && attempt < 2) {
          await sleep(2000);
          continue;
        }
        break;
      }
      if (!result) throw lastThrow || new Error("request failed");

      if (result.response.status === 404) {
        result = await callGateway("/api/send-document");
        path = "/api/send-document";
      }

      if (!result.response.ok || result.data?.success === false) {
        const status = result.response.status || 502;
        if (isCloudflareEdgeRejection(status, result.data)) {
          return {
            success: false,
            code: CLOUDFLARE_EDGE_REJECTION_CODE,
            edgeRejected: true,
            error:
              "The network edge blocked the WhatsApp gateway request (Cloudflare error 1003: direct-IP access not allowed). The invoice PDF never reached the gateway.",
            status: 502,
            data: result.data,
          };
        }
        return {
          success: false,
          error: responseError(status, result.data, path),
          status,
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
