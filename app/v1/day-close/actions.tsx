"use client";

/**
 * Day-close actions island — V1 Day Close milestone (client).
 *
 * All financial mutation goes through lib/v1/v1-rpc.ts with
 * caller-supplied idempotency keys. Key lifecycle: a key identifies one
 * logical submission, so it is regenerated after each SUCCESS (the next
 * submission is new) and retained after FAILURE (retry replays instead of
 * duplicating). Count keys additionally regenerate after new counts land,
 * because a close under changed counts is a new logical submission.
 *
 * Server authority (never duplicated here): expected balances (snapshotted
 * into day_close_lines at open), line variances, the ₹1 tolerance
 * decision, status transitions, variance-journal posting, locks, and
 * timestamps. Note post_variance_journal is intentionally NEVER called
 * from this UI: G8 grants it no caller EXECUTE, so it is internal-only by
 * design and runs inside close_day_close / approve_day_close.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callV1Mutation } from "@/lib/v1/v1-rpc";

export interface CloseLine {
  instrument_id: string;
  instrument_name: string;
  expected: number;
  counted: number | null;
  variance: number | null;
}

interface CloseResult {
  status: string;
  variance: number;
}

function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function parseCount(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function OpenDayForm({ businessDate }: { businessDate: string }) {
  const router = useRouter();
  const [date, setDate] = useState(businessDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open(): Promise<void> {
    if (busy) return;
    if (!date) {
      setError("Business date required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // open_day_close takes no idempotency key: a duplicate open for the
      // same date fails closed server-side ('already exists'), and the UI
      // then displays the existing close instead of creating another.
      const res = await callV1Mutation<string>("open_day_close", { p_business_date: date });
      if (res.error || !res.data) {
        setError(res.error?.message ?? "Open day failed.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Business date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
        />
      </label>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
      >
        {busy ? "Opening…" : "Open day"}
      </button>
      {error && (
        <p role="alert" className="w-full text-xs font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function CloseWorkspace({
  closeId,
  businessDate,
  status,
  lines,
  isAdmin,
}: {
  closeId: string;
  businessDate: string;
  status: string;
  lines: CloseLine[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const locked = status === "locked";
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.filter((l) => l.counted !== null).map((l) => [l.instrument_id, String(l.counted)])),
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CloseResult | null>(null);
  const [countKey, setCountKey] = useState(newKey());
  const [closeKey, setCloseKey] = useState(newKey());
  const [approveKey, setApproveKey] = useState(newKey());

  function setCount(id: string, value: string): void {
    setCounts((prev) => ({ ...prev, [id]: value }));
  }

  async function recordCounts(): Promise<void> {
    if (busy) return;
    const items: { instrument_id: string; counted: number }[] = [];
    for (const l of lines) {
      const raw = (counts[l.instrument_id] ?? "").trim();
      if (raw === "") continue;
      const n = parseCount(raw);
      if (n === null) {
        setError(`Counted amount for ${l.instrument_name} is not a valid monetary value.`);
        return;
      }
      if (n < 0) {
        setError(`Counted amount for ${l.instrument_name} must be non-negative.`);
        return;
      }
      items.push({ instrument_id: l.instrument_id, counted: n });
    }
    if (items.length === 0) {
      setError("Enter at least one counted amount.");
      return;
    }
    setBusy("counts");
    setError(null);
    try {
      const res = await callV1Mutation("record_day_counts", {
        p_close_id: closeId,
        p_counts: items,
        p_idempotency_key: countKey,
      });
      if (res.error) {
        setError(res.error.message);
        return;
      }
      setCountKey(newKey());
      setCloseKey(newKey());
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function close(): Promise<void> {
    if (busy) return;
    setBusy("close");
    setError(null);
    try {
      const res = await callV1Mutation<{ status: string; variance: number }>("close_day_close", {
        p_close_id: closeId,
        p_idempotency_key: closeKey,
      });
      if (res.error || !res.data) {
        setError(res.error?.message ?? "Close failed.");
        return;
      }
      setResult({ status: String(res.data.status), variance: Number(res.data.variance) });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function approve(): Promise<void> {
    if (busy) return;
    if (!isAdmin) return;
    if (reason.trim() === "") {
      setError("Approval reason required.");
      return;
    }
    setBusy("approve");
    setError(null);
    try {
      const res = await callV1Mutation<{ status: string; variance: number }>("approve_day_close", {
        p_close_id: closeId,
        p_reason: reason.trim(),
        p_idempotency_key: approveKey,
      });
      if (res.error || !res.data) {
        setError(res.error?.message ?? "Approval failed.");
        return;
      }
      setResult({ status: String(res.data.status), variance: Number(res.data.variance) });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {locked && (
        <p role="status" className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-bold dark:border-white/15 dark:bg-white/5">
          Locked — counts cannot be edited and historical data stays immutable.
        </p>
      )}
      {status === "variance_pending" && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          Variance over the ₹1.00 tolerance — Admin approval required. Counts may still be corrected below; closing
          again re-evaluates the total.
        </p>
      )}

      <section aria-label="Count entry" className="space-y-2">
        <h3 className="text-sm font-extrabold tracking-tight">Counts for {businessDate}</h3>
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {lines.map((l) => (
            <li key={l.instrument_id} className="grid grid-cols-2 items-center gap-2 py-2 sm:grid-cols-4">
              <span className="text-sm font-bold">{l.instrument_name}</span>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                expected {Number(l.expected).toFixed(2)}
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={counts[l.instrument_id] ?? ""}
                disabled={locked || busy !== null}
                onChange={(e) => setCount(l.instrument_id, e.target.value)}
                placeholder="counted"
                aria-label={`Counted amount for ${l.instrument_name}`}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono text-sm dark:border-white/10 dark:bg-white/5 disabled:opacity-50"
              />
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {l.variance === null ? "variance —" : `variance ${Number(l.variance).toFixed(2)} (server)`}
              </span>
            </li>
          ))}
        </ul>
        {!locked && (
          <button
            type="button"
            onClick={recordCounts}
            disabled={busy !== null}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {busy === "counts" ? "Recording…" : "Record counts"}
          </button>
        )}
      </section>

      {!locked && (
        <section aria-label="Close day" className="space-y-2">
          <button
            type="button"
            onClick={close}
            disabled={busy !== null}
            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {busy === "close" ? "Closing…" : "Close day"}
          </button>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Within the ₹1.00 tolerance the server locks the day immediately (variance journal included); above it
            the day moves to variance-pending for Admin approval.
          </p>
        </section>
      )}

      {status === "variance_pending" && !locked && isAdmin && (
        <section aria-label="Approve variance" className="space-y-2 rounded-xl border border-amber-200 p-3 dark:border-amber-500/20">
          <h3 className="text-sm font-extrabold tracking-tight">Admin approval</h3>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Approval reason (required)</span>
            <input
              type="text"
              value={reason}
              disabled={busy !== null}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this variance accepted?"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5 disabled:opacity-50"
            />
          </label>
          <button
            type="button"
            onClick={approve}
            disabled={busy !== null}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {busy === "approve" ? "Approving…" : "Approve and lock"}
          </button>
        </section>
      )}
      {status === "variance_pending" && !locked && !isAdmin && (
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
          Admin approval required — a Manager cannot approve an over-tolerance variance. Ask an Admin to decide here.
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      {result && (
        <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm dark:border-teal-500/20 dark:bg-teal-500/10">
          <p className="font-extrabold text-teal-800 dark:text-teal-200">
            Day {result.status === "locked" ? "locked" : result.status}.
          </p>
          <p className="mt-1 font-mono text-xs">Server variance {Number(result.variance).toFixed(2)}.</p>
        </div>
      )}
    </div>
  );
}
