/**
 * V1 greenfield contracts — CyberCafe & Digital Services ERP.
 *
 * Every name, parameter, and status value below is taken from the gated
 * G0–G15 baseline (`greenfield/migrations/V1_001`–`V1_014`). Nothing here
 * invents database behavior: the server/database remains authoritative for
 * totals, balances, FIFO, dates, canonical numbers, permissions, approval
 * validity, period locks, accounting, and sync watermarks.
 *
 * UI authorization must MIRROR these contracts. Hiding UI is never security:
 * every mutation must still expect backend denial (RLS deny-default,
 * RPC-only writes, REVOKE PUBLIC).
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// ---------------------------------------------------------------------------
// Roles & identity (V1_001 profiles: role CHECK, user_id → auth.users)
// ---------------------------------------------------------------------------

export type V1Role = "admin" | "manager" | "staff" | "cashier";

export const V1_ROLES: readonly V1Role[] = ["admin", "manager", "staff", "cashier"];

/** Back-office = admin/manager (matches is_back_office()). */
export const V1_BACK_OFFICE_ROLES: readonly V1Role[] = ["admin", "manager"];

export function isV1Role(value: unknown): value is V1Role {
  return typeof value === "string" && (V1_ROLES as readonly string[]).includes(value);
}

export function isV1BackOffice(role: V1Role | null): boolean {
  return role !== null && (V1_BACK_OFFICE_ROLES as readonly string[]).includes(role);
}

/** V1 profile row (tenant-scoped; looked up by user_id, never by id). */
export interface V1Profile {
  id: string;
  user_id: string;
  tenant_id: string;
  display_name: string;
  role: V1Role;
  is_active: boolean;
}

/** Server-resolved session context for V1 screens. Mirror only. */
export interface V1SessionContext {
  userId: string;
  profile: V1Profile;
  role: V1Role;
  tenantId: string;
  isActive: boolean;
  isAdmin: boolean;
  isBackOffice: boolean;
}

/** Enrolled device identity (offline/sync phases consume this). */
export interface V1Device {
  id: string;
  tenant_id: string;
  owner_profile_id: string;
  device_epoch: number;
  last_watermark: number;
  status: "active" | "revoked";
}

// ---------------------------------------------------------------------------
// RPC envelope
// ---------------------------------------------------------------------------

