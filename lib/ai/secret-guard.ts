/**
 * Secret guard for the AI ingestion platform (Phase 19).
 *
 * Hard rules enforced everywhere data enters the pipeline:
 * NEVER collect or store: OTP, PIN, password, CVV, card numbers, banking
 * credentials, UPI PINs, payment authorization codes.
 *
 * Secrets are rejected at intake and redacted from logs, raw payloads,
 * AI prompts, telemetry, and error reports.
 */

const SECRET_VALUE_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "otp", pattern: /\botp\b|\bone[- ]time pass(?:word|code)\b/i },
  { name: "pin", pattern: /\b(?:upi[ -]?pin|card[ -]?pin|atm[ -]?pin|mpin)\b/i },
  { name: "password", pattern: /\bpass(?:word|code)\b/i },
  { name: "cvv", pattern: /\bcvv\b/i },
  { name: "card_number", pattern: /\b(?:\d[ -]?){13,19}\b/ },
  { name: "payment_authorization", pattern: /\bpayment authorization\b|\bauthorize (?:payment|transaction)\b/i },
];

const SECRET_FIELD_NAMES = new Set(
  [
    "otp",
    "one_time_password",
    "pin",
    "upin",
    "upi_pin",
    "password",
    "passcode",
    "passwd",
    "pwd",
    "cvv",
    "card_number",
    "cardnumber",
    "pan_number",
    "bank_password",
    "mpin",
    "auth_code",
    "authorization_code",
    "payment_authorization",
    "secret",
    "token",
    "session_token",
    "cookie",
    "cookies",
    "set-cookie",
  ].map((s) => s.toLowerCase()),
);

export type SecretFinding = { field: string; kind: string };

/** Scan arbitrary text for secret indicators. Returns the matched kinds. */
export function detectSecretsInText(text: string): string[] {
  const haystack = String(text || "");
  const found: string[] = [];
  for (const { name, pattern } of SECRET_VALUE_PATTERNS) {
    try {
      if (pattern.test(haystack)) found.push(name);
    } catch {
      // A broken pattern must never block intake; skip it.
    }
  }
  return [...new Set(found)];
}

/** Recursively find forbidden field names inside a JSON payload. */
export function findSecretFields(payload: unknown, path = "$"): SecretFinding[] {
  const findings: SecretFinding[] = [];
  if (Array.isArray(payload)) {
    payload.forEach((item, index) => {
      findings.push(...findSecretFields(item, `${path}[${index}]`));
    });
    return findings;
  }
  if (payload && typeof payload === "object") {
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      const fieldPath = `${path}.${key}`;
      if (SECRET_FIELD_NAMES.has(String(key).toLowerCase())) {
        findings.push({ field: fieldPath, kind: "forbidden_field" });
        continue;
      }
      findings.push(...findSecretFields(value, fieldPath));
    }
    return findings;
  }
  if (typeof payload === "string" && payload.length > 0 && payload.length < 20000) {
    for (const kind of detectSecretsInText(payload)) {
      findings.push({ field: path, kind });
    }
  }
  return findings;
}

const REDACTED = "[REDACTED]";

/** Deep-clone a payload with forbidden fields redacted. Never throws. */
export function redactSecrets(payload: unknown): unknown {
  try {
    if (Array.isArray(payload)) return payload.map((item) => redactSecrets(item));
    if (payload && typeof payload === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
        out[key] = SECRET_FIELD_NAMES.has(String(key).toLowerCase()) ? REDACTED : redactSecrets(value);
      }
      return out;
    }
    return payload;
  } catch {
    return REDACTED;
  }
}

/** Redact secrets from free text (logs, prompts, telemetry, errors). */
export function redactSecretsFromText(text: string): string {
  let out = String(text || "");
  try {
    out = out.replace(/(\b(?:otp|pin|password|passcode|cvv)\b\s*[:=]?\s*)([^\s,;]{1,64})/gi, `$1${REDACTED}`);
    out = out.replace(/\b(?:\d[ -]?){13,19}\b/g, REDACTED);
  } catch {
    return REDACTED;
  }
  return out;
}

/** Portal domains allowlisted for authenticated browser collection. */
const PORTAL_DOMAIN_ALLOWLIST = [
  "digipay",
  "spicemoney",
  "spice-money",
  "paymonk",
  "csc.gov.in",
  "airtel",
  "paytm",
];

export function isAllowedPortalHost(hostname: string): boolean {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) return false;
  return PORTAL_DOMAIN_ALLOWLIST.some((entry) => host === entry || host.endsWith(`.${entry}`) || host.includes(entry));
}

/** Notification source allowlist: only explicitly configured apps are collected. */
export function isAllowedNotificationSource(packageName: string, allowlist: string[]): boolean {
  const pkg = String(packageName || "").trim().toLowerCase();
  if (!pkg || !Array.isArray(allowlist) || allowlist.length === 0) return false;
  return allowlist.some((entry) => String(entry || "").trim().toLowerCase() === pkg);
}
