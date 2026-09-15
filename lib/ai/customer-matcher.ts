/**
 * Customer matching for ingestion events (Phase 8).
 *
 * Priority: exact customer ID > exact phone > explicitly linked external
 * reference > normalized phone+name > fuzzy name (candidate only).
 *
 * Fuzzy name matches are returned as CANDIDATES and must never trigger
 * automatic financial assignment. No identity is ever invented.
 */

export interface MatchableCustomer {
  id: string;
  phone?: string | null;
  name?: string | null;
}

export type MatchOutcome = "matched" | "candidate" | "ambiguous" | "unmatched";

export interface CustomerMatchResult {
  outcome: MatchOutcome;
  customerId: string | null;
  confidence: number;
  reasons: string[];
}

/** Indian mobile normalization: keep the significant trailing digits. */
export function normalizePhoneForMatch(mobile: string | null | undefined): string | null {
  if (!mobile) return null;
  const digits = String(mobile).replace(/\D/g, "");
  if (!digits) return null;
  const significant = digits.length > 10 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (significant.length < 10 || significant.length > 13) return null;
  return significant;
}

function nameTokens(name: string | null | undefined): string[] {
  return String(name || "")
    .toLowerCase()
    .split(/[^a-z\u0900-\u097F\u0980-\u09FF]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function nameOverlap(a: string | null | undefined, b: string | null | undefined): number {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const token of ta) {
    if (tb.has(token)) shared++;
  }
  return shared / Math.max(ta.size, tb.size);
}

export function matchCustomer(
  contact: { customerIdHint?: string | null; phone?: string | null; name?: string | null; reference?: string | null },
  customers: MatchableCustomer[],
  referenceLinks?: Record<string, string>,
): CustomerMatchResult {
  const reasons: string[] = [];
  const list = Array.isArray(customers) ? customers : [];

  if (contact.customerIdHint) {
    const hit = list.find((c) => c.id === contact.customerIdHint);
    if (hit) return { outcome: "matched", customerId: hit.id, confidence: 1.0, reasons: ["exact_customer_id"] };
    reasons.push("customer_id_hint_not_found");
  }

  const phone = normalizePhoneForMatch(contact.phone);
  if (phone) {
    const hits = list.filter((c) => normalizePhoneForMatch(c.phone) === phone);
    if (hits.length === 1) {
      return { outcome: "matched", customerId: hits[0].id, confidence: 0.95, reasons: ["exact_phone"] };
    }
    if (hits.length > 1) {
      return { outcome: "ambiguous", customerId: null, confidence: 0.5, reasons: ["phone_shared_by_multiple_customers"] };
    }
    reasons.push("phone_not_found");
  }

  const ref = String(contact.reference || "").trim().toUpperCase().replace(/\s+/g, "");
  if (ref && referenceLinks && referenceLinks[ref]) {
    const linkedId = referenceLinks[ref];
    if (list.some((c) => c.id === linkedId)) {
      return { outcome: "matched", customerId: linkedId, confidence: 0.9, reasons: ["explicit_reference_link"] };
    }
  }

  if (phone && contact.name) {
    const scored = list
      .map((c) => ({ customer: c, overlap: nameOverlap(contact.name, c.name) }))
      .filter((s) => s.overlap >= 0.5);
    if (scored.length === 1 && normalizePhoneForMatch(scored[0].customer.phone) === null) {
      return { outcome: "candidate", customerId: scored[0].customer.id, confidence: 0.7, reasons: ["name_overlap_single_candidate"] };
    }
    if (scored.length > 1) {
      return { outcome: "ambiguous", customerId: null, confidence: 0.55, reasons: ["multiple_name_candidates"] };
    }
    if (scored.length === 1) {
      return { outcome: "candidate", customerId: scored[0].customer.id, confidence: 0.65, reasons: ["phone_absent_name_overlap"] };
    }
  }

  if (contact.name) {
    const scored = list
      .map((c) => ({ customer: c, overlap: nameOverlap(contact.name, c.name) }))
      .filter((s) => s.overlap >= 0.66);
    if (scored.length === 1) {
      return {
        outcome: "candidate",
        customerId: scored[0].customer.id,
        confidence: 0.6,
        reasons: ["fuzzy_name_only_never_auto_assign"],
      };
    }
    if (scored.length > 1) {
      return { outcome: "ambiguous", customerId: null, confidence: 0.5, reasons: ["multiple_fuzzy_name_candidates"] };
    }
  }

  return { outcome: "unmatched", customerId: null, confidence: 0, reasons };
}
