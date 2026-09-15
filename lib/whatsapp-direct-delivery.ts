/**
 * Browser-side direct delivery to the WhatsApp gateway.
 *
 * Server-side fetches from Cloudflare Workers to the Cloudflare-fronted Render
 * gateway can be rejected at the edge (HTTP 403 "error code: 1003"). Browser
 * egress is unaffected, so when the server reports an edge rejection it hands
 * the already-prepared payload back and the device POSTs it directly.
 *
 * This module is intentionally dependency-free so it can run in the browser,
 * on the server, and under plain Node test harnesses. It never handles API
 * keys, tokens, or secrets — only the public gateway URL and the PDF payload.
 */

export type GatewayDocumentPayload = {
  phone: string;
  number?: string;
  documentUrl: string;
  document?: string;
  fileName: string;
  filename?: string;
  mimetype?: string;
  documentBase64?: string;
  pdfBase64?: string;
};

export type GatewayFallback = {
  gatewayUrl: string;
  payload: GatewayDocumentPayload;
};

const ALLOWED_PAYLOAD_KEYS = new Set([
  "phone",
  "number",
  "documentUrl",
  "document",
  "fileName",
  "filename",
  "mimetype",
  "documentBase64",
  "pdfBase64",
]);

function normalizeGatewayUrl(raw: unknown): string | null {
  const value = String(raw ?? "").trim().replace(/\/$/, "");
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const localHttp =
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
    if (url.protocol !== "https:" && !localHttp) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * Builds the browser handoff for an already-prepared invoice PDF. Returns null
 * when the inputs are unusable. The payload contains no credentials by
 * construction — only phone, document URL/bytes, filename, and MIME type.
 */
export function buildGatewayFallback(
  gatewayUrl: unknown,
  args: { phone: unknown; documentUrl: unknown; fileName: unknown; documentBase64?: unknown }
): GatewayFallback | null {
  const normalized = normalizeGatewayUrl(gatewayUrl);
  const phone = String(args?.phone ?? "").trim();
  const documentUrl = String(args?.documentUrl ?? "").trim();
  const fileName = String(args?.fileName ?? "").trim() || "Invoice.pdf";
  const documentBase64 = String(args?.documentBase64 ?? "").trim();
  if (!normalized || !phone || (!documentUrl && !documentBase64)) return null;
  const payload: GatewayDocumentPayload = {
    phone,
    number: phone,
    documentUrl,
    document: documentUrl,
    fileName,
    filename: fileName,
    mimetype: "application/pdf",
  };
  if (documentBase64) {
    payload.documentBase64 = documentBase64;
    payload.pdfBase64 = documentBase64;
  }
  for (const key of Object.keys(payload)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key)) delete (payload as Record<string, unknown>)[key];
  }
  return { gatewayUrl: normalized, payload };
}

function parseBody(raw: string): any {
  const text = String(raw || "").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

export async function postDocumentDirectToGateway(
  gatewayUrl: string,
  payload: GatewayDocumentPayload,
  timeoutMs = 60000
): Promise<{ ok: boolean; messageId?: string; status?: number; error?: string; data?: any }> {
  const normalized = normalizeGatewayUrl(gatewayUrl);
  if (!normalized) return { ok: false, error: "WhatsApp gateway URL is missing or invalid." };
  if (!payload?.phone) return { ok: false, error: "Phone and invoice PDF are required." };
  try {
    const response = await fetch(`${normalized}/send-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const raw = await response.text();
    const data = parseBody(raw);
    if (!response.ok || data?.success === false) {
      return {
        ok: false,
        status: response.status,
        error: String(data?.error || data?.message || data?.raw || `Gateway returned HTTP ${response.status}`),
        data,
      };
    }
    if (data?.status === "dispatched_mock") {
      return { ok: false, status: response.status, error: "WhatsApp gateway is not linked yet. Scan the QR code first.", data };
    }
    return { ok: true, messageId: data?.messageId || data?.id, status: response.status, data };
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    return { ok: false, error: isTimeout ? "Direct gateway delivery timed out." : `Could not reach WhatsApp gateway: ${err?.message || "request failed"}` };
  }
}
