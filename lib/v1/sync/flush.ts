/**
 * Ordered flush — V1 Offline Sync milestone.
 *
 * Implements the milestone algorithm against the existing sync_flush RPC:
 * verify session/device, handshake (authoritative epoch + watermark),
 * select the next queued/retryable operations in sequence order, submit
 * through the G9 sync RPC, persist each disposition, and stop at the
 * first blocking outcome. Financial operations are never parallelized
 * and later sequences never pass a blocking failure.
 *
 * Server disposition mapping (per sync_flush item outcomes):
 * - applied   -> acknowledged (server result preserved, incl. canonical
 *                numbers supplied by the document RPCs);
 * - duplicate -> acknowledged as already-applied (G9 replay semantics; no
 *                second mutation is created);
 * - gap       -> conflict (queue retained, nothing skipped or fabricated;
 *                no backfill RPC exists, so the exception stays visible);
 * - stale_epoch -> affected queue marked failed/stale, re-enrollment
 *                required; the epoch is never changed locally;
 * - failed    -> conflict rows are pulled via sync_acknowledge and mapped
 *                by sequence: semantic reasons become conflicts (never
 *                auto-retried), transient ERROR becomes failed with the
 *                approved backoff schedule.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { callV1Mutation, callV1Read } from "../v1-rpc";
import { getEnrolledDevice } from "../v1-device";
import {
  listDeviceRecords,
  markAcknowledged,
  markConflict,
  markFailed,
  markSent,
  setMeta,
  getMeta,
} from "./store";
import { doHandshake } from "./handshake";
import { isRetryDue, maxAgeExceeded, retryDelayMs } from "./retry";
import {
  canonicalFromResult,
  isSemanticReason,
  type FlushItemResult,
  type FlushSummary,
  type QueueRecord,
} from "./types";

/** True when the device has queued or retry-due work (read-only check
 *  for the poll tick; the flush itself re-evaluates eligibility). */
export async function hasSyncWork(deviceId: string, now: number = Date.now()): Promise<boolean> {
  try {
    const rows = await listDeviceRecords(deviceId);
    return rows.some((r) => {
      if (r.state === "queued") return true;
      if (r.state === "failed" && (r.last_reason === "AUTH_EXPIRED" || isRetryDue(r, now))) return true;
      return false;
    });
  } catch {
    return false;
  }
}

export class SyncHalted extends Error {
  readonly haltKind: string;
  constructor(kind: string, message: string) {
    super(message);
    this.haltKind = kind;
  }
}

interface AckConflict {
  id: string;
  seq: number;
  doc_type: string;
  reason: string;
  detail: string | null;
}

async function pullConflicts(client: SupabaseClient, deviceId: string): Promise<{
  epoch: number;
  watermark: number;
  serverTime: string;
  pending: AckConflict[];
}> {
  const res = await callV1Mutation<{
    device_epoch?: number;
    watermark?: number;
    server_time?: string;
    pending_conflicts?: AckConflict[];
  }>("sync_acknowledge", { p_device_id: deviceId });
  if (res.error || !res.data) {
    throw new Error(res.error?.message ?? "Acknowledge failed.");
  }
  return {
    epoch: typeof res.data.device_epoch === "number" ? res.data.device_epoch : 0,
    watermark: typeof res.data.watermark === "number" ? res.data.watermark : 0,
    serverTime: typeof res.data.server_time === "string" ? res.data.server_time : new Date().toISOString(),
    pending: Array.isArray(res.data.pending_conflicts) ? res.data.pending_conflicts : [],
  };
}

function isAuthFailure(message: string): boolean {
  return /not authenticated|authentication|session|expired|jwt|401|anon/i.test(message);
}

