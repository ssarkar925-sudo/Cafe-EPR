"use client";

/**
 * Compact sync status badge — V1 Offline Sync milestone.
 *
 * Textual states only (never vague color dots alone): ONLINE, SYNCING,
 * OFFLINE — QUEUED, SYNC ERROR, CONFLICT, RE-ENROLLMENT REQUIRED,
 * AUTHENTICATION REQUIRED, NOT ENROLLED. Reads the sync context; it
 * performs no RPCs itself, so it stays safe to embed in the V1 shell.
 */

import { useV1Sync } from "./v1-sync-provider";

export function syncTextFor(state: {
  online: boolean;
  syncState: string;
  counts: { queued: number; failed: number; conflict: number };
  needsReenroll: boolean;
  deviceId: string | null;
}): string {
  if (!state.deviceId) return "NOT ENROLLED";
  if (state.syncState === "syncing") return "SYNCING";
  if (state.needsReenroll || state.syncState === "stale-epoch") return "RE-ENROLLMENT REQUIRED";
  if (state.syncState === "paused-auth") return "AUTHENTICATION REQUIRED";
  if (state.counts.conflict > 0) return "CONFLICT";
  if (state.syncState === "error" || state.counts.failed > 0) return "SYNC ERROR";
  if (!state.online && state.counts.queued > 0) return "OFFLINE — QUEUED";
  if (!state.online) return "OFFLINE";
  if (state.counts.queued > 0) return "PENDING SYNC";
  return "ONLINE";
}

export default function V1SyncStatus() {
  const sync = useV1Sync();
  const text = syncTextFor(sync);
  const pending = sync.counts.queued + sync.counts.failed + sync.counts.conflict;
  return (
    <span
      role="status"
      aria-label={`Sync status: ${text}`}
      title={sync.lastError ?? text}
      className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-bold dark:bg-white/10"
    >
      {text}
      {pending > 0 ? ` · ${pending}` : ""}
    </span>
  );
}
