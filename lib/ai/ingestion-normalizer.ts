/**
 * Ingestion normalization engine (Phase 4).
 *
 * Provider-independent: raw source payloads become canonical normalized
 * transaction events. Reuses the existing parsePhoneSms / parsePortalData
 * collectors — no duplicated parsing logic.
 *
 * Every output carries confidence + ambiguity flags so downstream validation
 * can route doubtful data to human review instead of guessing.
 */

import { parsePhoneSms, parsePortalData } from "@/lib/ai/data-collector";
import type { IngestionEventType } from "@/lib/ai/ingestion-types";

export interface NormalizedIngestion {
  event_type: string;
  status: string;
  occurred_at: string | null;
  amount: number | null;
  fee: number | null;
  commission: number | null;
  currency: string;
  customer_name: string | null;
  customer_mobile: string | null;
  account_last4: string | null;
  bank_name: string | null;
  beneficiary: string | null;
  external_event_id: string | null;
  external_reference: string | null;
  metadata: Record<string, unknown>;
  confidence: number;
  ambiguity: string[];
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

/** DD-MM-YYYY / DD-Mon-YY fragments become ISO dates; unparseable stays null. */
export function normalizeLooseDate(value: string | null | undefined, now = new Date()): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw.slice(0, 10));
    return Number.isNaN(d.getTime()) ? null : raw.slice(0, 10);
  }
  const m = raw.match(/^(\d{1,2})[-\/](\d{1,2}|[A-Za-z]{3})[-\/](\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const monthToken = m[2];
  let year = Number(m[3]);
  if (m[3].length === 2) year += year >= 70 ? 1900 : 2000;
  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const month = /^\d+$/.test(monthToken) ? Number(monthToken) : months[monthToken.toLowerCase().slice(0, 3)] || 0;
  if (!day || !month || !year) return null;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() > now.getTime() + 86400000) return null;
  return iso;
}

function inferSmsEventType(text: string, direction: string): { type: string; confidence: number; ambiguous: boolean } {
  const lower = text.toLowerCase();
  if (/\bupi\b|\bvpa\b/.test(lower)) return { type: "upi", confidence: 0.8, ambiguous: false };
  if (/\baeps\b|\bfingerprint\b|\bmicro[\s-]?atm\b/.test(lower)) return { type: "aeps", confidence: 0.8, ambiguous: false };
  if (/\bdmt\b|\bmoney transfer\b|\bremittance\b/.test(lower)) return { type: "dmt", confidence: 0.8, ambiguous: false };
  if (/\brecharge\b|\btop[\s-]?up\b|\bdth\b|\bmobile\b/.test(lower)) return { type: "recharge", confidence: 0.75, ambiguous: false };
  if (/\bbill\b|\belectricity\b/.test(lower)) return { type: "bill_payment", confidence: 0.75, ambiguous: false };
  if (direction === "credit") return { type: "bank_credit", confidence: 0.65, ambiguous: false };
  if (direction === "debit") return { type: "bank_debit", confidence: 0.65, ambiguous: false };
  return { type: "bank_credit", confidence: 0.4, ambiguous: true };
}

/** Normalize a raw SMS / notification text body into a canonical event. */
export function normalizeSmsEvent(
  text: string,
  opts: { provider?: string; instance?: string } = {},
): NormalizedIngestion {
  const parsed = parsePhoneSms(text);
  const ambiguity: string[] = [];
  if (!parsed.isSms) ambiguity.push("not_recognized_as_financial_sms");
  const inferred = inferSmsEventType(text, parsed.direction);
  if (inferred.ambiguous) ambiguity.push("event_type_inferred");
  if (parsed.amount === null) ambiguity.push("amount_missing");
  if (!parsed.reference) ambiguity.push("reference_missing");
  if (parsed.direction === "unknown") ambiguity.push("direction_unknown");
  const occurred = normalizeLooseDate(parsed.date);
  if (parsed.date && !occurred) ambiguity.push("date_unparseable");

  let confidence = parsed.isSms ? 0.7 : 0.3;
  if (parsed.amount === null) confidence -= 0.15;
  if (!parsed.reference) confidence -= 0.1;
  if (parsed.direction === "unknown") confidence -= 0.1;
  if (!parsed.isSms) confidence = Math.min(confidence, 0.3);

  return {
    event_type: inferred.type as IngestionEventType,
    status: "completed",
    occurred_at: occurred,
    amount: parsed.amount,
    fee: null,
    commission: null,
    currency: "INR",
    customer_name: null,
    customer_mobile: null,
    account_last4: parsed.accountLast4,
    bank_name: parsed.bank,
    beneficiary: parsed.senderOrBeneficiary,
    external_event_id: null,
    external_reference: parsed.reference,
    metadata: {
      direction: parsed.direction,
      availableBalance: parsed.availableBalance,
      providerHint: opts.provider || null,
      instance: opts.instance || null,
    },
    confidence: clampConfidence(confidence),
    ambiguity,
  };
}

