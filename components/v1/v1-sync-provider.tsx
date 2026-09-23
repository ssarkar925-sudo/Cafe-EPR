"use client";

/**
 * Application-wide sync state — V1 Offline Sync milestone (React Context
 * only, mirroring the session-provider pattern; no state-management lib).
 *
 * Holds no financial logic: counting, handshake, flush, and retry live in
 * lib/v1/sync/*. The provider polls for retry-due work on a 30s tick,
 * reacts to online/offline transitions, and exposes explicit sync state
 * plus a manual sync action. Authentication expiry pauses automatic
 * flushing (the queue is retained); re-authentication resumes via manual
 * or tick-triggered sync, which re-handshakes before sending anything.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { getEnrolledDevice } from "@/lib/v1/v1-device";
import { countByState, getMeta } from "@/lib/v1/sync/store";
import { flushOutbox, hasSyncWork, SyncHalted } from "@/lib/v1/sync/flush";
import type { QueueState } from "@/lib/v1/sync/types";

export type SyncDisplayState =
  | "idle"
  | "syncing"
  | "paused-auth"
  | "stale-epoch"
  | "error"
  | "no-enrollment";

export interface SyncContextValue {
  online: boolean;
  syncState: SyncDisplayState;
  counts: Record<QueueState, number>;
  deviceId: string | null;
  epoch: number | null;
  watermark: number | null;
  serverTime: string | null;
  lastSyncAt: number | null;
  lastError: string | null;
  needsReenroll: boolean;
  syncNow: () => Promise<void>;
  refresh: () => Promise<void>;
}

const idleCounts: Record<QueueState, number> = { queued: 0, sent: 0, acked: 0, failed: 0, conflict: 0 };

const idleValue: SyncContextValue = {
  online: true,
  syncState: "idle",
  counts: idleCounts,
  deviceId: null,
  epoch: null,
  watermark: null,
  serverTime: null,
  lastSyncAt: null,
  lastError: null,
  needsReenroll: false,
  syncNow: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
};

const V1SyncReactContext = createContext<SyncContextValue>(idleValue);

export function V1SyncProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [syncState, setSyncState] = useState<SyncDisplayState>("idle");
  const [counts, setCounts] = useState<Record<QueueState, number>>(idleCounts);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [epoch, setEpoch] = useState<number | null>(null);
  const [watermark, setWatermark] = useState<number | null>(null);
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [needsReenroll, setNeedsReenroll] = useState(false);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const device = getEnrolledDevice();
      if (!device || !device.serverDeviceId) {
        setDeviceId(null);
        setSyncState((s) => (s === "syncing" ? s : "no-enrollment"));
        setCounts(idleCounts);
        return;
      }
      setDeviceId(device.serverDeviceId);
      const [c, meta] = await Promise.all([
        countByState(device.serverDeviceId),
        getMeta(device.serverDeviceId),
      ]);
      setCounts(c);
      setEpoch(meta?.epoch ?? device.deviceEpoch);
      setWatermark(meta?.watermark ?? device.lastWatermark);
      setServerTime(meta?.server_time ?? null);
      setLastSyncAt(meta?.last_sync_at ?? null);
      setLastError(meta?.last_error ?? null);
    } catch {
      /* IndexedDB unavailable (e.g. private mode): stay on last state. */
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (busyRef.current) return;
    const device = getEnrolledDevice();
    if (!device || !device.serverDeviceId) {
      setSyncState("no-enrollment");
      return;
    }
    busyRef.current = true;
    setSyncState("syncing");
    setLastError(null);
    try {
      const client = createClient();
      await flushOutbox(client);
      setNeedsReenroll(false);
      setSyncState("idle");
    } catch (error) {
      if (error instanceof SyncHalted) {
        if (error.haltKind === "auth") {
          setSyncState("paused-auth");
          setLastError(error.message);
        } else if (error.haltKind === "stale-epoch" || error.haltKind === "enrollment") {
          setSyncState("stale-epoch");
          setNeedsReenroll(true);
          setLastError(error.message);
        } else {
          setSyncState("error");
          setLastError(error.message);
        }
      } else {
        setSyncState("error");
        setLastError(error instanceof Error ? error.message : "Sync failed.");
      }
    } finally {
      busyRef.current = false;
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const onOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void refresh();
    const timer = setInterval(() => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const device = getEnrolledDevice();
      if (!device || !device.serverDeviceId) return;
      void hasSyncWork(device.serverDeviceId).then((work) => {
        if (work) void syncNow();
      });
    }, 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(timer);
    };
  }, [refresh, syncNow]);

  return (
    <V1SyncReactContext.Provider
      value={{
        online,
        syncState,
        counts,
        deviceId,
        epoch,
        watermark,
        serverTime,
        lastSyncAt,
        lastError,
        needsReenroll,
        syncNow,
        refresh,
      }}
    >
      {children}
    </V1SyncReactContext.Provider>
  );
}

export function useV1Sync(): SyncContextValue {
  return useContext(V1SyncReactContext);
}
