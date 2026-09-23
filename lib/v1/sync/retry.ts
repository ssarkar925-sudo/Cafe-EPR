/**
 * Retry policy — V1 Offline Sync milestone (pure functions only).
 *
 * Approved policy, implemented exactly: after a transient failure the
 * first two retries wait 30 seconds each, then retries wait at most 15
 * minutes, and operations older than 48 hours stop retrying (they become
 * failed for operator review). Semantic rejections are never
 * auto-retried — the caller routes them to conflict instead.
 */

import {
  MAX_OPERATION_AGE_MS,
  RETRY_BASE_MS,
  RETRY_BASE_ROUNDS,
  RETRY_CAP_MS,
  type QueueRecord,
} from "./types";

export function maxAgeExceeded(record: QueueRecord, now: number): boolean {
  return now - record.created_at > MAX_OPERATION_AGE_MS;
}

/** Next retry delay for a transient failure given the attempt count AFTER
 *  incrementing (attempts=1 -> first retry). Rounds 1-2 wait the 30s base;
 *  later rounds wait the 15-minute cap. */
export function retryDelayMs(attempts: number): number {
  if (attempts <= RETRY_BASE_ROUNDS) return RETRY_BASE_MS;
  return RETRY_CAP_MS;
}

export function isRetryDue(record: QueueRecord, now: number): boolean {
  if (record.state !== "failed") return false;
  if (record.last_reason !== null && record.last_reason !== "ERROR") return false;
  if (record.next_retry_at === null) return false;
  if (record.next_retry_at > now) return false;
  return !maxAgeExceeded(record, now);
}