function inferPortalEventType(transactionType: string, providerName: string): { type: string; ambiguous: boolean } {
  const haystack = `${transactionType} ${providerName}`.toLowerCase();
  if (/\baeps\b|\bcash withdrawal\b|\bwithdrawal\b/.test(haystack)) return { type: "aeps", ambiguous: false };
  if (/\bdmt\b|\bmoney transfer\b|\bremittance\b/.test(haystack)) return { type: "dmt", ambiguous: false };
  if (/\brecharge\b|\btop[\s-]?up\b|\bdth\b/.test(haystack)) return { type: "recharge", ambiguous: false };
  if (/\bbill\b|\belectricity\b/.test(haystack)) return { type: "bill_payment", ambiguous: false };
  if (/\bcommission\b/.test(haystack)) return { type: "commission", ambiguous: false };
  if (/\bfee\b/.test(haystack)) return { type: "fee", ambiguous: false };
  if (/\bsettlement\b/.test(haystack)) return { type: "settlement", ambiguous: false };
  return { type: "bank_credit", ambiguous: true };
}

/** Normalize one portal transaction item (table row or single receipt). */
export function normalizePortalItem(
  item: {
    externalTransactionId?: string | null;
    transactionType?: string | null;
    amount?: number | null;
    fee?: number | null;
    commission?: number | null;
    status?: string | null;
    customerName?: string | null;
    customerMobile?: string | null;
    occurredAt?: string | null;
    aadhaarLast4?: string | null;
    bank?: string | null;
  },
  providerName: string,
): NormalizedIngestion {
  const inferred = inferPortalEventType(item.transactionType || "", providerName);
  const ambiguity: string[] = [];
  if (inferred.ambiguous) ambiguity.push("event_type_inferred");
  const amount = typeof item.amount === "number" && Number.isFinite(item.amount) ? item.amount : null;
  if (amount === null || amount <= 0) ambiguity.push("amount_invalid");
  if (!item.externalTransactionId) ambiguity.push("external_id_missing");
  const occurred = normalizeLooseDate(item.occurredAt) || item.occurredAt || null;

  let confidence = 0.8;
  if (inferred.ambiguous) confidence -= 0.15;
  if (amount === null || amount <= 0) confidence -= 0.2;
  if (!item.externalTransactionId) confidence -= 0.15;

  return {
    event_type: inferred.type,
    status: String(item.status || "completed"),
    occurred_at: occurred,
    amount,
    fee: typeof item.fee === "number" && Number.isFinite(item.fee) ? item.fee : null,
    commission: typeof item.commission === "number" && Number.isFinite(item.commission) ? item.commission : null,
    currency: "INR",
    customer_name: item.customerName || null,
    customer_mobile: item.customerMobile || null,
    account_last4: null,
    bank_name: item.bank || null,
    beneficiary: item.customerName || null,
    external_event_id: item.externalTransactionId || null,
    external_reference: item.externalTransactionId || null,
    metadata: { providerName, transactionType: item.transactionType || null, aadhaarLast4Present: Boolean(item.aadhaarLast4) },
    confidence: clampConfidence(confidence),
    ambiguity,
  };
}

/** Normalize pasted portal text (table or receipt) into canonical items. */
export function normalizePortalText(
  content: string,
  providerName: string,
): { portalName: string; items: NormalizedIngestion[] } {
  const parsed = parsePortalData(content, providerName || undefined);
  return {
    portalName: parsed.portalName,
    items: parsed.transactions.map((item) => normalizePortalItem(item, parsed.portalName)),
  };
}

export interface ManualUploadInput {
  event_type: string;
  status?: string;
  occurred_at?: string | null;
  amount?: number | null;
  fee?: number | null;
  commission?: number | null;
  currency?: string;
  customer_name?: string | null;
  customer_mobile?: string | null;
  account_last4?: string | null;
  bank_name?: string | null;
  beneficiary?: string | null;
  external_event_id?: string | null;
  external_reference?: string | null;
}

/**
 * Normalize a manually entered event (human-typed, lower baseline confidence).
 * Machine-submitted api_event payloads pass verifiedSource so they are not
 * penalized for being human-typed — they are still fully validated.
 */
export function normalizeManualUpload(
  input: ManualUploadInput,
  opts?: { verifiedSource?: boolean },
): NormalizedIngestion {
  const ambiguity: string[] = opts?.verifiedSource ? [] : ["manual_entry_unverified"];
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const amount = num(input.amount);
  if (amount === null) ambiguity.push("amount_missing");
  const occurred = normalizeLooseDate(input.occurred_at);
  if (input.occurred_at && !occurred) ambiguity.push("date_unparseable");
  if (!input.external_event_id && !input.external_reference) ambiguity.push("external_id_missing");
  return {
    event_type: String(input.event_type || "bank_credit"),
    status: String(input.status || "completed"),
    occurred_at: occurred,
    amount,
    fee: num(input.fee),
    commission: num(input.commission),
    currency: String(input.currency || "INR").toUpperCase().slice(0, 3),
    customer_name: input.customer_name || null,
    customer_mobile: input.customer_mobile || null,
    account_last4: input.account_last4 || null,
    bank_name: input.bank_name || null,
    beneficiary: input.beneficiary || null,
    external_event_id: input.external_event_id || null,
    external_reference: input.external_reference || null,
    metadata: { source: "manual_upload" },
    confidence: clampConfidence(amount === null ? 0.4 : 0.6),
    ambiguity,
  };
}
