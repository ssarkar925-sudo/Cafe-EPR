/**
 * Offline sync types — V1 Offline Sync milestone (no browser APIs here).
 *
 * Mirrors the approved G9 protocol exactly:
 * - outbox identity: client_uuid, idempotency_key, device_id, epoch,
 *   sequence, operation type, payload, state;
 * - states: queued, sent, acknowledged, failed, conflict;
 * - server dispositions from sync_flush item outcomes: applied, duplicate,
 *   gap, stale_epoch, failed (+ conflict rows carrying V1SyncReasonCode);
 * - retry policy: 30s x2, then 15-minute cap, 48-hour maximum age;
 *   semantic rejections are never auto-retried.
 *
 * Nothing here computes money, stock, journals, or canonical numbers.
 * The server is authoritative for timestamps, invoice numbers, FIFO,
 * balances, accounting, and conflicts.
 */

import type { V1SyncReasonCode } from "../v1-contracts";

export type SyncDocType = "sale" | "purchase" | "claim" | "service";

export type QueueState = "queued" | "sent" | "acked" | "failed" | "conflict";

export type FlushOutcome = "applied" | "duplicate" | "gap" | "stale_epoch" | "failed";

export interface QueueRecord {
  id: string;
  client_uuid: string;
  idempotency_key: string;
  device_id: string;
  epoch: number;
  seq: number;
  op_type: SyncDocType;
  payload: Record<string, unknown>;
  provisional_number: string | null;
  state: QueueState;
  attempts: number;
  next_retry_at: number | null;
  last_error: string | null;
  last_reason: V1SyncReasonCode | null;
  server_result: Record<string, unknown> | null;
  server_conflict_id: string | null;
  server_disposition: string | null;
  created_at: number;
  updated_at: number;
}

export interface SyncMeta {
  device_id: string;
  epoch: number;
  watermark: number;
  server_time: string | null;
  next_seq: number;
  last_sync_at: number | null;
  last_error: string | null;
}

export interface FlushItemResult {
  seq: number;
  outcome: FlushOutcome;
  applied: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

export interface FlushSummary {
  applied: number;
  acked: number;
  conflicts: number;
  failed: number;
  watermark: number;
  stopped: string | null;
}

/** Approved retry policy constants (D4). Do not retune without an owner
 *  decision: base 30s x2 attempts, then 15-minute cap, 48-hour max age. */
export const RETRY_BASE_MS = 30_000;
export const RETRY_BASE_ROUNDS = 2;
export const RETRY_CAP_MS = 15 * 60_000;
export const MAX_OPERATION_AGE_MS = 48 * 3600_000;

export const UNSYNCED_LABEL = "UNSYNCED — not final";

/** Provisional display identifier. Never a canonical number: canonical
 *  numbers arrive only in server acknowledgement results. */
export function makeProvisionalNumber(seq: number): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `PROV-${d}-${seq}-${rand}`;
}

/** Extract a canonical display value from a server acknowledgement result
 *  (sale -> invoice_number, service -> transaction_number, else id).
 *  Returns null when the server supplied nothing canonical. */
export function canonicalFromResult(result: Record<string, unknown> | null): string | null {
  if (!result) return null;
  for (const key of ["invoice_number", "transaction_number", "id"]) {
    const value = result[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

/** Semantic rejections are never auto-retried; they become conflicts for
 *  operator/back-office resolution. */
const SEMANTIC_REASONS: ReadonlySet<string> = new Set([
  "VALIDATION",
  "INSUFFICIENT_STOCK",
  "LIMIT_EXCEEDED",
  "TOTAL_MISMATCH",
  "UNKNOWN_INSTRUMENT",
  "EXPIRED_LOT",
]);

export function isSemanticReason(reason: V1SyncReasonCode | string | null): boolean {
  return reason !== null && SEMANTIC_REASONS.has(reason);
}

export type ErrorKind = "transient" | "semantic" | "auth" | "stale" | "fatal";

export function kindForReason(reason: V1SyncReasonCode | string | null): ErrorKind {
  if (reason === "STALE_EPOCH") return "stale";
  if (reason === "AUTH_EXPIRED") return "auth";
  if (isSemanticReason(reason)) return "semantic";
  if (reason === "FORBIDDEN" || reason === "NOT_FOUND") return "semantic";
  return "transient";
}
