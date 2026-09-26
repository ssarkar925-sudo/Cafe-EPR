/**
 * Canonical customer search + identity utilities (single source of truth).
 *
 * Used by the search API, every customer selector, duplicate detection, and
 * AI customer lookups. Rules:
 * - Phone identity is digit-based with Indian conventions (+91 / 91 / leading
 *   0 / local 10-digit all resolve via last-10-digit comparison). Display
 *   values are never altered here.
 * - Customer IDs compare as case-insensitive strings, byte-exact otherwise.
 *   Leading zeros are significant: "001245" never equals "1245".
 * - Name matching is restrained: exact > prefix > substring > token overlap.
 *   Weak fuzzy matches never outrank an exact ID/phone/name hit.
 */

export interface CustomerSearchRecord {
  id: string;
  code?: string | null;
  name?: string | null;
  phone?: string | null;
  aadhaarLast4?: string | null;
  aadhaar_last4?: string | null;
}

/** Strip formatting; drop trunk prefixes. Never prepends country codes. */
export function normalizePhone(value: string | null | undefined): string {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/** Local 10-digit form used for cross-format identity comparison. */
export function phoneIdentityKey(value: string | null | undefined): string {
  const digits = normalizePhone(value);
  if (digits.length < 10) return digits;
  return digits.slice(-10);
}

/** True when both numbers identify the same subscriber. */
export function samePhoneNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = normalizePhone(a);
  const db = normalizePhone(b);
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 10 && db.length >= 10) {
    return da.slice(-10) === db.slice(-10);
  }
  return false;
}

export function normalizeSearchText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function nameTokens(name: string): string[] {
  return normalizeSearchText(name)
    .split(/[^a-z0-9\u0900-\u097F\u0980-\u09FF]+/u)
    .filter((t) => t.length > 0);
}

export type MatchTier =
  | "exact-id"
  | "exact-phone"
  | "exact-name"
  | "prefix"
  | "partial"
  | "token"
  | "none";

export const MATCH_SCORES: Record<MatchTier, number> = {
  "exact-id": 100,
  "exact-phone": 90,
  "exact-name": 80,
  prefix: 60,
  partial: 40,
  token: 30,
  none: 0,
};

export interface CustomerMatch {
  tier: MatchTier;
  score: number;
  field: "id" | "code" | "phone" | "name" | null;
}

/** Score one record against a raw query. Pure; no I/O. */
export function matchCustomerRecord(
  record: CustomerSearchRecord,
  rawQuery: string,
): CustomerMatch {
  const none: CustomerMatch = { tier: "none", score: 0, field: null };
  const query = normalizeSearchText(rawQuery);
  if (!query) return none;

  const id = String(record.id || "");
  const code = String(record.code || "");
  const phoneDigits = normalizePhone(record.phone);
  const queryDigits = normalizePhone(rawQuery);
  const nameNorm = normalizeSearchText(record.name);

  // 1. Exact customer ID (uuid or code). String comparison only — leading
  // zeros are significant, no numeric coercion anywhere.
  if (id && (query === id.toLowerCase() || (code && query === code.toLowerCase()))) {
    return { tier: "exact-id", score: MATCH_SCORES["exact-id"], field: query === id.toLowerCase() ? "id" : "code" };
  }

  // Exact code matching ignoring hyphen (e.g. CUST00125 matches CUST-00125, preserving leading zeros)
  if (code && query) {
    const codeNoHyphen = code.replace(/-/g, "").toLowerCase();
    const queryNoHyphen = query.replace(/-/g, "").toLowerCase();
    if (codeNoHyphen === queryNoHyphen) {
      return { tier: "exact-id", score: MATCH_SCORES["exact-id"], field: "code" };
    }
  }

  // Exact Aadhaar last 4 match (4 digits, or masked ••••1234)
  const aadhaarDigits = String(record.aadhaarLast4 || record.aadhaar_last4 || "").replace(/\D/g, "");
  if (queryDigits.length === 4 && aadhaarDigits.length >= 4 && aadhaarDigits.slice(-4) === queryDigits) {
    return { tier: "exact-id", score: MATCH_SCORES["exact-id"], field: "id" };
  }

  // 2. Exact phone (normalized, with last-10 cross-format equality).
  if (queryDigits.length >= 7 && phoneDigits) {
    if (queryDigits === phoneDigits) {
      return { tier: "exact-phone", score: MATCH_SCORES["exact-phone"], field: "phone" };
    }
    if (queryDigits.length >= 10 && phoneDigits.length >= 10 && queryDigits.slice(-10) === phoneDigits.slice(-10)) {
      return { tier: "exact-phone", score: MATCH_SCORES["exact-phone"], field: "phone" };
    }
  }

  // 3. Exact name (case-insensitive, whitespace-tolerant).
  if (nameNorm && query === nameNorm) {
    return { tier: "exact-name", score: MATCH_SCORES["exact-name"], field: "name" };
  }

  // 4. Prefix on any field (id/code/phone-digits/name).
  const haystacks = [
    { text: id.toLowerCase(), field: "id" as const },
    { text: code.toLowerCase(), field: "code" as const },
    { text: code.replace(/-/g, "").toLowerCase(), field: "code" as const },
    { text: nameNorm, field: "name" as const },
  ];
  if (queryDigits.length >= 3 && phoneDigits.startsWith(queryDigits)) {
    return { tier: "prefix", score: MATCH_SCORES.prefix, field: "phone" };
  }
  for (const hay of haystacks) {
    if (hay.text && query.length >= 2 && hay.text.startsWith(query)) {
      return { tier: "prefix", score: MATCH_SCORES.prefix, field: hay.field };
    }
  }

  // 5. Substring on any field.
  if (phoneDigits.includes(queryDigits) && queryDigits.length >= 3) {
    return { tier: "partial", score: MATCH_SCORES.partial, field: "phone" };
  }
  for (const hay of haystacks) {
    if (hay.text && query.length >= 2 && hay.text.includes(query)) {
      return { tier: "partial", score: MATCH_SCORES.partial, field: hay.field };
    }
  }

  // 6. Token overlap on names only (weakest; never outranks above).
  if (nameNorm) {
    const queryTokens = new Set(nameTokens(query));
    const recordTokens = new Set(nameTokens(nameNorm));
    if (queryTokens.size > 0) {
      let shared = 0;
      for (const token of queryTokens) {
        if (recordTokens.has(token)) shared++;
      }
      if (shared === queryTokens.size && queryTokens.size > 0) {
        return { tier: "token", score: MATCH_SCORES.token, field: "name" };
      }
    }
  }

  return none;
}