export async function flushOutbox(client: SupabaseClient, now: number = Date.now()): Promise<FlushSummary> {
  const device = getEnrolledDevice();
  if (!device || !device.serverDeviceId) {
    throw new SyncHalted("enrollment", "No enrolled device on this browser. Enroll before syncing.");
  }
  const deviceId = device.serverDeviceId;

  let handshake;
  try {
    handshake = await doHandshake(client, deviceId, device.deviceEpoch);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Handshake failed.";
    if (isAuthFailure(message)) {
      throw new SyncHalted("auth", `Authentication required — queue retained. ${message}`);
    }
    throw new SyncHalted("handshake", message);
  }
  if (handshake.stale) {
    const pending = await listDeviceRecords(deviceId);
    for (const r of pending) {
      if (r.state === "queued" || r.state === "failed") {
        await markFailed(r.id, "Device epoch is stale; re-enrollment required. This record can never flush under the old epoch.", "STALE_EPOCH", null, r.attempts);
      }
    }
    throw new SyncHalted("stale-epoch", "Device enrollment is stale. Re-enroll, then review failed operations.");
  }

  const records = (await listDeviceRecords(deviceId, handshake.epoch)).filter((r) => r.seq > handshake.watermark);
  const eligible = records.filter((r) => {
    if (r.state === "queued") return true;
    if (r.state === "failed" && (r.last_reason === "AUTH_EXPIRED" || isRetryDue(r, now))) return true;
    return false;
  });
  // 48h+ records stop retrying and wait for the operator instead.
  for (const r of eligible) {
    if (r.state === "failed" && maxAgeExceeded(r, now)) {
      await markFailed(r.id, "Maximum operation age (48h) exceeded. Operator review required.", r.last_reason, null, r.attempts);
    }
  }
  const batch = eligible
    .filter((r) => r.state === "queued" || (r.state === "failed" && !maxAgeExceeded(r, now)))
    .sort((a, b) => a.seq - b.seq)
    .slice(0, 50);
  if (batch.length === 0) {
    return { applied: 0, acked: 0, conflicts: 0, failed: 0, watermark: handshake.watermark, stopped: null };
  }

  for (const item of batch) await markSent(item.id);
  const flushRes = await callV1Mutation<{
    applied?: number;
    watermark?: number;
    results?: FlushItemResult[];
  }>("sync_flush", {
    p_device_id: deviceId,
    p_items: batch.map((r) => ({
      seq: r.seq,
      device_epoch: r.epoch,
      client_uuid: r.client_uuid,
      idempotency_key: r.idempotency_key,
      doc_type: r.op_type,
      payload: r.payload,
    })),
  });
  if (flushRes.error || !flushRes.data) {
    const message = flushRes.error?.message ?? "Flush failed.";
    for (const item of batch) {
      await markFailed(item.id, message, null, now + retryDelayMs(item.attempts + 1), item.attempts + 1);
    }
    if (isAuthFailure(message)) {
      throw new SyncHalted("auth", `Authentication required — queue retained. ${message}`);
    }
    throw new SyncHalted("transport", message);
  }

  const summary: FlushSummary = {
    applied: 0,
    acked: 0,
    conflicts: 0,
    failed: 0,
    watermark: typeof flushRes.data.watermark === "number" ? flushRes.data.watermark : handshake.watermark,
    stopped: null,
  };
  const bySeq = new Map(batch.map((r) => [r.seq, r]));
  const seen = new Set<number>();
  for (const result of flushRes.data.results ?? []) {
    const record = bySeq.get(result.seq);
    if (!record) continue;
    seen.add(result.seq);
    if (result.outcome === "applied") {
      const serverResult = (result.result ?? null) as Record<string, unknown> | null;
      const canonical = canonicalFromResult(serverResult);
      await markAcknowledged(
        record.id,
        serverResult,
        canonical ? `Acknowledged; canonical ${canonical}.` : "Acknowledged.",
      );
      summary.applied += 1;
      summary.acked += 1;
    } else if (result.outcome === "duplicate") {
      await markAcknowledged(record.id, null, "Already applied server-side (DUPLICATE replay; nothing re-executed).");
      summary.acked += 1;
    } else if (result.outcome === "gap") {
      await markConflict(record.id, "GAP", "Sequence gap: an earlier operation is missing. Queue retained; nothing skipped or fabricated.", null);
      summary.conflicts += 1;
      summary.stopped = "gap";
    } else if (result.outcome === "stale_epoch") {
      await markFailed(record.id, "Device epoch is stale; re-enrollment required.", "STALE_EPOCH", null, record.attempts);
      summary.failed += 1;
      summary.stopped = "stale-epoch";
      throw new SyncHalted("stale-epoch", "Device enrollment is stale. Re-enroll, then review failed operations.");
    } else {
      await markFailed(record.id, result.error ?? "Server rejected the operation.", null, null, record.attempts);
      summary.failed += 1;
      summary.stopped = summary.stopped ?? "failed";
    }
  }
  // Items sent but absent from the response were not processed: requeue.
  for (const item of batch) {
    if (!seen.has(item.seq)) {
      const current = (await listDeviceRecords(deviceId)).find((r) => r.id === item.id);
      if (current && current.state === "sent") {
        await markFailed(item.id, "No server disposition received; requeued.", null, now + retryDelayMs(item.attempts + 1), item.attempts + 1);
        summary.failed += 1;
      }
    }
  }

  // Pull server conflict rows (semantic reasons live there) and mirror them.
  const ack = await pullConflicts(client, deviceId);
  const meta = await getMeta(deviceId);
  await setMeta({
    device_id: deviceId,
    epoch: ack.epoch,
    watermark: ack.watermark,
    server_time: ack.serverTime,
    next_seq: meta?.next_seq ?? ack.watermark + 1,
    last_sync_at: now,
    last_error: summary.stopped ? `Stopped: ${summary.stopped}.` : null,
  });
  summary.watermark = ack.watermark;
  const localBySeq = new Map((await listDeviceRecords(deviceId)).map((r) => [r.seq, r]));
  for (const conflict of ack.pending) {
    const local = localBySeq.get(conflict.seq);
    if (!local || local.state === "acked") continue;
    const reason = conflict.reason as QueueRecord["last_reason"];
    if (isSemanticReason(reason) || reason === "FORBIDDEN" || reason === "NOT_FOUND") {
      await markConflict(local.id, reason, conflict.detail ?? `Server ${conflict.reason}.`, conflict.id);
      summary.conflicts += 1;
    } else if (reason === "STALE_EPOCH") {
      await markFailed(local.id, "Device epoch is stale; re-enrollment required.", reason, null, local.attempts);
      summary.failed += 1;
      summary.stopped = "stale-epoch";
    } else if (reason === "AUTH_EXPIRED") {
      await markFailed(local.id, "Authentication expired; queue paused.", reason, null, local.attempts);
      summary.failed += 1;
      summary.stopped = "auth";
    } else if (reason === "DUPLICATE") {
      await markAcknowledged(local.id, null, "Already applied server-side (DUPLICATE replay; nothing re-executed).");
      summary.acked += 1;
    } else if (reason === "GAP") {
      await markConflict(local.id, reason, conflict.detail ?? "Sequence gap.", conflict.id);
      summary.conflicts += 1;
      summary.stopped = "gap";
    } else {
      await markFailed(
        local.id,
        conflict.detail ?? "Transient server error.",
        "ERROR",
        now + retryDelayMs(local.attempts + 1),
        local.attempts + 1,
      );
      summary.failed += 1;
    }
  }
  return summary;
}
