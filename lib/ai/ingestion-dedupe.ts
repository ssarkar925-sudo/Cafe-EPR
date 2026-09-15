/**
 * Duplicate detection for ingestion events (Phase 7).
 *
 * Three independent keys — never rely on one:
 *   1. primary: business_id + source_provider + external ID
 *   2. content_hash: stable hash of the normalized payload
 *   3. triple: provider + amount + occurred date + external reference
 *
 * The content hash here is a non-cryptographic assist key (djb2). The
 * database unique constraint on (business_id, source_provider,
 * external_event_id) remains the authoritative guard.
 */

export interface DedupeKeys {
  primary: string | null;
  contentHash: string;
  triple: string | null;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Non-cryptographic stable hash (assist key only, not a security boundary). */
export function contentHashOf(payload: unknown): string {
  const text = stableStringify(payload);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function normalizeExternalId(value: string | null | undefined): string | null {
  const clean = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  return clean || null;
}

export function buildDedupeKeys(args: {
  businessId: string;
  sourceProvider: string;
  externalEventId?: string | null;
  externalReference?: string | null;
  amount?: number | null;
  occurredAt?: string | null;
  normalizedPayload?: unknown;
}): DedupeKeys {
  const businessId = String(args.businessId || "default").trim() || "default";
  const provider = String(args.sourceProvider || "").trim().toLowerCase();
  const externalId = normalizeExternalId(args.externalEventId || args.externalReference);
  const primary = externalId ? `${businessId}|${provider}|${externalId}` : null;

  const amountKey =
    args.amount !== null && args.amount !== undefined && Number.isFinite(Number(args.amount))
      ? Number(args.amount).toFixed(2)
      : "";
  const dateKey = String(args.occurredAt || "").slice(0, 10);
  const refKey = normalizeExternalId(args.externalReference) || "";
  const triple =
    provider && amountKey && dateKey && refKey ? `${provider}|${amountKey}|${dateKey}|${refKey}` : null;

  return {
    primary,
    contentHash: contentHashOf(args.normalizedPayload ?? { primary, triple }),
    triple,
  };
}

export interface DedupeCandidate {
  id: string;
  businessId: string;
  sourceProvider: string;
  externalEventId: string | null;
  externalReference: string | null;
  contentHash: string;
  amount: number | null;
  occurredAt: string | null;
}

export type DuplicateKind = "primary" | "content_hash" | "triple";

export function findDuplicate(
  keys: DedupeKeys,
  candidates: DedupeCandidate[],
  businessId: string,
): { kind: DuplicateKind; event: DedupeCandidate } | null {
  const biz = String(businessId || "default").trim() || "default";
  const inScope = candidates.filter((c) => String(c.businessId || "default") === biz);
  if (keys.primary) {
    const hit = inScope.find((c) => {
      const candidateId = (c.externalEventId || c.externalReference || "").trim().toUpperCase().replace(/\s+/g, "");
      return candidateId !== "" && `${biz}|${c.sourceProvider.trim().toLowerCase()}|${candidateId}` === keys.primary;
    });
    if (hit) return { kind: "primary", event: hit };
  }
  if (keys.contentHash) {
    const hit = inScope.find((c) => c.contentHash === keys.contentHash);
    if (hit) return { kind: "content_hash", event: hit };
  }
  if (keys.triple) {
    const hit = inScope.find((c) => {
      const amountKey =
        c.amount !== null && c.amount !== undefined && Number.isFinite(Number(c.amount))
          ? Number(c.amount).toFixed(2)
          : "";
      const dateKey = String(c.occurredAt || "").slice(0, 10);
      const refKey = String(c.externalReference || "").trim().toUpperCase().replace(/\s+/g, "");
      if (!amountKey || !dateKey || !refKey) return false;
      return `${c.sourceProvider.trim().toLowerCase()}|${amountKey}|${dateKey}|${refKey}` === keys.triple;
    });
    if (hit) return { kind: "triple", event: hit };
  }
  return null;
}