export interface RankedCustomer<T extends CustomerSearchRecord> {
  record: T;
  match: CustomerMatch;
}

/**
 * Deterministic ranking: score desc, then name asc, then id asc.
 * Empty queries return [] (callers must never dump the directory).
 */
export function rankCustomerResults<T extends CustomerSearchRecord>(
  records: T[],
  rawQuery: string,
  limit = 20,
): RankedCustomer<T>[] {
  if (!normalizeSearchText(rawQuery)) return [];
  const scored = records
    .map((record) => ({ record, match: matchCustomerRecord(record, rawQuery) }))
    .filter((entry) => entry.match.score > 0);
  scored.sort((a, b) => {
    if (b.match.score !== a.match.score) return b.match.score - a.match.score;
    const nameA = normalizeSearchText(a.record.name);
    const nameB = normalizeSearchText(b.record.name);
    if (nameA !== nameB) return nameA < nameB ? -1 : 1;
    return String(a.record.id) < String(b.record.id) ? -1 : 1;
  });
  return scored.slice(0, Math.max(1, Math.min(limit, 50)));
}

/** "Name" + "CODE · phone" display shape used by every selector. */
export function formatCustomerResult(record: CustomerSearchRecord): { title: string; subtitle: string } {
  const title = String(record.name || "Unnamed Customer").trim() || "Unnamed Customer";
  const code = String(record.code || "").trim();
  const phone = String(record.phone || "").trim();
  const aadhaar = String(record.aadhaarLast4 || record.aadhaar_last4 || "").trim();
  const parts = [code, phone];
  if (aadhaar) parts.push(`••••${aadhaar.slice(-4)}`);
  const subtitle = parts.filter(Boolean).join(" · ") || "No ID / phone on file";
  return { title, subtitle };
}

export type DuplicateStrength = "strong" | "weak" | "none";

export interface DuplicateCandidate<T extends CustomerSearchRecord> {
  record: T;
  strength: DuplicateStrength;
  reason: "exact-id" | "exact-phone" | "name-only";
}

/**
 * Duplicate detection for customer create/edit. Strong signals (exact ID or
 * exact normalized phone) block with user confirmation; weak name-only
 * matches are surfaced, never auto-merged.
 */
export function findDuplicateCandidates<T extends CustomerSearchRecord>(
  records: T[],
  candidate: { id?: string | null; code?: string | null; phone?: string | null; name?: string | null },
  excludeId?: string | null,
): DuplicateCandidate<T>[] {
  const out: DuplicateCandidate<T>[] = [];
  const candPhone = normalizePhone(candidate.phone);
  const candCode = normalizeSearchText(candidate.code);
  const candId = String(candidate.id || "").toLowerCase();
  const candName = normalizeSearchText(candidate.name);

  for (const record of records) {
    if (excludeId && String(record.id) === String(excludeId)) continue;
    const recCode = normalizeSearchText(record.code);
    if ((candId && candId === String(record.id).toLowerCase()) || (candCode && candCode === recCode)) {
      out.push({ record, strength: "strong", reason: "exact-id" });
      continue;
    }
    if (candPhone.length >= 7 && samePhoneNumber(candidate.phone, record.phone)) {
      out.push({ record, strength: "strong", reason: "exact-phone" });
      continue;
    }
    const recName = normalizeSearchText(record.name);
    if (candName && recName && candName === recName) {
      out.push({ record, strength: "weak", reason: "name-only" });
    }
  }
  return out;
}
