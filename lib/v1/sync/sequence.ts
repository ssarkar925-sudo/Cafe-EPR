/**
 * Device-local sequence allocation — V1 Offline Sync milestone.
 *
 * Sequences are monotonic per (device, epoch) and persisted, so a browser
 * reload never resets them. New epochs continue ABOVE the server
 * watermark (lower numbers would be DUPLICATE-skipped server-side), so the
 * allocator takes the watermark into account. Server sequences are never
 * fabricated: local seq is a client ordering key; the watermark stays
 * authoritative server-side.
 */

import { getMeta, setMeta } from "./store";
import type { SyncMeta } from "./types";

export async function allocSequence(deviceId: string, epoch: number, watermark: number): Promise<number> {
  const meta: SyncMeta | null = await getMeta(deviceId);
  const floor = Math.max(1, Math.floor(watermark) + 1);
  const next = Math.max(meta && meta.epoch === epoch ? meta.next_seq : floor, floor);
  await setMeta({
    device_id: deviceId,
    epoch,
    watermark: meta?.watermark ?? watermark,
    server_time: meta?.server_time ?? null,
    next_seq: next + 1,
    last_sync_at: meta?.last_sync_at ?? null,
    last_error: meta?.last_error ?? null,
  });
  return next;
}
