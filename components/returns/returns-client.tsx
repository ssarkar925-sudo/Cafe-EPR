"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { inr } from "@/lib/format";
import { useRealtime } from "@/lib/supabase/realtime";
import ReturnDetailModal from "./return-detail-modal";
import ViewToggle from "@/components/ui/view-toggle";
import CompactToggle from "@/components/ui/compact-toggle";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";
import {
  RotateCcw,
  DollarSign,
  AlertCircle,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Copy,
  Eye,
  FileSpreadsheet,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Plus,
  X,
  FileText,
  Check,
} from "lucide-react";

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
  { key: "all", label: "All Returns" },
  { key: "refunded", label: "Refunded Cash" },
  { key: "credit", label: "Credit Adjusted" },
] as const;

export type ReturnSortKey =
  | "newest"
  | "oldest"
  | "highest_value"
  | "lowest_value"
  | "highest_refund";

export default function ReturnsClient({ initialReturns }: { initialReturns: ReturnRow[] }) {
  useRealtime(["returns", "return_items", "invoices", "payments"]);
  const [returns, setReturns] = useState<ReturnRow[]>(initialReturns);
  const [q, setQ] = useState("");
  const [type, setType] = useState<(typeof TYPE_FILTERS)[number]["key"]>("all");
  const [method, setMethod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortBy, setSortBy] = useState<ReturnSortKey>("newest");
  const [view, setView] = useState<"cards" | "list">("list");
  const [compact, setCompact] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [copiedNum, setCopiedNum] = useState<string | null>(null);
  const { showToast, toastView } = useToast();

  const methods = useMemo(() => {
    const set = new Set<string>();
    for (const r of returns) if (r.refund_method) set.add(r.refund_method);
    return Array.from(set).sort();
  }, [returns]);

  const stats = useMemo(() => {
    let count = 0,
      value = 0,
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
      const sub = Number(r.subtotal) || 0;
      value += sub;
      const refund = Number(r.refund) || 0;
      refunded += refund;
      credit += Math.max(0, sub - refund);
      if (refund > 0) refundCount++;
      const key = (r.return_date ?? "").slice(0, 7);
      if (key === thisMonth) {
        monthCount++;
        monthValue += sub;
      } else if (key === lastKey) {
        lastMonthCount++;
        lastMonthValue += sub;
      }
    }
    return {
      count,
      value,
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
    const rowsFiltered = returns.filter((r) => {
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

    return rowsFiltered.sort((a, b) => {
      switch (sortBy) {
        case "newest": {
          const timeA = a.created_at || a.return_date;
          const timeB = b.created_at || b.return_date;
          const cmp = timeB.localeCompare(timeA);
          return cmp !== 0 ? cmp : b.id.localeCompare(a.id);
        }
        case "oldest": {
          const timeA = a.created_at || a.return_date;
          const timeB = b.created_at || b.return_date;
          const cmp = timeA.localeCompare(timeB);
          return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
        }
        case "highest_value":
          return (Number(b.subtotal) || 0) - (Number(a.subtotal) || 0);
        case "lowest_value":
          return (Number(a.subtotal) || 0) - (Number(b.subtotal) || 0);
        case "highest_refund":
          return (Number(b.refund) || 0) - (Number(a.refund) || 0);
        default:
          return 0;
      }
    });
  }, [returns, q, type, method, from, to, sortBy]);

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
      setCopiedNum(num);
      showToast("info", `Copied ${num}`);
      setTimeout(() => setCopiedNum(null), 2000);
    } catch {
      showToast("error", "Could not copy");
    }
  }

  function toggleReturnSort(col: "date" | "value" | "refund") {
    if (col === "date") {
      setSortBy(sortBy === "newest" ? "oldest" : "newest");
    } else if (col === "value") {
      setSortBy(sortBy === "highest_value" ? "lowest_value" : "highest_value");
    } else if (col === "refund") {
      setSortBy(sortBy === "highest_refund" ? "newest" : "highest_refund");
    }
  }

  const selectClass =
    "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-500/20 dark:bg-rose-950/50 dark:text-rose-400">
              <RotateCcw className="h-4 w-4" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Returns & Credit Register
            </h1>
            <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-700 ring-1 ring-rose-500/20 dark:bg-rose-950/60 dark:text-rose-300">
              AFTER-SALES REGISTER
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Customer returns, refunds & khata adjustments restocked automatically with Moving WAC parity.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/invoices"
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-rose-500/20 transition hover:bg-rose-700 active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Return (From Invoice)</span>
          </Link>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-95 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>Export CSV</span>
          </button>
          <CompactToggle value={compact} onChange={setCompact} storageKey="sccomm-returns-compact" />
          <ViewToggle value={view} onChange={setView} storageKey="sccomm-returns-view" />
        </div>
      </div>

      {/* 4 Hero Bento Metric Cards (Default Light Theme) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Returns */}
        <div
          onClick={() => setQ("")}
          className="relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-md dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Total Returns
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
              <RotateCcw className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-black tracking-tight tabular-nums text-slate-900 dark:text-white">
            {inr(stats.value)}
          </p>
          <p className="mt-1 text-xs text-slate-400 font-medium">
            {stats.count} return documents ({filtered.length} in view)
          </p>
        </div>

        {/* Refunded Cash */}
        <div
          onClick={() => setType("refunded")}
          className="relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-md dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              Refunded Cash
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-black tracking-tight tabular-nums text-purple-700 dark:text-purple-300">
            {inr(stats.refunded)}
          </p>
          <p className="mt-1 text-xs text-slate-400 font-medium">
            {stats.refundCount} cash/bank refunds issued
          </p>
        </div>

        {/* Credit / Adjusted */}
        <div
          onClick={() => setType("credit")}
          className="relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-md dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Credit / Adjusted
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-black tracking-tight tabular-nums text-amber-700 dark:text-amber-300">
            {inr(stats.credit)}
          </p>
          <p className="mt-1 text-xs text-slate-400 font-medium">
            Customer khata ledger balance adjusted
          </p>
        </div>

        {/* This Month */}
        <div
          onClick={() => setQ(new Date().toISOString().slice(0, 7))}
          className="relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-md dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              This Month
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-black tracking-tight tabular-nums text-slate-900 dark:text-white">
            {stats.monthCount}
          </p>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>{inr(stats.monthValue)} value</span>
            {monthTrend !== null && (
              <span className={`inline-flex items-center gap-0.5 font-bold ${monthTrend >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {monthTrend >= 0 ? <ArrowUpRight className="h-3 w-3 inline" /> : <ArrowDownRight className="h-3 w-3 inline" />}
                {Math.abs(monthTrend)}% vs last mo
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filter Toolbar with Sorting Controls */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search return #, invoice #, customer, mobile or reason…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-8 text-xs font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold dark:bg-slate-800">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setType(f.key)}
                  className={`rounded-lg px-2.5 py-1 transition ${
                    type === f.key
                      ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none transition focus:border-rose-500 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">All Methods</option>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {m.toUpperCase()}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-rose-500 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
              title="From date"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-rose-500 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
              title="To date"
            />

            {/* Sorting Dropdown (Newest First Default) */}
            <div className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/50 px-2.5 py-1 dark:border-rose-900 dark:bg-rose-950/30">
              <ArrowUpDown className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as ReturnSortKey)}
                aria-label="Sort Returns"
                className="bg-transparent text-xs font-black text-rose-700 outline-none dark:text-rose-300"
              >
                <option value="newest">Newest First (Default)</option>
                <option value="oldest">Oldest First</option>
                <option value="highest_value">Highest Value</option>
                <option value="lowest_value">Lowest Value</option>
                <option value="highest_refund">Highest Refund</option>
              </select>
            </div>

            {(q || type !== "all" || method !== "all" || from || to || sortBy !== "newest") && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setType("all");
                  setMethod("all");
                  setFrom("");
                  setTo("");
                  setSortBy("newest");
                }}
                className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* List Table vs Cards View */}
      {view === "list" ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-white/10 dark:bg-slate-900">
          <table className={`w-full text-left text-xs ${compact ? "rows-compact" : ""}`}>
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3">Return #</th>
                <th className="px-5 py-3">Invoice</th>
                <th className="px-5 py-3">Customer</th>
                <th
                  onClick={() => toggleReturnSort("date")}
                  className="cursor-pointer px-5 py-3 select-none hover:text-slate-900 dark:hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    <span>Date</span>
                    {sortBy === "newest" ? (
                      <ArrowDown className="h-3 w-3 text-rose-600" />
                    ) : sortBy === "oldest" ? (
                      <ArrowUp className="h-3 w-3 text-rose-600" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => toggleReturnSort("value")}
                  className="cursor-pointer px-5 py-3 text-right select-none hover:text-slate-900 dark:hover:text-white"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Value</span>
                    {sortBy === "highest_value" ? (
                      <ArrowDown className="h-3 w-3 text-rose-600" />
                    ) : sortBy === "lowest_value" ? (
                      <ArrowUp className="h-3 w-3 text-rose-600" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => toggleReturnSort("refund")}
                  className="cursor-pointer px-5 py-3 select-none hover:text-slate-900 dark:hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    <span>Refund</span>
                    {sortBy === "highest_refund" ? (
                      <ArrowDown className="h-3 w-3 text-rose-600" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </div>
                </th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filtered.map((r) => {
                const hasRefund = Number(r.refund) > 0;
                return (
                  <tr key={r.id} className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50/75 dark:border-white/5 dark:hover:bg-white/5">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                          {r.return_number}
                        </span>
                        <button
                          type="button"
                          title="Copy return number"
                          onClick={() => copyNumber(r.return_number)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                        >
                          {copiedNum === r.return_number ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-indigo-600 dark:text-indigo-400">
                      {r.invoices?.invoice_number ? (
                        <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                          {r.invoices.invoice_number}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-800 dark:text-slate-200">
                      <div className="font-bold">{r.invoices?.customers?.name ?? "Walk-in Customer"}</div>
                      {r.invoices?.customers?.phone && (
                        <div className="text-[11px] font-mono text-slate-400">{r.invoices.customers.phone}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-500">{r.return_date}</td>
                    <td className="px-5 py-3.5 text-right font-mono font-black text-slate-900 dark:text-white">
                      {inr(r.subtotal)}
                    </td>
                    <td className="px-5 py-3.5">
                      {hasRefund ? (
                        <span className="font-mono font-bold text-purple-700 dark:text-purple-300">
                          {inr(r.refund)}{" "}
                          <span className="text-[10px] font-bold rounded-md bg-purple-100 px-1.5 py-0.5 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                            {r.refund_method?.toUpperCase()}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                          hasRefund
                            ? "bg-purple-50 text-purple-700 ring-1 ring-purple-500/20 dark:bg-purple-950/60 dark:text-purple-300"
                            : "bg-amber-50 text-amber-700 ring-1 ring-amber-500/20 dark:bg-amber-950/60 dark:text-amber-300"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${hasRefund ? "bg-purple-500" : "bg-amber-500"} animate-pulse`} />
                        {hasRefund ? "Refunded" : "Credit"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewId(r.id)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-95 duration-150 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <Eye className="h-3.5 w-3.5 text-indigo-500" />
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center text-xs text-slate-400">
                    No return documents match your current search filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => {
            const hasRefund = Number(r.refund) > 0;
            return (
              <div
                key={r.id}
                className={`group relative overflow-hidden rounded-2xl border bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900 ${
                  hasRefund ? "card-glow-purple border-purple-500/20 dark:border-purple-500/30" : "card-glow-amber border-amber-500/20 dark:border-amber-500/30"
                }`}
              >
                <div
                  className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${
                    hasRefund ? "from-purple-500 to-indigo-600" : "from-amber-500 to-orange-600"
                  }`}
                />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-black text-slate-900 dark:text-white">{r.return_number}</p>
                    <p className="truncate text-xs text-slate-400 mt-0.5">
                      {r.invoices?.customers?.name ?? "Walk-in Customer"}
                      {r.invoices?.customers?.phone ? ` · ${r.invoices.customers.phone}` : ""} · Inv: {r.invoices?.invoice_number ?? "—"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      hasRefund
                        ? "bg-purple-50 text-purple-700 ring-1 ring-purple-500/20 dark:bg-purple-950/60 dark:text-purple-300"
                        : "bg-amber-50 text-amber-700 ring-1 ring-amber-500/20 dark:bg-amber-950/60 dark:text-amber-300"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${hasRefund ? "bg-purple-500" : "bg-amber-500"} animate-pulse`} />
                    {hasRefund ? "Refunded" : "Credit"}
                  </span>
                </div>

                {r.reason && (
                  <p className="mt-3 truncate rounded-xl bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                    {r.reason}
                  </p>
                )}

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Return value</p>
                    <p className="font-mono text-xl font-black tracking-tight text-slate-900 dark:text-white">{inr(r.subtotal)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Refund</p>
                    <p className="font-mono text-sm font-bold text-purple-600 dark:text-purple-400">
                      {hasRefund ? (
                        <>
                          {inr(r.refund)}{" "}
                          <span className="text-[10px] font-bold rounded-md bg-purple-100 px-1 py-0.5 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                            {r.refund_method?.toUpperCase()}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/5">
                  <span className="font-mono text-xs text-slate-400">{r.return_date}</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setViewId(r.id)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-95 duration-150 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Eye className="h-3.5 w-3.5 text-indigo-500" />
                      View
                    </button>
                    <button
                      onClick={() => copyNumber(r.return_number)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-95 duration-150 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Copy className="h-3.5 w-3.5 text-slate-400" />
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-200 py-16 text-center text-xs text-slate-400 dark:border-white/10">
              No return documents match your current search filters.
            </div>
          )}
        </div>
      )}

      {viewId && <ReturnDetailModal returnId={viewId} onClose={() => setViewId(null)} />}
      {toastView}
    </div>
  );
}