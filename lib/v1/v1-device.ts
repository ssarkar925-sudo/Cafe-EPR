/**
 * V1 application-side device identity (foundation for the approved G9 sync
 * protocol; the offline queue itself is a later phase).
 *
 * Two identities exist and must not be confused:
 * - clientUuid: app-generated UUID persisted in localStorage. Identifies this
 *   browser/app install before enrollment. Never sent as a server device id.
 * - serverDeviceId: the devices.id row minted by consume_enrollment_token,
 *   with its device_epoch and last_watermark. All sync RPCs use this id.
 *
 * Uses only the documented G0/G9 contracts (issue/consume_enrollment_token,
 * sync_handshake). No new rules, no queue, no flush/conflict UI.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { callV1Mutation, callV1Read } from "@/lib/v1/v1-rpc";

const LS_CLIENT_UUID = "v1.device.client_uuid";
const LS_SERVER_DEVICE = "v1.device.server";

export interface V1LocalDevice {
  clientUuid: string;
  serverDeviceId: string | null;
  deviceEpoch: number | null;
  lastWatermark: number | null;
  enrolledAt: string | null;
}

export interface V1DeviceStatus {
  serverDeviceId: string;
  deviceEpoch: number;
  lastWatermark: number;
}

function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function readStored(): { clientUuid: string | null; server: V1LocalDevice | null } {
  try {
    const clientUuid = localStorage.getItem(LS_CLIENT_UUID);
    const raw = localStorage.getItem(LS_SERVER_DEVICE);
    return { clientUuid, server: raw ? (JSON.parse(raw) as V1LocalDevice) : null };
  } catch {
    return { clientUuid: null, server: null };
  }
}

/** Stable per-install client UUID (created once, never rotated here). */
export function getOrCreateClientUuid(): string {
  const { clientUuid } = readStored();
  if (clientUuid) return clientUuid;
  const created = newUuid();
  try {
    localStorage.setItem(LS_CLIENT_UUID, created);
  } catch {
    /* storage unavailable: caller still gets a session-scoped id */
  }
  return created;
}

/** Currently enrolled server device, or null when this install is unenrolled. */
export function getEnrolledDevice(): V1LocalDevice | null {
  const { server } = readStored();
  if (!server || !server.serverDeviceId) return null;
  return server;
}

/**
 * Enroll this install: issue a token for the caller's profile, then consume
 * it (single-use, 15-minute expiry enforced server-side). Persists the
 * minted server device id + epoch. Returns the persisted record.
 */
export async function enrollDevice(): Promise<V1LocalDevice> {
  const clientUuid = getOrCreateClientUuid();
  const issued = await callV1Mutation<string>("issue_enrollment_token", {});
  if (issued.error || typeof issued.data !== "string" || issued.data.length === 0) {
    throw new Error(issued.error?.message ?? "Enrollment token issuance failed.");
  }
  const consumed = await callV1Mutation<string>("consume_enrollment_token", {
    p_token: issued.data,
  });
  if (consumed.error || typeof consumed.data !== "string" || consumed.data.length === 0) {
    throw new Error(consumed.error?.message ?? "Enrollment token consumption failed.");
  }
  const record: V1LocalDevice = {
    clientUuid,
    serverDeviceId: consumed.data,
    deviceEpoch: 1,
    lastWatermark: 0,
    enrolledAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(LS_SERVER_DEVICE, JSON.stringify(record));
  } catch {
    /* storage unavailable */
  }
  return record;
}

/** Forget the server device binding on this install (local only). */
export function forgetDevice(): void {
  try {
    localStorage.removeItem(LS_SERVER_DEVICE);
  } catch {
    /* ignore */
  }
}

/**
 * Read-only enrollment liveness check via sync_handshake. Returns the
 * server-reported epoch/watermark and refreshes the local copy.
 */
export async function fetchDeviceStatus(
  client: SupabaseClient,
  serverDeviceId: string,
): Promise<V1DeviceStatus> {
  const res = await callV1Read<{ device_epoch?: number; last_watermark?: number }>(client, "sync_handshake", {
    p_device_id: serverDeviceId,
  });
  if (res.error || !res.data) {
    throw new Error(res.error?.message ?? "Device handshake failed.");
  }
  const status: V1DeviceStatus = {
    serverDeviceId,
    deviceEpoch: typeof res.data.device_epoch === "number" ? res.data.device_epoch : 1,
    lastWatermark: typeof res.data.last_watermark === "number" ? res.data.last_watermark : 0,
  };
  try {
    const { server } = readStored();
    if (server && server.serverDeviceId === serverDeviceId) {
      localStorage.setItem(
        LS_SERVER_DEVICE,
        JSON.stringify({ ...server, deviceEpoch: status.deviceEpoch, lastWatermark: status.lastWatermark }),
      );
    }
  } catch {
    /* ignore */
  }
  return status;
}
