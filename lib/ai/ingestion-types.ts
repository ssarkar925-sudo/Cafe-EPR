/**
 * Canonical AI data-ingestion model (Phase 2).
 *
 * One normalized model for every provider: portals, phone notifications, SMS,
 * email, manual uploads, and APIs all feed the same pipeline:
 *
 *   SOURCE -> COLLECT -> NORMALIZE -> VALIDATE -> DEDUPE -> MATCH
 *     -> ERP DRAFT -> APPROVAL -> APPLY
 *
 * These lifecycle states have distinct, honest meanings (Phase 20). Never
 * claim a later state when only an earlier one was reached:
 *   parsed      — raw text was structurally interpreted (nothing verified)
 *   collected   — raw payload accepted into the inbox
 *   validated   — deterministic checks passed
 *   matched     — linked to an ERP entity or customer (or queued for review)
 *   drafted     — an ERP write was proposed, nothing written
 *   approved    — owner explicitly approved the draft
 *   applied     — the approved write was executed by application code
 */

export const INGESTION_SOURCE_TYPES = [
  "portal",
  "phone_notification",
  "sms",
  "email",
  "manual_upload",
  "api",
] as const;
export type IngestionSourceType = (typeof INGESTION_SOURCE_TYPES)[number];

export const INGESTION_EVENT_TYPES = [
  "aeps",
  "dmt",
  "upi",
  "bank_credit",
  "bank_debit",
  "bill_payment",
  "recharge",
  "commission",
  "fee",
  "settlement",
] as const;
export type IngestionEventType = (typeof INGESTION_EVENT_TYPES)[number];

/** Pipeline state of an ingestion event. Monotonic except needs_review loops. */
export const INGESTION_EVENT_STATES = [
  "pending",
  "needs_review",
  "reconciled",
  "duplicate",
  "failed",
] as const;
export type IngestionEventState = (typeof INGESTION_EVENT_STATES)[number];

export const INGESTION_VALIDATION_STATES = [
  "unvalidated",
  "valid",
  "needs_review",
  "rejected",
] as const;
export type IngestionValidationState = (typeof INGESTION_VALIDATION_STATES)[number];

export interface AiIngestionEvent {
  id: string;
  business_id: string;
  source_type: IngestionSourceType;
  source_provider: string;
  source_instance: string | null;
  external_event_id: string | null;
  external_reference: string | null;
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
  metadata: Record<string, unknown>;
  raw_payload: Record<string, unknown> | null;
  content_hash: string;
  confidence: number | null;
  validation_state: IngestionValidationState;
  matched_customer_id: string | null;
  matched_transaction_id: string | null;
  state: IngestionEventState;
  created_at: string;
  processed_at: string | null;
}

export const DRAFT_ACTION_TYPES = [
  "link_customer",
  "reconcile_transaction",
  "record_customer_payment",
  "record_provider_transaction",
  "record_commission",
  "categorize",
  "mark_duplicate",
] as const;
export type DraftActionType = (typeof DRAFT_ACTION_TYPES)[number];

export const DRAFT_STATES = [
  "pending",
  "approved",
  "rejected",
  "applied",
  "failed",
  "superseded",
] as const;
export type DraftState = (typeof DRAFT_STATES)[number];

export const DRAFT_RISK_LEVELS = ["low", "medium", "high"] as const;
export type DraftRiskLevel = (typeof DRAFT_RISK_LEVELS)[number];

export interface AiReconciliationDraft {
  id: string;
  business_id: string;
  source_event_id: string | null;
  action_type: DraftActionType;
  target_entity: string;
  target_id: string | null;
  proposed_payload: Record<string, unknown>;
  evidence: Record<string, unknown>;
  confidence: number | null;
  risk_level: DraftRiskLevel;
  state: DraftState;
  approved_by: string | null;
  approved_at: string | null;
  applied_ref: string | null;
  created_at: string;
}

/** Which lifecycle stage a piece of data has honestly reached (Phase 20). */
export const INGESTION_STAGE_LABELS = [
  "parsed",
  "collected",
  "validated",
  "matched",
  "drafted",
  "approved",
  "applied",
] as const;
export type IngestionStage = (typeof INGESTION_STAGE_LABELS)[number];

/** Actions that move money or mutate the ledger always need owner approval. */
export const HIGH_RISK_DRAFT_ACTIONS: ReadonlySet<DraftActionType> = new Set([
  "record_customer_payment",
  "record_provider_transaction",
  "record_commission",
]);

/** Map a draft action to the existing approval-gate action vocabulary. */
export function draftActionToApprovalAction(action: DraftActionType): string {
  switch (action) {
    case "record_customer_payment":
      return "record_customer_payment";
    case "record_provider_transaction":
    case "record_commission":
      return "write_transaction";
    default:
      return "import_external_transaction";
  }
}
