"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SUGGESTED_NOTIFICATION_SOURCES,
  getAllowedPhoneSources,
  getPhoneCollectorStatus,
  isPhoneCollectorAvailable,
  isPhoneCollectionEnabled,
  isPhoneListenerSystemEnabled,
  openPhoneListenerSettings,
  setPhoneCollectionEnabled,
  setPhoneCollectorApi,
  setPhoneSourceAllowed,
  type PhoneCollectorStatus,
} from "@/lib/ai/phone-collector";

/**
 * Owner controls for the Android notification collector (Phase 2).
 * Collection is OFF by default; sources are enabled one by one; the system
 * listener grant is a separate explicit step. No notification content is
 * ever displayed here — only counts, states, and configuration.
 */
export default function PhoneCollectorPanel() {
  const [present, setPresent] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [systemOn, setSystemOn] = useState(false);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [status, setStatus] = useState<PhoneCollectorStatus | null>(null);
  const [customPkg, setCustomPkg] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [workerKey, setWorkerKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const refresh = useCallback(async () => {
    const available = await isPhoneCollectorAvailable();
    setPresent(available);
    if (!available) return;
    try {
      setEnabled(await isPhoneCollectionEnabled());
      setSystemOn(await isPhoneListenerSystemEnabled());
      setAllowed(await getAllowedPhoneSources());
      setStatus(await getPhoneCollectorStatus());
    } catch {
      // Collector bridge unavailable; panel stays in web mode.
    }
  }, []);

  useEffect(() => {
    let active = true;
    let retries = 0;
    const maxRetries = 10;

    const poll = async () => {
      const available = await isPhoneCollectorAvailable();
      if (!active) return;
      if (available) {
        setPresent(true);
        void refresh();
      } else if (retries < maxRetries) {
        retries++;
        setTimeout(poll, 300);
      }
    };

    void poll();

    const onReady = () => {
      if (active) void refresh();
    };
    window.addEventListener("DOMContentLoaded", onReady);
    window.addEventListener("deviceready", onReady);

    return () => {
      active = false;
      window.removeEventListener("DOMContentLoaded", onReady);
      window.removeEventListener("deviceready", onReady);
    };
  }, [refresh]);

  if (!present) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Phone Collector</h3>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
          >
            Check device
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Notification collection runs inside the Android app with owner-enabled sources only. This browser has no collector.
        </p>
      </div>
    );
  }

  const toggleSource = async (pkg: string, next: boolean) => {
    setBusy(true);
    try {
      await setPhoneSourceAllowed(pkg, next);
      setAllowed(await getAllowedPhoneSources());
    } catch {
      setNote("Could not update the source allowlist.");
    } finally {
      setBusy(false);
    }
  };

  const saveApi = async () => {
    setBusy(true);
    try {
      await setPhoneCollectorApi(apiUrl.trim(), workerKey.trim());
      setWorkerKey("");
      setNote("Sync configuration saved on this device.");
      await refresh();
    } catch {
      setNote("Could not save sync configuration.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Phone Collector</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {status ? `${status.queuedEvents} queued · ${status.failedEvents} failed · last: ${status.lastResult || "—"}` : "Android notification collector"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void openPhoneListenerSettings()}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
          >
            {systemOn ? "System access granted" : "Grant system access"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await setPhoneCollectionEnabled(!enabled);
                setEnabled(!enabled);
              } finally {
                setBusy(false);
              }
            }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold text-white transition ${enabled ? "bg-rose-600 hover:bg-rose-500" : "bg-emerald-600 hover:bg-emerald-500"}`}
          >
            {enabled ? "Disable collection" : "Enable collection"}
          </button>
        </div>
      </div>

      {!systemOn && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
          Android has not granted notification access yet. Grant it in system settings, then enable collection above.
        </p>
      )}

      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Allowed sources (explicit opt-in only)</p>
        <div className="mt-2 space-y-2">
          {SUGGESTED_NOTIFICATION_SOURCES.map((s) => {
            const on = allowed.includes(s.pkg);
            return (
              <div key={s.pkg} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 dark:border-white/5">
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{s.label}</p>
                  <p className="font-mono text-[10px] text-slate-400">{s.pkg}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleSource(s.pkg, !on)}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition ${on ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "border border-slate-200 text-slate-500 dark:border-white/10"}`}
                >
                  {on ? "On" : "Off"}
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={customPkg}
            onChange={(e) => setCustomPkg(e.target.value)}
            placeholder="Add custom app package (e.g. com.example.bank)"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none dark:border-white/10 dark:bg-slate-900"
          />
          <button
            type="button"
            disabled={busy || !customPkg.trim()}
            onClick={() => {
              void toggleSource(customPkg.trim(), true).then(() => setCustomPkg(""));
            }}
            className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white"
          >
            Add
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sync Endpoint</span>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  setApiUrl(`${window.location.origin}/api/ai/ingestion/events`);
                }
              }}
              className="text-[10px] font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Use this server
            </button>
          </div>
          <input
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="Sync API URL (https://…/api/ai/ingestion/events)"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none dark:border-white/10 dark:bg-slate-900"
          />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Worker Key</span>
          <input
            value={workerKey}
            onChange={(e) => setWorkerKey(e.target.value)}
            placeholder="Worker key (stored on device only)"
            type="password"
            autoComplete="off"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none dark:border-white/10 dark:bg-slate-900"
          />
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void saveApi()}
        className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white dark:bg-white dark:text-slate-900"
      >
        Save sync configuration
      </button>
      {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
      <p className="mt-3 text-[11px] text-slate-400">
        OTPs, PINs, passwords, card numbers and payment authorizations are never collected or uploaded. Unrecognized notifications stay on-device review only.
      </p>
    </div>
  );
}
