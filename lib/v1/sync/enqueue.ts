/**
 * Operation enqueue — V1 Offline Sync milestone.
 *
 * Builds a queue record with the full G9 identity (fresh client_uuid per
 * business occurrence, caller idempotency key, device, epoch, monotonic
 * sequence) and persists it to the IndexedDB outbox. Payloads reuse the
 * exact document shapes the corresponding online RPCs accept
 * (sale/purchase/claim/service per sync_flush); nothing is invented here.
 */

import { enqueue as persist, getMeta } from "./store";
import { allocSequence } from "./sequence";
import { makeProvisionalNumber, type QueueRecord, type SyncDocType } from "./types";

function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export async function enqueueOperation(args: {
  deviceId: string;
  epoch: number;
  op_type: SyncDocType;
  payload: Record<string, unknown>;
  idempotency_key: string;
  provisional_number?: string | null;
}): Promise<QueueRecord> {
  const meta = await getMeta(args.deviceId);
  const watermark = meta?.watermark ?? 0;
  const seq = await allocSequence(args.deviceId, args.epoch, watermark);
  const now = Date.now();
  const provisional = args.provisional_number ?? makeProvisionalNumber(seq);
  // Sale payloads carry the display provisional so the server links the
  // same identifier (create_sale stores it as provisional_number); the
  // canonical number still arrives only via acknowledgement.
  const payload =
    args.op_type === "sale"
      ? { ...args.payload, provisional_number: provisional }
      : { ...args.payload };
  return persist({
    id: newUuid(),
    client_uuid: newUuid(),
    idempotency_key: args.idempotency_key,
    device_id: args.deviceId,
    epoch: args.epoch,
    seq,
    op_type: args.op_type,
    payload,
    provisional_number: provisional,
    state: "queued",
    attempts: 0,
    next_retry_at: null,
    last_error: null,
    last_reason: null,
    server_result: null,
    server_conflict_id: null,
    server_disposition: null,
    created_at: now,
    updated_at: now,
  });
}
