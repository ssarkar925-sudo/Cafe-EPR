/**
 * V1 device enrollment card (foundation only).
 *
 * Shows this install's enrollment state against the G0/G9 device model and
 * offers enrollment via the documented token RPCs. Performs no queueing,
 * flushing, or conflict handling (later phases).
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  enrollDevice,
  fetchDeviceStatus,
  forgetDevice,
  getEnrolledDevice,
  getOrCreateClientUuid,
  type V1DeviceStatus,
} from "@/lib/v1/v1-device";

type CardState =
  | { kind: "loading" }
  | { kind: "unenrolled"; clientUuid: string }
  | { kind: "enrolled"; clientUuid: string; status: V1DeviceStatus }
  | { kind: "error"; clientUuid: string; message: string };

export default function V1EnrollmentCard() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<CardState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const clientUuid = getOrCreateClientUuid();
    const enrolled = getEnrolledDevice();
    if (!enrolled || !enrolled.serverDeviceId) {
      setState({ kind: "unenrolled", clientUuid });
      return;
    }
    try {
      const status = await fetchDeviceStatus(supabase, enrolled.serverDeviceId);
      setState({ kind: "enrolled", clientUuid, status });
    } catch (error) {
      setState({
        kind: "error",
        clientUuid,
        message: error instanceof Error ? error.message : "Device handshake failed.",
      });
    }
  }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onEnroll() {
    setBusy(true);
    try {
      await enrollDevice();
      await refresh();
    } catch (error) {
      setState({
        kind: "error",
        clientUuid: getOrCreateClientUuid(),
        message: error instanceof Error ? error.message : "Enrollment failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  function onForget() {
    forgetDevice();
    void refresh();
  }

  return (
    <section
      aria-label="Device enrollment"
      className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]"
    >
      <h2 className="text-sm font-extrabold tracking-tight">This device</h2>
      {state.kind === "loading" && (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Checking enrollment…</p>
      )}
      {state.kind !== "loading" && (
        <p className="mt-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
          install {state.clientUuid.slice(0, 8)}
        </p>
      )}
      {state.kind === "unenrolled" && (
        <div className="mt-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Not enrolled. Enrollment binds this install to the V1 device model (epoch + watermark).
          </p>
          <button
            type="button"
            onClick={onEnroll}
            disabled={busy}
            className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {busy ? "Enrolling…" : "Enroll this device"}
          </button>
        </div>
      )}
      {state.kind === "enrolled" && (
        <div className="mt-3 text-sm">
          <p className="font-semibold text-emerald-600 dark:text-emerald-400">Enrolled</p>
          <dl className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500 dark:text-slate-400">Epoch</dt>
              <dd className="font-mono">{state.status.deviceEpoch}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500 dark:text-slate-400">Watermark</dt>
              <dd className="font-mono">{state.status.lastWatermark}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={onForget}
            className="mt-3 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Forget on this install
          </button>
        </div>
      )}
      {state.kind === "error" && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">Device check failed</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{state.message}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-3 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Retry
          </button>
        </div>
      )}
    </section>
  );
}