export interface V1RpcError {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

export type V1RpcResult<T> = { data: T; error: null } | { data: null; error: V1RpcError };

// ---------------------------------------------------------------------------
// Lifecycle / status unions (CHECK constraints in V1_001–V1_015)
// ---------------------------------------------------------------------------

export type V1InvoiceStatus =
  | "draft"
  | "offline_created"
  | "queued"
  | "server_validated"
  | "posted"
  | "failed"
  | "reversed"
  | "cancelled";

export type V1ClaimState = "recorded" | "recognized";
export type V1ClaimMethod = "cash" | "upi" | "card" | "wallet" | "credit";
export type V1ServiceTxnStatus = "recorded" | "reversed" | "cancelled";
export type V1ServiceType = "aeps" | "dmt" | "upi" | "recharge" | "bbps";
export type V1InstrumentType =
  | "cash"
  | "bank"
  | "upi_qr"
  | "wallet"
  | "card"
  | "aeps_portal"
  | "dmt_portal";
export type V1LotStatus = "open" | "exhausted" | "quarantined" | "expired";
export type V1ReservationStatus = "active" | "released" | "consumed" | "expired";
export type V1AdjustmentType = "damage" | "expiry" | "count" | "other";
export type V1ApprovalStatus = "pending" | "consumed" | "rejected";
export type V1DayCloseStatus = "open" | "variance_pending" | "locked";
export type V1JournalOrigin = "live" | "back_entry" | "opening";
export type V1JournalSourceType =
  | "sale"
  | "return"
  | "purchase"
  | "payment"
  | "service"
  | "adjustment"
  | "settlement"
  | "opening"
  | "reversal"
  | "variance";
export type V1BackEntryBatchStatus = "posted" | "voided";
export type V1BackEntryLineType = "purchase" | "sale" | "payment" | "adjustment" | "opening_balance";
export type V1SuspenseStatus = "parked" | "resolved" | "excluded";
export type V1ConflictDisposition = "pending" | "resolved" | "discarded";
export type V1SyncReasonCode =
  | "VALIDATION"
  | "INSUFFICIENT_STOCK"
  | "LIMIT_EXCEEDED"
  | "TOTAL_MISMATCH"
  | "UNKNOWN_INSTRUMENT"
  | "EXPIRED_LOT"
  | "DUPLICATE"
  | "GAP"
  | "AUTH_EXPIRED"
  | "STALE_EPOCH"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ERROR";

// ---------------------------------------------------------------------------
// Document line shapes (jsonb payloads; keys verified in migration bodies)
// ---------------------------------------------------------------------------

/** Sale line keys read by create_sale: product_id, qty, rate. */
export interface V1SaleLine {
  product_id: string;
  qty: number;
  rate: number;
}

/** Purchase line keys read by create_purchase. */
export interface V1PurchaseLine {
  product_id: string;
  qty: number;
  unit_cost: number;
  expiry_date?: string;
  received_at?: string;
}

/** Journal line keys read by post_journal: account_code, debit, credit. */
export interface V1JournalLine {
  account_code: string;
  debit: number;
  credit: number;
}

/** Day-count item keys read by record_day_counts: instrument_id, counted. */
export interface V1DayCountItem {
  instrument_id: string;
  counted: number;
}

/** Dormant GST flags threaded through sale/purchase/edit (V1_012, optional). */
export interface V1DormantTaxFlags {
  p_supply_type?: string | null;
  p_b2b_or_b2c?: string | null;
  p_place_of_supply?: string | null;
}

// ---------------------------------------------------------------------------
// Per-RPC params (exact names from V1_001–V1_014 signatures)
// ---------------------------------------------------------------------------

// G0
export interface V1ConsumeEnrollmentParams { p_token: string; p_prior_device_id?: string | null }
export interface V1RevokeDeviceParams { p_device_id: string }

// G1
export interface V1CustomerUpsertParams {
  p_id: string | null; p_name: string; p_phone: string | null;
  p_credit_limit: number | null; p_is_active: boolean;
}
export interface V1SupplierUpsertParams {
  p_id: string | null; p_name: string; p_phone: string | null; p_is_active: boolean;
}
export interface V1ProductUpsertParams {
  p_id: string | null; p_name: string; p_sku: string | null; p_barcode: string | null;
  p_unit: string | null; p_sale_price: number | null; p_cost_price: number | null;
  p_hsn_code: string | null; p_is_active: boolean;
}
export interface V1InstrumentUpsertParams {
  p_id: string | null; p_name: string; p_itype: V1InstrumentType; p_is_active: boolean;
}
export interface V1CoaHeadUpdateParams { p_id: string; p_name: string; p_is_active: boolean }

// G2
export interface V1IntakeParams { p_supplier_id: string; p_lines: JsonValue }
export interface V1ReserveParams {
  p_lot_id: string; p_qty: number; p_device_id: string;
  p_document_ref: string; p_hold_hours?: number;
}
export interface V1ReleaseReservationParams { p_reservation_id: string; p_reason: string }
export interface V1AdjustParams {
  p_lot_id: string; p_qty_delta: number; p_adj_type: V1AdjustmentType; p_reason: string;
}
export interface V1QuarantineParams { p_lot_id: string; p_reason: string }
export interface V1ReopenParams { p_lot_id: string; p_reason: string }

// G3
export interface V1CreatePurchaseParams extends V1DormantTaxFlags {
  p_supplier_id: string; p_purchase_date: string; p_lines: V1PurchaseLine[];
  p_idempotency_key?: string | null;
}
export interface V1CreateSaleParams extends V1DormantTaxFlags {
  p_customer_id: string | null; p_invoice_date: string; p_lines: V1SaleLine[];
  p_discount?: number; p_approver_profile_id?: string | null;
  p_provisional_number?: string | null; p_idempotency_key?: string | null;
}
export interface V1CancelInvoiceParams { p_invoice_id: string; p_idempotency_key?: string | null }
export interface V1EditInvoiceParams extends V1DormantTaxFlags {
  p_old_invoice_id: string; p_customer_id: string | null; p_invoice_date: string;
  p_lines: V1SaleLine[]; p_discount?: number; p_approver_profile_id?: string | null;
  p_idempotency_key?: string | null;
}
export interface V1IdempotencyKeyParams { p_scope: string; p_key: string }

// G4
export interface V1RecordClaimParams {
  p_customer_id: string | null; p_invoice_id: string | null; p_method: V1ClaimMethod;
  p_amount: number; p_instrument_id: string | null; p_idempotency_key?: string | null;
}
export interface V1AllocateClaimParams {
  p_claim_id: string; p_method: V1ClaimMethod; p_amount: number;
  p_instrument_id: string | null;
}
export interface V1RecognizeClaimParams { p_claim_id: string; p_idempotency_key?: string | null }

// G5
export interface V1RecordServiceParams {
  p_service_type: V1ServiceType; p_transaction_date: string; p_amount: number;
  p_fee?: number; p_commission?: number; p_details?: Record<string, JsonValue>;
  p_collect_method?: V1ClaimMethod | null; p_collect_instrument_id?: string | null;
  p_idempotency_key?: string | null;
}
export interface V1ReverseServiceParams { p_service_id: string; p_idempotency_key?: string | null }

// G6
export interface V1PostJournalParams {
  p_entry_date: string; p_source_type: V1JournalSourceType; p_source_id: string;
  p_description: string; p_lines: V1JournalLine[]; p_origin?: V1JournalOrigin;
}
export interface V1ReverseJournalParams { p_entry_id: string; p_idempotency_key?: string | null }
export interface V1SetInstrumentAccountParams { p_instrument_id: string; p_account_code: string }

// G7
export interface V1AppendAuditParams {
  p_action: string; p_entity: string; p_entity_id: string; p_description: string;
  p_details: Record<string, JsonValue>; p_device_id?: string | null;
}
export interface V1RequestApprovalParams {
  p_scope_hash: string; p_entity_type: string; p_entity_id: string | null;
  p_action: string; p_details: Record<string, JsonValue>; p_reason: string;
}
export interface V1ApproveOverrideParams { p_approval_id: string }
export interface V1RejectApprovalParams { p_approval_id: string; p_reason: string }

// G8
export interface V1OpenDayCloseParams { p_business_date: string }
export interface V1RecordDayCountsParams {
  p_close_id: string; p_counts: V1DayCountItem[]; p_idempotency_key?: string | null;
}
export interface V1DayCloseIdParams { p_close_id: string; p_idempotency_key?: string | null }
export interface V1ApproveDayCloseParams {
  p_close_id: string; p_reason: string; p_idempotency_key?: string | null;
}

// G9
export interface V1SyncDeviceParams { p_device_id: string }
export interface V1SyncFlushParams { p_device_id: string; p_items: JsonValue }
export interface V1ResolveConflictParams {
  p_conflict_id: string; p_disposition: string; p_note: string;
}

// G10
export interface V1LegalHoldParams {
  p_entity_type: string; p_entity_id: string | null; p_entity_key: string; p_reason: string;
}
export interface V1RunPurgeParams { p_dry_run?: boolean }

// G15 Returns / Refunds
export type V1ReturnStatus = "requested" | "approved" | "posted" | "rejected" | "cancelled";
export type V1ReturnDisposition = "sellable" | "damaged";
export type V1RefundMethod = "khata_credit" | "cash";
export interface V1ReturnLineInput {
  invoice_line_id: string;
  qty: number;
  disposition: V1ReturnDisposition;
  reason: string;
}
export interface V1RequestReturnParams {
  p_invoice_id: string;
  p_lines: V1ReturnLineInput[];
  p_refund_method: V1RefundMethod;
  p_refund_instrument_id?: string | null;
  p_scope_hash: string;
  p_reason: string;
  p_idempotency_key?: string | null;
}
export interface V1ExecuteReturnParams { p_return_id: string; p_idempotency_key?: string | null }
export interface V1CancelReturnParams { p_return_id: string; p_reason: string; p_idempotency_key?: string | null }

// G12
export interface V1AcquireBackEntryLockParams { p_reason: string }
export interface V1SubmitBackEntryBatchParams {
  p_batch_key: string; p_reason: string; p_lines: JsonValue;
}
export interface V1VoidBackEntryBatchParams { p_batch_id: string }
export interface V1ResolveSuspenseParams { p_suspense_id: string; p_outcome: string; p_note: string }

// ---------------------------------------------------------------------------
// Read-row shapes (subset of columns the application displays)
// ---------------------------------------------------------------------------

export interface V1ProductRow {
  id: string; name: string; sku: string | null; barcode: string | null;
  unit: string; sale_price: number; cost_price: number | null;
  hsn_code: string | null; is_active: boolean;
}

export interface V1StockLotRow {
  id: string; product_id: string; qty_remaining: number; unit_cost: number;
  received_at: string; expiry_date: string; status: V1LotStatus; source_ref: string | null;
}

export interface V1InvoiceRow {
  id: string; customer_id: string | null; provisional_number: string | null;
  canonical_number: string; invoice_date: string; subtotal: number; discount: number;
  total: number; approver_profile_id: string | null; status: V1InvoiceStatus;
}

export interface V1ClaimRow {
  id: string; customer_id: string | null; invoice_id: string | null;
  method: V1ClaimMethod; amount: number; instrument_id: string | null;
  claim_state: V1ClaimState;
}

export interface V1ApprovalRow {
  id: string; scope_hash: string; entity_type: string; entity_id: string | null;
  action: string; status: V1ApprovalStatus;
}

export interface V1FifoAllocation { lot_id: string; qty: number; unit_cost: number }

export interface V1StuckHold {
  reservation_id: string; lot_id: string; qty: number;
  hold_expires_at: string; age_hours: number;
}
