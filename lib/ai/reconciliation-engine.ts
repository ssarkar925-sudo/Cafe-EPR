/**
 * ERP reconciliation engine for normalized ingestion events (Phase 9).
 *
 * Pure and dependency-free: matches an external event against ERP snapshot
 * rows (transactions, invoices, payments, customers, settlements, cash
 * entries) supplied by the caller. Never touches the database itself.
 *
 * Verdicts: exact_match | probable_match | duplicate | missing_in_erp |
 * conflict | needs_review. Candidate suggestions propose ERP DRAFTS only —
 * the engine never writes anything.
 */

import type { DraftActionType } from "@/lib/ai/ingestion-types";

export type ReconciliationVerdict =
  | "exact_match"
  | "probable_match"
  | "duplicate"
  | "missing_in_erp"
  | "conflict"
  | "needs_review";

export interface ErpSnapshotRow {
  id: string;
  kind: "transaction" | "invoice" | "payment" | "settlement" | "cash_entry";
  reference?: string | null;
  externalId?: string | null;
  amount?: number | null;
  occurredAt?: string | null;
  status?: string | null;
  customerId?: string | null;
  customerDue?: number | null;
  provider?: string | null;
  contentHash?: string | null;
}

export interface ReconciliationSuggestion {
  action: DraftActionType;
  targetEntity: string;
  targetId: string | null;
  reason: string;
}

export interface ReconciliationResult {
  verdict: ReconciliationVerdict;
  confidence: number;
  evidence: Record<string, unknown>;
  matchedRowId: string | null;
  suggestion: ReconciliationSuggestion | null;
}

function normRef(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function sameDay(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return String(a).slice(0, 10) === String(b).slice(0, 10);
}

function amountsEqual(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return Math.abs(Number(a) - Number(b)) < 0.01;
}

export interface ReconciliationInput {
  provider: string;
  eventType: string;
  externalReference: string | null;
  externalEventId: string | null;
  amount: number | null;
  occurredAt: string | null;
  status: string;
  contentHash: string;
  customerId: string | null;
  customerDue?: number | null;
  existingEventIds?: string[];
}

export function reconcileEvent(
  input: ReconciliationInput,
  erpRows: ErpSnapshotRow[],
): ReconciliationResult {
  const rows = Array.isArray(erpRows) ? erpRows : [];
  const ref = normRef(input.externalReference || input.externalEventId);
  const noEvidence = {
    provider: input.provider,
    eventType: input.eventType,
    reference: ref || null,
    amount: input.amount,
  };

  if ((input.existingEventIds || []).length > 0) {
    return {
      verdict: "duplicate",
      confidence: 1.0,
      evidence: { ...noEvidence, reason: "event_already_in_inbox" },
      matchedRowId: null,
      suggestion: null,
    };
  }

  if (ref) {
    const refHits = rows.filter((r) => normRef(r.reference) === ref || normRef(r.externalId) === ref);
    if (refHits.length > 0) {
      const amountMatch = refHits.find((r) => amountsEqual(r.amount, input.amount));
      if (amountMatch) {
        return {
          verdict: "exact_match",
          confidence: 0.95,
          evidence: { ...noEvidence, matchedRow: amountMatch.id, matchedKind: amountMatch.kind },
          matchedRowId: amountMatch.id,
          suggestion: null,
        };
      }
      return {
        verdict: "conflict",
        confidence: 0.7,
        evidence: { ...noEvidence, matchedRow: refHits[0].id, rowAmount: refHits[0].amount },
        matchedRowId: refHits[0].id,
        suggestion: null,
      };
    }
  }

  const probables = rows.filter(
    (r) =>
      amountsEqual(r.amount, input.amount) &&
      sameDay(r.occurredAt, input.occurredAt) &&
      (!input.provider || !r.provider || r.provider.toLowerCase() === input.provider.toLowerCase()),
  );
  if (probables.length === 1) {
    const row = probables[0];
    const suggestion: ReconciliationSuggestion | null =
      input.eventType === "commission"
        ? { action: "record_commission", targetEntity: "transactions", targetId: row.id, reason: "commission_matches_provider_transaction" }
        : row.kind === "invoice" && (input.eventType === "bank_credit" || input.eventType === "upi")
          ? { action: "record_customer_payment", targetEntity: "invoices", targetId: row.id, reason: "bank_credit_matches_open_invoice" }
          : { action: "reconcile_transaction", targetEntity: row.kind === "invoice" ? "invoices" : "transactions", targetId: row.id, reason: "amount_date_provider_match" };
    return {
      verdict: "probable_match",
      confidence: 0.7,
      evidence: { ...noEvidence, matchedRow: row.id, matchedKind: row.kind },
      matchedRowId: row.id,
      suggestion,
    };
  }
  if (probables.length > 1) {
    return {
      verdict: "needs_review",
      confidence: 0.5,
      evidence: { ...noEvidence, candidateRows: probables.map((r) => r.id) },
      matchedRowId: null,
      suggestion: null,
    };
  }

  if (
    (input.eventType === "bank_credit" || input.eventType === "upi") &&
    input.amount !== null &&
    input.amount > 0
  ) {
    return {
      verdict: "missing_in_erp",
      confidence: 0.6,
      evidence: { ...noEvidence, candidateAction: "record_customer_payment" },
      matchedRowId: null,
      suggestion: {
        action: "record_customer_payment",
        targetEntity: "customers",
        targetId: input.customerId,
        reason: "unmatched_bank_credit_may_settle_customer_due",
      },
    };
  }

  return {
    verdict: "missing_in_erp",
    confidence: 0.6,
    evidence: noEvidence,
    matchedRowId: null,
    suggestion: null,
  };
}
