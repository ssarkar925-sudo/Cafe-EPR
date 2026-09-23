/**
 * G9 handshake — V1 Offline Sync milestone.
 *
 * Calls sync_handshake through the V1 read wrapper (RLS applies; the
 * device must be active and owned by the caller or back-office visible).
 * The server response is authoritative for epoch, watermark, and device
 * state. Local metadata is updated but local state is never advanced
 * beyond what the server reports: an epoch mismatch marks the queue
 * stale (re-enrollment required), and revoked/unknown devices or expired
 * authentication surface as explicit states instead of silent failures.
 * Devices are never queried or mutated directly from the browser.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { callV1Read } from "../v1-rpc";
import { getMeta, setMeta } from "./store";

export interface HandshakeResult {
  device_id: string;
  epoch: number;
  watermark: number;
  server_time: string;
  stale: boolean;
}

function classifyHandshakeError(message: string): "revoked" | "auth" | "fatal" {
  if (/not active|not found|not authorized|tenant/i.test(message)) return "revoked";
  if (/auth|session|expired|jwt|401|403/i.test(message)) return "auth";
  return "fatal";
}

export async function doHandshake(
  client: SupabaseClient,
  deviceId: string,
  localEpoch: number | null,
): Promise<HandshakeResult> {
  const res = await callV1Read<{ device_epoch?: number; server_watermark?: number; server_time?: string }>(
    client,
    "sync_handshake",
    { p_device_id: deviceId },
  );
  if (res.error || !res.data) {
    const kind = classifyHandshakeError(res.error?.message ?? "");
    const err = new Error(res.error?.message ?? "Handshake failed.");
    (err as { handshakeKind?: string }).handshakeKind = kind;
    throw err;
  }
  const epoch = typeof res.data.device_epoch === "number" ? res.data.device_epoch : 0;
  const watermark = typeof res.data.server_watermark === "number" ? res.data.server_watermark : 0;
  const serverTime = typeof res.data.server_time === "string" ? res.data.server_time : new Date().toISOString();
  const meta = await getMeta(deviceId);
  await setMeta({
    device_id: deviceId,
    epoch,
    watermark,
    server_time: serverTime,
    next_seq: meta?.next_seq ?? watermark + 1,
    last_sync_at: meta?.last_sync_at ?? null,
    last_error: meta?.last_error ?? null,
  });
  return {
    device_id: deviceId,
    epoch,
    watermark,
    server_time: serverTime,
    stale: localEpoch !== null && localEpoch !== epoch,
  };
}

export function handshakeKindOf(error: unknown): string | null {
  if (error && typeof error === "object" && "handshakeKind" in error) {
    return String((error as { handshakeKind: unknown }).handshakeKind);
  }
  return null;
}
