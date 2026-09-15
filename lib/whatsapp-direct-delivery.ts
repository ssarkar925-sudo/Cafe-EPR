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
  caption?: string;
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
  "caption",
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
  args: { phone: unknown; documentUrl: unknown; fileName: unknown; documentBase64?: unknown; caption?: unknown }
): GatewayFallback | null {
  const normalized = normalizeGatewayUrl(gatewayUrl);
  const phone = String(args?.phone ?? "").trim();
  const documentUrl = String(args?.documentUrl ?? "").trim();
  const fileName = String(args?.fileName ?? "").trim() || "Invoice.pdf";
  const documentBase64 = String(args?.documentBase64 ?? "").trim();
  const caption = String(args?.caption ?? "").trim().slice(0, 800);
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
  if (caption) payload.caption = caption;
  if (documentBase64) {
    payload.documentBase64 = documentBase64;
    payload.pdfBase64 = documentBase64;
  }
  for (const key of Object.keys(payload)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key)) delete (payload as Record<string, unknown>)[key];
  }
  return { gatewayUrl: normalized, payload };
}

/**
 * Fire-and-forget report of the browser direct-delivery outcome. Never throws.
 * The gateway poller remains the delivery guarantee, so a lost report is
 * harmless (the job simply stays pending until the poller sends it).
 */
export async function reportJobOutcome(
  jobId: string | null | undefined,
  outcome: { messageId?: string; error?: string }
): Promise<void> {
  if (!jobId) return;
  try {
    await fetch("/api/whatsapp/send-invoice/job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        outcome.messageId
          ? { jobId, messageId: outcome.messageId }
          : { jobId, error: outcome.error || "Direct device delivery failed." }
      ),
    });
  } catch {
    // Intentionally silent: delivery does not depend on this report.
  }
}

/** Matches the customer-invoices storage bucket file size limit. */
export const MAX_CLIENT_PDF_BYTES = 10 * 1024 * 1024;

export type ClientPdfValidation =
  | { ok: true; bytes: Uint8Array; size: number }
  | { ok: false; error: string; status: number };

/**
 * Strict validation for client-supplied invoice PDF bytes (Task 13).
 * Rejects: missing/empty payload, malformed base64, wrong magic, oversize,
 * non-PDF MIME. Never throws and never logs the payload.
 */
export function validateClientPdfBytes(input: {
  documentBase64?: unknown;
  mimeType?: unknown;
  maxBytes?: number;
}): ClientPdfValidation {
  const raw = String(input?.documentBase64 ?? "").trim();
  if (!raw) return { ok: false, error: "Invoice PDF content is required.", status: 400 };
  const mime = String(input?.mimeType ?? "application/pdf").trim().toLowerCase() || "application/pdf";
  if (mime !== "application/pdf") {
    return { ok: false, error: "Invoice document must be application/pdf.", status: 400 };
  }
  const compact = raw.replace(/\s+/g, "").replace(/^data:application\/pdf;base64,/i, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 !== 0) {
    return { ok: false, error: "Invoice PDF content is not valid base64.", status: 400 };
  }
  let bytes: Uint8Array;
  try {
    const bin = typeof atob === "function" ? atob(compact) : Buffer.from(compact, "base64").toString("binary");
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return { ok: false, error: "Invoice PDF content is not valid base64.", status: 400 };
  }
  if (bytes.length === 0) return { ok: false, error: "Invoice PDF content is empty.", status: 400 };
  const maxBytes = input?.maxBytes && input.maxBytes > 0 ? input.maxBytes : MAX_CLIENT_PDF_BYTES;
  if (bytes.length > maxBytes) {
    return { ok: false, error: `Invoice PDF exceeds the ${(maxBytes / (1024 * 1024)).toFixed(0)} MB delivery limit.`, status: 413 };
  }
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]) !== "%PDF-") {
    return { ok: false, error: "Invoice document is not a valid PDF.", status: 400 };
  }
  return { ok: true, bytes, size: bytes.length };
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

const RETRYABLE_STATUS = new Set([502, 503, 504]);
const RETRY_BACKOFF_MS = [1500, 4000, 8000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postDocumentDirectToGateway(
  gatewayUrl: string,
  payload: GatewayDocumentPayload,
  timeoutMs = 60000,
  options?: { retries?: number }
): Promise<{ ok: boolean; messageId?: string; status?: number; error?: string; data?: any; attempts: number }> {
  const normalized = normalizeGatewayUrl(gatewayUrl);
  if (!normalized) return { ok: false, error: "WhatsApp gateway URL is missing or invalid.", attempts: 0 };
  if (!payload?.phone) return { ok: false, error: "Phone and invoice PDF are required.", attempts: 0 };
  // Transient network throws (reset connections, Render restarts/cold starts)
  // and proxy-level 502/503/504 are retried with backoff. Definitive gateway
  // answers (other statuses, JSON errors, QR-not-linked) are returned as-is.
  const maxAttempts = 1 + Math.min(Math.max(options?.retries ?? 2, 0), 3);
  let attempts = 0;
  let lastError = "request failed";
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempts++;
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
        if (RETRYABLE_STATUS.has(response.status) && attempts < maxAttempts) {
          lastError = String(data?.error || data?.message || data?.raw || `Gateway returned HTTP ${response.status}`);
          await sleep(RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)]);
          continue;
        }
        return {
          ok: false,
          status: response.status,
          error: String(data?.error || data?.message || data?.raw || `Gateway returned HTTP ${response.status}`),
          data,
          attempts,
        };
      }
      if (data?.status === "dispatched_mock") {
        return { ok: false, status: response.status, error: "WhatsApp gateway is not linked yet. Scan the QR code first.", data, attempts };
      }
      return { ok: true, messageId: data?.messageId || data?.id, status: response.status, data, attempts };
    } catch (err: any) {
      const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
      lastError = String(err?.message || "request failed");
      if (attempts < maxAttempts) {
        await sleep(RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)]);
        continue;
      }
      return {
        ok: false,
        attempts,
        error: isTimeout
          ? `Direct delivery from this device timed out after ${attempts} attempt(s).`
          : `Could not reach WhatsApp gateway from this device (attempt ${attempts}): ${lastError}`,
      };
    }
  }
}
