import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_TTL_SECONDS = 15 * 60;

function getSecret(): string {
  const value = process.env.CUSTOMER_DOCUMENT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!value) throw new Error("Customer invoice document secret is not configured.");
  return value;
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createCustomerInvoiceToken(invoiceId: string, expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS): string {
  const payload = `${invoiceId}.${expiresAt}`;
  return `${expiresAt}.${signPayload(payload)}`;
}

export function verifyCustomerInvoiceToken(invoiceId: string, token: string): boolean {
  const [expiresRaw, signature] = String(token || "").split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000) || !signature) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(signPayload(`${invoiceId}.${expiresAt}`));
  } catch {
    return false;
  }
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function buildCustomerInvoiceUrl(origin: string, invoiceId: string, expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS): string {
  const cleanOrigin = origin.replace(/\/$/, "");
  return `${cleanOrigin}/api/whatsapp/invoice/${encodeURIComponent(invoiceId)}?token=${encodeURIComponent(createCustomerInvoiceToken(invoiceId, expiresAt))}`;
}
