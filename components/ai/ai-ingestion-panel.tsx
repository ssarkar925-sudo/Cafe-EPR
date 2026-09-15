"use client";

import { useCallback, useEffect, useState } from "react";
import { getPhoneCollectorStatus, type PhoneCollectorStatus } from "@/lib/ai/phone-collector";

type SourceStats = {
  source_type: string;
  source_provider: string;
  collected: number;
  pending_review: number;
  reconciled: number;
  failed: number;
  last_collected_at: string | null;
  last_failure_at: string | null;
};

function formatTime(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

/**
 * AI ingestion observability (Phase 18). Honest per-source aggregates:
 * collected vs pending review vs reconciled vs failed, plus last
 * collection/failure timestamps and the phone collector status.
 * Numbers come from the stats API — never claimed, always measured.
 */
export default function AIIngestionPanel() {
  const [sources, setSources] = useState<SourceStats[]>([]);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [phone, setPhone] = useState<PhoneCollectorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/ingestion/stats", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setDenied(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setSources(Array.isArray(data?.sources) ? data.sources : []);
      setDrafts(data?.drafts && typeof data.drafts === "object" ? data.drafts : {});
    } catch {
      // Panel degrades silently; stats are observability, not control.
    } finally {
      setLoading(false);
    }
    try {
      setPhone(await getPhoneCollectorStatus());
    } catch {
      // Phone collector only exists inside the Android app.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const needsReview = sources.reduce((s, r) => s + r.pending_review, 0);
  const collected = sources.reduce((s, r) => s + r.collected, 0);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">AI Data Ingestion</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {collected} collected · {needsReview} needs review · drafts pending {drafts.pending || 0}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
        >
          Refresh
        </button>
      </div>

      {denied ? (
        <p className="mt-4 text-xs text-slate-500">Ingestion stats require an admin or manager session.</p>
      ) : loading ? (
        <p className="mt-4 text-xs text-slate-500">Loading ingestion status…</p>
      ) : sources.length === 0 ? (
        <p className="mt-4 text-xs text-slate-500">
          No ingestion events yet. Phone, portal, SMS, email, manual, and API sources appear here after their first collection.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400">
                <th className="py-2 pr-3 font-semibold">Source</th>
                <th className="py-2 pr-3 font-semibold">Provider</th>
                <th className="py-2 pr-3 text-right font-semibold">Collected</th>
                <th className="py-2 pr-3 text-right font-semibold">Needs review</th>
                <th className="py-2 pr-3 text-right font-semibold">Reconciled</th>
                <th className="py-2 pr-3 text-right font-semibold">Failed</th>
                <th className="py-2 pr-3 font-semibold">Last collected</th>
                <th className="py-2 font-semibold">Last failure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {sources.map((s) => (
                <tr key={`${s.source_type}:${s.source_provider}`}>
                  <td className="py-2 pr-3 font-bold text-slate-800 dark:text-slate-200">{s.source_type}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">{s.source_provider}</td>
                  <td className="py-2 pr-3 text-right font-mono">{s.collected}</td>
                  <td className="py-2 pr-3 text-right font-mono text-amber-600">{s.pending_review}</td>
                  <td className="py-2 pr-3 text-right font-mono text-emerald-600">{s.reconciled}</td>
                  <td className="py-2 pr-3 text-right font-mono text-rose-600">{s.failed}</td>
                  <td className="py-2 pr-3 text-slate-500">{formatTime(s.last_collected_at)}</td>
                  <td className="py-2 text-slate-500">{formatTime(s.last_failure_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-400">
        {phone && phone.available ? (
          <span>
            Phone collector active · {phone.sourcesEnabled} source(s) enabled · {phone.queuedEvents} event(s) queued on device
            {phone.apiConfigured ? "" : " · API sync not configured"}.
          </span>
        ) : (
          <span>Phone collector runs inside the Android app with owner-enabled sources only. This browser has no collector.</span>
        )}
      </div>
    </div>
  );
}
