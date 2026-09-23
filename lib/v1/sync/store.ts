/**
 * Persistent outbox store — V1 Offline Sync milestone.
 *
 * IndexedDB is the authoritative outbox because financial operations need
 * durable structured records (localStorage is NOT used for the outbox;
 * it only keeps the lightweight device identity from lib/v1/v1-device).
 * UI components never touch IndexedDB directly — they go through this
 * module and the provider. All browser access is lazy inside functions
 * (module top-level stays import-safe for SSR/typecheck).
 *
 * Only minimum operation payloads are persisted. Never passwords, access
 * tokens, refresh tokens, service-role keys, or secrets.
 */

import type { QueueRecord, QueueState, SyncMeta } from "./types";

const DB_NAME = "v1-sync";
const DB_VERSION = 1;
const OUTBOX_STORE = "outbox";
const META_STORE = "meta";

function browserDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Persistent outbox needs a browser (IndexedDB unavailable)."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const outbox = db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
        outbox.createIndex("by-state", "state", { unique: false });
        outbox.createIndex("by-key", "idempotency_key", { unique: false });
        outbox.createIndex("by-device-epoch", ["device_id", "epoch"], { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "device_id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
  });
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = run(transaction.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function all<T>(db: IDBDatabase, store: string, index?: string, key?: IDBValidKey): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, "readonly");
    const source = transaction.objectStore(store);
    const request = index ? source.index(index).getAll(key) : source.getAll();
    request.onsuccess = () => resolve((request.result ?? []) as T[]);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed."));
  });
}

export async function enqueue(record: QueueRecord): Promise<QueueRecord> {
  const db = await browserDb();
  try {
    await tx(db, OUTBOX_STORE, "readwrite", (s) => s.add(record));
  } finally {
    db.close();
  }
  return record;
}

export async function readRecord(id: string): Promise<QueueRecord | null> {
  const db = await browserDb();
  try {
    return await tx<QueueRecord | undefined>(db, OUTBOX_STORE, "readonly", (s) => s.get(id)).then(
      (r) => r ?? null,
    );
  } finally {
    db.close();
  }
}

export async function listDeviceRecords(deviceId: string, epoch?: number): Promise<QueueRecord[]> {
  const db = await browserDb();
  try {
    const rows = await all<QueueRecord>(db, OUTBOX_STORE, "by-device-epoch", [deviceId, epoch ?? 0]);
    if (epoch !== undefined) return rows.sort((a, b) => a.seq - b.seq);
    const allRows = await all<QueueRecord>(db, OUTBOX_STORE);
    return allRows.filter((r) => r.device_id === deviceId).sort((a, b) => a.seq - b.seq);
  } finally {
    db.close();
  }
}

export async function listByState(state: QueueState): Promise<QueueRecord[]> {
  const db = await browserDb();
  try {
    return await all<QueueRecord>(db, OUTBOX_STORE, "by-state", state);
  } finally {
    db.close();
  }
}

export async function countByState(deviceId?: string): Promise<Record<QueueState, number>> {
  const db = await browserDb();
  try {
    const rows = await all<QueueRecord>(db, OUTBOX_STORE);
    const scoped = deviceId ? rows.filter((r) => r.device_id === deviceId) : rows;
    const counts: Record<QueueState, number> = { queued: 0, sent: 0, acked: 0, failed: 0, conflict: 0 };
    for (const r of scoped) counts[r.state] += 1;
    return counts;
  } finally {
    db.close();
  }
}

export async function oldestPending(deviceId: string): Promise<QueueRecord | null> {
  const db = await browserDb();
  try {
    const rows = await all<QueueRecord>(db, OUTBOX_STORE);
    const pending = rows
      .filter((r) => r.device_id === deviceId && (r.state === "queued" || r.state === "failed"))
      .sort((a, b) => a.seq - b.seq);
    return pending[0] ?? null;
  } finally {
    db.close();
  }
}

export async function markRecord(id: string, patch: Partial<QueueRecord>): Promise<QueueRecord | null> {
  const db = await browserDb();
  try {
    const current = await tx<QueueRecord | undefined>(db, OUTBOX_STORE, "readonly", (s) => s.get(id));
    if (!current) return null;
    const next: QueueRecord = { ...current, ...patch, id: current.id, updated_at: Date.now() };
    await tx(db, OUTBOX_STORE, "readwrite", (s) => s.put(next));
    return next;
  } finally {
    db.close();
  }
}

export async function markSent(id: string): Promise<void> {
  await markRecord(id, { state: "sent" });
}

export async function markAcknowledged(
  id: string,
  serverResult: Record<string, unknown> | null,
  note: string | null,
): Promise<void> {
  await markRecord(id, {
    state: "acked",
    server_result: serverResult,
    last_error: note,
    next_retry_at: null,
  });
}

export async function markFailed(
  id: string,
  error: string,
  reason: QueueRecord["last_reason"],
  nextRetryAt: number | null,
  attempts: number,
): Promise<void> {
  await markRecord(id, {
    state: "failed",
    last_error: error,
    last_reason: reason,
    next_retry_at: nextRetryAt,
    attempts,
  });
}

export async function markConflict(
  id: string,
  reason: QueueRecord["last_reason"],
  error: string,
  conflictId: string | null,
): Promise<void> {
  await markRecord(id, {
    state: "conflict",
    last_reason: reason,
    last_error: error,
    server_conflict_id: conflictId,
    server_disposition: "pending",
    next_retry_at: null,
  });
}

/** Explicit operator delete only: used for terminal records the operator
 *  has reviewed (e.g. stale-epoch dead ends). Failed/conflict records are
 *  never deleted automatically. */
export async function deleteRecord(id: string): Promise<void> {
  const db = await browserDb();
  try {
    await tx(db, OUTBOX_STORE, "readwrite", (s) => s.delete(id));
  } finally {
    db.close();
  }
}

export async function getMeta(deviceId: string): Promise<SyncMeta | null> {
  const db = await browserDb();
  try {
    const row = await tx<SyncMeta | undefined>(db, META_STORE, "readonly", (s) => s.get(deviceId));
    return row ?? null;
  } finally {
    db.close();
  }
}

export async function setMeta(meta: SyncMeta): Promise<void> {
  const db = await browserDb();
  try {
    await tx(db, META_STORE, "readwrite", (s) => s.put(meta));
  } finally {
    db.close();
  }
}
