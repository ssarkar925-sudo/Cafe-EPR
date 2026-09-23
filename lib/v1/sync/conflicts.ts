/**
 * Conflict view + server resolution — V1 Offline Sync milestone.
 *
 * Conflicts are never resolved locally: financial truth wins server-side
 * through resolve_conflict (back-office authorization enforced by the
 * RPC). This module lists local conflict records, reads the server
 * pending-conflict queue for dispositions, and records the server's
 * decision locally. A 'resolved' server disposition closes the local
 * record as acknowledged (the operator handled it, e.g. via a corrected
 * submission); 'discarded' closes it as failed so the dropped work stays
 * visible instead of vanishing.
 */

import { callV1Mutation } from "../v1-rpc";
import { listByState, listDeviceRecords, markAcknowledged, markFailed } from "./store";
import type { QueueRecord } from "./types";

export interface ConflictView {
  record: QueueRecord;
  serverId: string | null;
  serverReason: string | null;
  serverDetail: string | null;
}

export async function listConflicts(deviceId?: string): Promise<ConflictView[]> {
  const rows = deviceId
    ? (await listDeviceRecords(deviceId)).filter((r) => r.state === "conflict")
    : await listByState("conflict");
  return rows
    .sort((a, b) => a.seq - b.seq)
    .map((record) => ({
      record,
      serverId: record.server_conflict_id,
      serverReason: record.last_reason,
      serverDetail: record.last_error,
    }));
}

export async function listFailed(deviceId?: string): Promise<QueueRecord[]> {
  const rows = deviceId
    ? (await listDeviceRecords(deviceId)).filter((r) => r.state === "failed")
    : await listByState("failed");
  return rows.sort((a, b) => a.seq - b.seq);
}

/** Resolve through the server RPC only (proxy mutation; no client needed).
 *  Returns the server disposition. */
export async function resolveConflict(
  localId: string,
  serverConflictId: string,
  disposition: "resolved" | "discarded",
  note: string,
): Promise<string> {
  const res = await callV1Mutation<{ disposition?: string }>("resolve_conflict", {
    p_conflict_id: serverConflictId,
    p_disposition: disposition,
    p_note: note,
  });
  if (res.error || !res.data) {
    throw new Error(res.error?.message ?? "Conflict resolution failed.");
  }
  const decided = typeof res.data.disposition === "string" ? res.data.disposition : disposition;
  if (decided === "resolved") {
    await markAcknowledged(localId, null, `Server marked resolved${note ? `: ${note}` : ""}.`);
  } else {
    await markFailed(localId, `Server discarded the operation${note ? `: ${note}` : ""}.`, null, null, 0);
  }
  return decided;
}
