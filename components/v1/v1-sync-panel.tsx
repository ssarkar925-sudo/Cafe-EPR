"use client";

/**
 * Full sync panel + queue/conflict lists — V1 Offline Sync milestone.
 *
 * Display only: counts, device/epoch/watermark, last sync/error, manual
 * sync, and links to the exception views. Conflict resolution and
 * retry/discard actions call the sync library (server RPCs for
 * resolution; local state transitions for retry/discard of terminal
 * records the operator has reviewed). No financial logic lives here.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useV1Session } from "./v1-session-provider";
import { useV1Sync } from "./v1-sync-provider";
import { syncTextFor } from "./v1-sync-status";
import { UNSYNCED_LABEL, type QueueRecord } from "@/lib/v1/sync/types";
import { deleteRecord, listDeviceRecords, markRecord } from "@/lib/v1/sync/store";
import { listConflicts, listFailed, resolveConflict, type ConflictView } from "@/lib/v1/sync/conflicts";

function fmtTime(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toISOString().slice(0, 19).replace("T", " ");
}

export function V1SyncPanel() {
  const sync = useV1Sync();
  const [queue, setQueue] = useState<QueueRecord[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sync.deviceId) {
      setQueue([]);
      return;
    }
    listDeviceRecords(sync.deviceId).then(setQueue).catch(() => setQueue([]));
  }, [sync.deviceId, sync.lastSyncAt, sync.counts]);

  async function retryNow(id: string): Promise<void> {
    // Same identity, same payload: requeue preserves the idempotency key,
    // so the server replays instead of duplicating.
    await markRecord(id, { state: "queued", next_retry_at: null, last_error: null });
    await sync.refresh();
  }

  async function discard(id: string): Promise<void> {
    await deleteRecord(id);
    await sync.refresh();
  }

  async function manualSync(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await sync.syncNow();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section
        aria-label="Sync state"
        className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-extrabold tracking-tight">Sync state: {syncTextFor(sync)}</h2>
          <button
            type="button"
            onClick={manualSync}
            disabled={busy || !sync.deviceId}
            className="ml-auto rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Syncing…" : "Sync now"}
          </button>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Device</dt>
            <dd className="font-mono text-xs">{sync.deviceId ? sync.deviceId.slice(0, 8) : "not enrolled"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Epoch / watermark</dt>
            <dd className="font-mono text-xs">
              {sync.epoch ?? "—"} / {sync.watermark ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Queued / failed / conflict</dt>
            <dd className="font-mono text-xs">
              {sync.counts.queued} / {sync.counts.failed} / {sync.counts.conflict}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Last sync</dt>
            <dd className="font-mono text-xs">{fmtTime(sync.lastSyncAt)}</dd>
          </div>
        </dl>
        {sync.lastError && (
          <p role="alert" className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
            {sync.lastError}
          </p>
        )}
        {sync.needsReenroll && (
          <p role="alert" className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
            Re-enrollment required: enroll this device again from Admin → Devices, then sync. Stale-epoch records
            can never flush — review and explicitly discard them below.
          </p>
        )}
        <p className="mt-2 text-xs">
          <Link href="/v1/offline/conflicts" className="font-bold underline">
            Open sync exceptions →
          </Link>
        </p>
      </section>

      <section
        aria-label="Queued operations"
        className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <h2 className="text-sm font-extrabold tracking-tight">Queue</h2>
        {queue.filter((r) => r.state === "queued" || r.state === "sent").length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Queue empty — nothing waiting to sync.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-white/5">
            {queue
              .filter((r) => r.state === "queued" || r.state === "sent")
              .map((r) => (
                <li key={r.id} className="py-2 text-sm">
                  <p className="font-bold">
                    <span className="font-mono text-xs">
                      {r.op_type} #{r.seq}
                    </span>{" "}
                    {r.provisional_number ? (
                      <span>
                        {r.provisional_number} · <span className="font-bold">{UNSYNCED_LABEL}</span>
                      </span>
                    ) : null}
                  </p>
                  <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    state {r.state} · attempts {r.attempts} · age{" "}
                    {Math.max(0, Math.round((Date.now() - r.created_at) / 60000))}m
                  </p>
                </li>
              ))}
          </ul>
        )}
      </section>

      <FailedList deviceId={sync.deviceId} onRetry={retryNow} onDiscard={discard} />
    </div>
  );
}

function FailedList({
  deviceId,
  onRetry,
  onDiscard,
}: {
  deviceId: string | null;
  onRetry: (id: string) => Promise<void>;
  onDiscard: (id: string) => Promise<void>;
}) {
  const [failed, setFailed] = useState<QueueRecord[]>([]);
  useEffect(() => {
    if (!deviceId) {
      setFailed([]);
      return;
    }
    listFailed(deviceId).then(setFailed).catch(() => setFailed([]));
  }, [deviceId]);
  if (failed.length === 0) return null;
  return (
    <section
      aria-label="Failed operations"
      className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
    >
      <h2 className="text-sm font-extrabold tracking-tight">Failed ({failed.length})</h2>
      <ul className="mt-2 divide-y divide-slate-100 dark:divide-white/5">
        {failed.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                <span className="font-mono text-xs">
                  {r.op_type} #{r.seq}
                </span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{r.last_error ?? "Failed."}</p>
              {r.last_reason === "STALE_EPOCH" && (
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  Stale epoch — this record can never flush. Discard it explicitly after review.
                </p>
              )}
            </div>
            {r.last_reason !== "STALE_EPOCH" && (
              <button
                type="button"
                onClick={() => onRetry(r.id)}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-bold transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={() => onDiscard(r.id)}
              title="Delete this terminal record after review (explicit operator action)"
              className="rounded-lg px-2 py-1 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
            >
              Discard
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function V1SyncConflicts() {
  const sync = useV1Sync();
  const session = useV1Session();
  const [conflicts, setConflicts] = useState<ConflictView[]>([]);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isBackOffice = !!session?.isBackOffice;

  useEffect(() => {
    listConflicts(sync.deviceId ?? undefined)
      .then(setConflicts)
      .catch(() => setConflicts([]));
  }, [sync.deviceId, sync.lastSyncAt, sync.counts]);

  async function decide(conflict: ConflictView, disposition: "resolved" | "discarded"): Promise<void> {
    if (busy || !conflict.serverId) return;
    setBusy(conflict.record.id);
    setError(null);
    try {
      await resolveConflict(conflict.record.id, conflict.serverId, disposition, (note[conflict.record.id] ?? "").trim());
      await sync.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resolution failed.");
    } finally {
      setBusy(null);
    }
  }

  if (conflicts.length === 0) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
        No sync exceptions. Failed operations stay visible here until resolved or explicitly discarded.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {conflicts.map((c) => (
        <section
          key={c.record.id}
          aria-label={`Sync exception ${c.record.op_type} ${c.record.seq}`}
          className="rounded-2xl border border-amber-200 bg-white p-4 dark:border-amber-500/20 dark:bg-white/[0.03]"
        >
          <p className="text-sm font-bold">
            <span className="font-mono text-xs">
              {c.record.op_type} #{c.record.seq}
            </span>{" "}
            · {c.serverReason ?? "conflict"}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {c.serverDetail ?? c.record.last_error ?? "Server reported a conflict."}
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
            client {c.record.client_uuid.slice(0, 8)} · key {(c.record.idempotency_key ?? "").slice(0, 12)}…
            {c.record.provisional_number ? ` · ${c.record.provisional_number} (${UNSYNCED_LABEL})` : ""}
          </p>
          {!c.serverId && (
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              Local conflict record — sync again to reconcile it against the server exception queue.
            </p>
          )}
          {c.serverId && isBackOffice && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={note[c.record.id] ?? ""}
                onChange={(e) => setNote((prev) => ({ ...prev, [c.record.id]: e.target.value }))}
                placeholder="Decision note (optional)"
                aria-label="Decision note"
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/5"
              />
              <button
                type="button"
                onClick={() => decide(c, "resolved")}
                disabled={busy !== null}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {busy === c.record.id ? "Working…" : "Mark resolved"}
              </button>
              <button
                type="button"
                onClick={() => decide(c, "discarded")}
                disabled={busy !== null}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Discard
              </button>
            </div>
          )}
          {c.serverId && !isBackOffice && (
            <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
              Back-office resolution required — ask a Manager or Admin to decide this exception.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
