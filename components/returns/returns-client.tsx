"use client";

import { useMemo, useState } from "react";
import { inr } from "@/lib/format";
import ReturnDetailModal from "./return-detail-modal";
import StatCard from "@/components/ui/stat-card";
import ViewToggle from "@/components/ui/view-toggle";
import CompactToggle from "@/components/ui/compact-toggle";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";

export type ReturnRow = {
  id: string;
  return_number: string;
  return_date: string;
  reason: string | null;
  subtotal: number | string;
  refund: number | string;
  refund_method: string | null;
  status: string;
  created_at: string;
  invoice_id: string;
  invoices: {
    invoice_number: string;
    total: number | string;
    paid: number | string;
    due: number | string;
    returned: number | string;
    refunded: number | string;
    customers: { name: string; phone?: string | null } | null;
  } | null;
};

const TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "refunded", label: "Refunded" },
  { key: "credit", label: "Credit" },
] as const;

export default function ReturnsClient({ initialReturns }: { initialReturns: ReturnRow[] }) {
  const [returns, setReturns] = useState<ReturnRow[]>(initialReturns);
  const [q, setQ] = useState("");
  const [type, setType] = useState<(typeof TYPE_FILTERS)[number]["key"]>("all");
  const [method, setMethod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [view, setView] = useState<"cards" | "list">("cards");
  const [compact, setCompact] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const { showToast, toastView } = useToast();

  const methods = useMemo(() => {
    const set = new Set<string>();
    for (const r of returns) if (r.refund_method) set.add(r.refund_method);
    return Array.from(set).sort();
  }, [returns]);

  const stats = useMemo(() => {
    let count = 0,
      refunded = 0,
      credit = 0,
      refundCount = 0,
      monthCount = 0,
      monthValue = 0,
      lastMonthCount = 0,
      lastMonthValue = 0;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
    for (const r of returns) {
      count++;
      const refund = Number(r.refund) || 0;
      refunded += refund;
      credit += Number(r.subtotal) - refund;
      if (refund > 0) refundCount++;
      const key = (r.return_date ?? "").slice(0, 7);
      if (key === thisMonth) {
        monthCount++;
        monthValue += Number(r.subtotal) || 0;
      } else if (key === lastKey) {
        lastMonthCount++;
        lastMonthValue += Number(r.subtotal) || 0;
      }
    }
    return {
      count,
      refunded,
      credit,
      refundCount,
      monthCount,
      monthValue,
      lastMonthCount,
      lastMonthValue,
    };
  }, [returns]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return returns.filter((r) => {
      if (type === "refunded" && !(Number(r.refund) > 0)) return false;
      if (type === "credit" && !(Number(r.refund) <= 0)) return false;
      if (method !== "all" && (r.refund_method ?? "none") !== method) return false;
      if (from && r.return_date < from) return false;
      if (to && r.return_date > to) return false;
      if (!needle) return true;
      return (
        r.return_number.toLowerCase().includes(needle) ||
        (r.invoices?.invoice_number ?? "").toLowerCase().includes(needle) ||
        (r.invoices?.customers?.name ?? "").toLowerCase().includes(needle) ||
        (r.invoices?.customers?.phone ?? "").toLowerCase().includes(needle) ||
        (r.reason ?? "").toLowerCase().includes(needle)
      );
    });
  }, [returns, q, type, method, from, to]);

  const monthTrend =
    stats.lastMonthCount === 0
      ? null
      : Math.round(((stats.monthCount - stats.lastMonthCount) / stats.lastMonthCount) * 100);

  function exportCsv() {
    downloadCsv(
      `returns-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Return #", "Invoice", "Customer", "Date", "Reason", "Value", "Refund", "Method", "Type"],
      filtered.map((r) => [
        r.return_number,
        r.invoices?.invoice_number ?? "-",
        r.invoices?.customers?.name ?? "Walk-in",
        r.return_date,
        r.reason ?? "-",
        Number(r.subtotal),
        Number(r.refund) || 0,
        (r.refund_method ?? "none").toUpperCase(),
        Number(r.refund) > 0 ? "Refunded" : "Credit",
      ])
    );
    showToast("success", `Exported ${filtered.length} returns to CSV`);
  }

  async function copyNumber(num: string) {
    try {
      await navigator.clipboard.writeText(num);
      showToast("info", `Copied ${num}`);
    } catch {
      showToast("error", "Could not copy");
    }
  }

  const selectClass =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:bg-slate-900 dark:text-slate-200";
  const typePill = (hasRefund: boolean) =>
    hasRefund
      ? "bg-violet-100 text-violet-700 ring-violet-200"
      : "bg-amber-100 text-amber-700 ring-amber-200";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Returns</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Full and partial returns with refunds, restocked automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            Export CSV
          </button>
          <CompactToggle value={compact} onChange={setCompact} storageKey="sccomm-returns-compact" />
          <ViewToggle value={view} onChange={setView} storageKey="sccomm-returns-view" />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Returns"
          value={String(stats.count)}
          sub={`${filtered.length} shown`}
          icon="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"
          grad="from-rose-500 to-pink-600"
          onClick={() => setQ("")}
        />
        <StatCard
          label="Refunded"
          value={inr(stats.refunded)}
          sub={`${stats.refundCount} cash refunds`}
          icon="M3 7v6h6M3.5 13a9 9 0 1 0 0-6"
          grad="from-violet-500 to-purple-600"
          onClick={() => setQ("refund")}
        />
        <StatCard
          label="Credit / Adjusted"
          value={inr(stats.credit)}
          sub="No-money returns"
          icon="M12 3v18M8 7h7a2 2 0 0 1 0 4H9a2 2 0 0 0 0 4h7"
          grad="from-amber-500 to-orange-600"
          onClick={() => setQ("credit")}
        />
        <StatCard
          label="This Month"
          value={String(stats.monthCount)}
          sub={`${inr(stats.monthValue)} value`}
          trend={monthTrend === null ? null : { dir: monthTrend >= 0 ? "up" : "down", text: `${Math.abs(monthTrend)}% vs last month` }}
          icon="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
          grad="from-blue-500 to-indigo-600"
          onClick={() => setQ(new Date().toISOString().slice(0, 7))}
        />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-[220px] flex-1">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search return no, invoice, customer, mobile or reason…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-white/5">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setType(f.key)}
                  className={`rounded-lg px-3 py-1.5 font-medium capitalize transition ${
                    type === f.key
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                      : "text-slate-500"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={selectClass}>
              <option value="all">All methods</option>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {m.toUpperCase()}
                </option>
              ))}
            </select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={selectClass} title="From date" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={selectClass} title="To date" />
            <button
              onClick={() => {
                setQ("");
                setType("all");
                setMethod("all");
                setFrom("");
                setTo("");
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {view === "list" ? (
        <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-white/10">
          <table className={`w-full text-left text-sm ${compact ? "rows-compact" : ""}`}>
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-white/10">
                <th className="px-5 py-3 font-medium">Return</th>
                <th className="px-5 py-3 font-medium">Invoice</th>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Value</th>
                <th className="px-5 py-3 font-medium">Refund</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const hasRefund = Number(r.refund) > 0;
                return (
                  <tr key={r.id} className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5">
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-rose-600">{r.return_number}</td>
                    <td className="px-5 py-3 font-mono text-xs text-blue-700">{r.invoices?.invoice_number ?? "-"}</td>
                    <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                      {r.invoices?.customers?.name ?? "Walk-in"}
                      {r.invoices?.customers?.phone ? (
                        <span className="ml-1.5 text-xs text-slate-400">{r.invoices.customers.phone}</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-slate-500">{r.return_date}</td>
                    <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{inr(r.subtotal)}</td>
                    <td className="px-5 py-3">
                      {hasRefund ? (
                        <span className="font-semibold text-violet-700">
                          {inr(r.refund)}{" "}
                          <span className="cell-sub text-xs font-normal text-slate-400">{r.refund_method?.toUpperCase()}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${typePill(hasRefund)}`}>
                        {hasRefund ? "Refunded" : "Credit"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setViewId(r.id)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                        >
                          View
                        </button>
                        <button
                          onClick={() => copyNumber(r.return_number)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                        >
                          Copy
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-500">
                    No returns match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => {
            const hasRefund = Number(r.refund) > 0;
            return (
              <div
                key={r.id}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900"
              >
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${hasRefund ? "from-violet-500 to-purple-600" : "from-amber-500 to-orange-600"}`} />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">{r.return_number}</p>
                    <p className="truncate text-xs text-slate-400">
                      {r.invoices?.customers?.name ?? "Walk-in"}
                      {r.invoices?.customers?.phone ? ` · ${r.invoices.customers.phone}` : ""} · {r.invoices?.invoice_number ?? "—"}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${typePill(hasRefund)}`}>
                    {hasRefund ? "Refunded" : "Credit"}
                  </span>
                </div>

                {r.reason && (
                  <p className="mt-3 truncate rounded-lg bg-amber-50/70 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                    {r.reason}
                  </p>
                )}

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-xs text-slate-400">Return value</p>
                    <p className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{inr(r.subtotal)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Refund</p>
                    <p className="text-sm font-semibold text-violet-600">
                      {hasRefund ? (
                        <>
                          {inr(r.refund)}{" "}
                          <span className="text-xs font-normal text-slate-400">{r.refund_method?.toUpperCase()}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/10">
                  <span className="text-xs text-slate-400">{r.return_date}</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setViewId(r.id)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                    >
                      View
                    </button>
                    <button
                      onClick={() => copyNumber(r.return_number)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-500 dark:border-white/10">
              No returns match your filters.
            </div>
          )}
        </div>
      )}

      {viewId && <ReturnDetailModal returnId={viewId} onClose={() => setViewId(null)} />}
      {toastView}
    </div>
  );
}