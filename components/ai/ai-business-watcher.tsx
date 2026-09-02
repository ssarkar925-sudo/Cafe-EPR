"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type WatchEvent = {
  id: string;
  severity: "info" | "attention" | "critical";
  source: string;
  title: string;
  details?: any;
  status: string;
  detected_at: string;
};

type ScanResult = {
  scannedAt: string;
  events: WatchEvent[];
  metrics?: {
    current7Revenue: number;
    previous7Revenue: number;
    recentTransactions: number;
    failedOrReversed: number;
    lowStockCount: number;
    outstandingTotal: number;
    openHighAuditFindings: number;
    criticalAuditFindings: number;
    cashIn: number;
    cashOut: number;
  };
};

const severityMeta = {
  critical: { label: "CRITICAL", dot: "bg-rose-500", badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30" },
  attention: { label: "ATTENTION", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30" },
  info: { label: "INFO", dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30" },
} as const;

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
}

function friendlyDetails(event: WatchEvent): string | null {
  const details = event.details || {};
  if (details.recommendations?.length) return details.recommendations.join(" • ");
  if (typeof details.description === "string") return details.description;
  if (event.source === "inventory" && details.count) return `${details.count} item(s) need stock attention.`;
  if (event.source === "transaction" && details.failureRatePercent !== undefined) return `${details.failureRatePercent}% of recent transactions are failed or reversed.`;
  if (event.source === "business" && details.dropPercent !== undefined) return `${details.dropPercent}% below the previous 7-day revenue baseline.`;
  return null;
}

export default function AIBusinessWatcher() {
  const [events, setEvents] = useState<WatchEvent[]>([]);
  const [metrics, setMetrics] = useState<ScanResult["metrics"]>();
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/monitor", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Could not load monitor events");
      setEvents(data.events || []);
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || "Could not load monitor events");
      setLoading(false);
    }
  }, []);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan" }),
        cache: "no-store",
      });
      const data: ScanResult = await response.json();
      if (!response.ok) throw new Error((data as any)?.error || "Business scan failed");
      setEvents(data.events || []);
      setMetrics(data.metrics);
      setScannedAt(data.scannedAt || new Date().toISOString());
    } catch (err: any) {
      setError(err?.message || "Business scan failed");
    } finally {
      setScanning(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void scan();
    const timer = window.setInterval(() => { void scan(); }, 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [scan]);

  useEffect(() => {
    const timer = window.setInterval(() => { void load(); }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [load]);

  const counts = useMemo(() => ({
    critical: events.filter((e) => e.severity === "critical").length,
    attention: events.filter((e) => e.severity === "attention").length,
    info: events.filter((e) => e.severity === "info").length,
  }), [events]);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/80">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 px-5 py-4 dark:border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">AI Business Watcher</h2>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">Live</span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Scans sales, transactions, cash, customers, inventory and audit risk without changing business records.</p>
        </div>
        <button
          type="button"
          onClick={() => void scan()}
          disabled={scanning}
          className="rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
        >
          {scanning ? "Scanning…" : "Run scan now"}
        </button>
      </div>

      <div className="grid gap-3 border-b border-slate-200/80 p-4 sm:grid-cols-3 dark:border-white/10">
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-500/20 dark:bg-rose-500/5">
          <div className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-300">Critical</div>
          <div className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{counts.critical}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
          <div className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-300">Attention</div>
          <div className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{counts.attention}</div>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-500/20 dark:bg-blue-500/5">
          <div className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-300">Business insights</div>
          <div className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{counts.info}</div>
        </div>
      </div>

      {metrics && (
        <div className="grid grid-cols-2 gap-3 border-b border-slate-200/80 p-4 sm:grid-cols-4 dark:border-white/10">
          <div><div className="text-[10px] font-bold uppercase text-slate-400">7d revenue</div><div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{money(metrics.current7Revenue)}</div></div>
          <div><div className="text-[10px] font-bold uppercase text-slate-400">Failed / reversed</div><div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{metrics.failedOrReversed}</div></div>
          <div><div className="text-[10px] font-bold uppercase text-slate-400">Low stock</div><div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{metrics.lowStockCount}</div></div>
          <div><div className="text-[10px] font-bold uppercase text-slate-400">Outstanding</div><div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{money(metrics.outstandingTotal)}</div></div>
        </div>
      )}

      <div className="p-4">
        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">Running the first business scan…</div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/50 p-8 text-center dark:border-emerald-500/20 dark:bg-emerald-500/5">
            <div className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300">No open monitoring alerts</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">The watcher found no current issue above its alert thresholds.</div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {events.slice(0, 12).map((event) => {
              const meta = severityMeta[event.severity];
              const detail = friendlyDetails(event);
              return (
                <div key={event.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3.5 dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="flex items-start gap-3">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-black ${meta.badge}`}>{meta.label}</span>
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{event.source}</span>
                      </div>
                      <div className="mt-1 text-sm font-extrabold text-slate-900 dark:text-white">{event.title}</div>
                      {detail && <div className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{detail}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {scannedAt && <div className="border-t border-slate-200/80 px-5 py-2.5 text-[10px] font-semibold text-slate-400 dark:border-white/10">Last scan: {new Date(scannedAt).toLocaleString("en-IN")}. Automatic re-scan runs while the AI Agent page is open.</div>}
    </section>
  );
}
