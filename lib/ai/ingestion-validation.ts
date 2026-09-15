/**
 * Deterministic validation for normalized ingestion events (Phase 6).
 *
 * Pure functions, no I/O. Every rule from the platform contract:
 * amount, date, provider, status, transaction ID, negatives, UTR/RRN,
 * phone, account last4, customer-match and provider-classification confidence.
 * Ambiguous data is routed to review; invalid data is rejected.
 */

import type { NormalizedIngestion } from "@/lib/ai/ingestion-normalizer";
import { isCompletedTransaction } from "@/lib/ai/transaction-import";

export interface ValidationInput {
  event: NormalizedIngestion;
  providerKnown: boolean;
  providerConfidence?: number | null;
  customerMatchConfidence?: number | null;
}

export interface ValidationResult {
  state: "valid" | "needs_review" | "rejected";
  issues: string[];
}

const AMOUNT_REQUIRED = new Set([
  "aeps",
  "dmt",
  "upi",
  "bank_credit",
  "bank_debit",
  "bill_payment",
  "recharge",
  "settlement",
  "commission",
  "fee",
]);

function normalizePhoneDigits(mobile: string | null): string | null {
  if (!mobile) return null;
  const digits = String(mobile).replace(/\D/g, "");
  if (!digits) return null;
  const trimmed = digits.length > 10 && digits.startsWith("91") ? digits.slice(2) : digits;
  return trimmed.length >= 10 && trimmed.length <= 13 ? trimmed : null;
}

export function validateNormalizedEvent(input: ValidationInput): ValidationResult {
  const { event, providerKnown } = input;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!providerKnown) {
    errors.push("unknown_provider");
  }
  if (
    input.providerConfidence !== null &&
    input.providerConfidence !== undefined &&
    input.providerConfidence < 0.5
  ) {
    warnings.push("low_provider_confidence");
  }

  if (!isCompletedTransaction(event.status || "")) {
    errors.push("status_not_completed");
  }

  const requiresAmount = AMOUNT_REQUIRED.has(String(event.event_type || ""));
  if (requiresAmount && (event.amount === null || !(event.amount > 0))) {
    errors.push("amount_invalid");
  }
  for (const [label, value] of [
    ["amount", event.amount],
    ["fee", event.fee],
    ["commission", event.commission],
  ] as const) {
    if (value !== null && value !== undefined && value < 0) {
      errors.push(`${label}_negative_impossible`);
    }
  }

  if (!event.occurred_at) {
    warnings.push("date_missing");
  } else if (Number.isNaN(Date.parse(event.occurred_at))) {
    errors.push("date_invalid");
  }

  if (!event.external_event_id && !event.external_reference) {
    warnings.push("transaction_id_missing");
  }

  const ref = String(event.external_reference || "");
  if (ref && /^\d+$/.test(ref) && ref.length !== 12 && (ref.length < 6 || ref.length > 22)) {
    warnings.push("reference_format_unusual");
  }

  if (event.customer_mobile && !normalizePhoneDigits(event.customer_mobile)) {
    warnings.push("phone_unparseable");
  }

  if (event.account_last4 && !/^[0-9]{4}$/.test(event.account_last4)) {
    errors.push("account_last4_invalid");
  }

  if (
    input.customerMatchConfidence !== null &&
    input.customerMatchConfidence !== undefined &&
    input.customerMatchConfidence < 0.5
  ) {
    warnings.push("low_customer_match_confidence");
  }

  if (event.ambiguity.length > 0) {
    warnings.push(...event.ambiguity.map((flag) => `source_flag:${flag}`));
  }

  if (errors.length > 0) return { state: "rejected", issues: errors };
  if (warnings.length > 0) return { state: "needs_review", issues: warnings };
  return { state: "valid", issues: [] };
}
