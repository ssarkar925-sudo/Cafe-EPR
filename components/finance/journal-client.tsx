"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { inr } from "@/lib/format";
import { downloadCsv } from "@/components/ui/csv";
import { useToast } from "@/components/ui/use-toast";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank Transfer",
  wallet: "Wallet",
  credit_card: "Credit Card",
  debit_card: "Debit Card",
  khata: "Customer Khata",
  dmt: "DMT Float",
  aeps: "AEPS Float",
};

const REF_TYPE_LABEL: Record<string, string> = {
  transaction: "Service Txn",
  invoice: "POS Invoice",
  expense: "Operating Expense",
  settlement: "Pool Settlement",
  adjustment: "Ledger Adjustment",
  opening: "Opening Balance",
  purchase: "Vendor Purchase",
};

type Entry = {
  id: string;
  direction: "in" | "out";
  amount: number;
  method: string | null;
  description: string | null;
  entry_date: string;
  ref_type: string | null;
  ref_id: string | null;
  instrument_id: string | null;
  created_at: string;
  payment_instruments: { name: string; type: string } | null;
};

export default function JournalClient({
  initialEntries,
  instruments,
}: {
  initialEntries: Entry[];
  instruments: { id: string; name: string; type: string }[];
}) {
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [instrumentId, setInstrumentId] = useState("all");
  const [refType, setRefType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { showToast, toastView } = useToast();

  const filtered = useMemo(() => {
    return initialEntries.filter((e) => {
      if (direction !== "all" && e.direction !== direction) return false;
      if (instrumentId !== "all" && e.instrument_id !== instrumentId) return false;
      if (refType !== "all" && e.ref_type !== refType) return false;
      if (dateFrom && e.entry_date < dateFrom) return false;
      if (dateTo && e.entry_date > dateTo) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (e.description ?? "").toLowerCase().includes(q) ||
          (e.method ?? "").toLowerCase().includes(q) ||
          (e.ref_type ?? "").toLowerCase().includes(q) ||
          (e.ref_id ?? "").toLowerCase().includes(q) ||
          (e.payment_instruments?.name ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [initialEntries, direction, instrumentId, refType, search, dateFrom, dateTo]);

  const totalIn = filtered.filter((e) => e.direction === "in").reduce((s, e) => s + Number(e.amount), 0);
  const totalOut = filtered.filter((e) => e.direction === "out").reduce((s, e) => s + Number(e.amount), 0);
  const net = totalIn - totalOut;

  const refTypes = useMemo(() => {
    const s = new Set(initialEntries.map((e) => e.ref_type).filter(Boolean));
    return Array.from(s) as string[];
  }, [initialEntries]);

  function exportCsv() {
    downloadCsv(
      `journal-entries-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Date", "Account", "Direction", "Method", "Type", "Description", "Debit (-)", "Credit (+)"],
      filtered.map((e) => [
        e.entry_date,
        e.payment_instruments?.name ?? "General Till",
        e.direction === "in" ? "Credit" : "Debit",
        METHOD_LABEL[e.method ?? ""] ?? e.method ?? "-",
        REF_TYPE_LABEL[e.ref_type ?? ""] ?? e.ref_type ?? "-",
        e.description ?? "-",
        e.direction === "out" ? Number(e.amount) : 0,
        e.direction === "in" ? Number(e.amount) : 0,
      ])
    );
    showToast("success", `Exported ${filtered.length} journal lines to CSV`);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header & Sub-navigation */}
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                Formal Accounting Book
              </span>
              <span className="text-xs text-slate-400">· Double-Entry General Journal</span>
            </div>
            <h1 className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
              Double-Entry Financial Journal
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
              Authoritative financial posting ledger recording every debit and credit across all payment accounts, instruments, and subsidiary journals.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              Export CSV
            </button>
            <Link
              href="/finance/trial-balance"
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-indigo-700"
            >
              Verify Trial Balance →
            </Link>
          </div>
        </div>

        {/* Cross-Link Navigation Pills */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-white/5">
          <span className="text-xs font-bold text-slate-400">Jump to:</span>
          <Link
            href="/finance/cashbook"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          >
            💵 Counter Cashbook →
          </Link>
          <span className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-black text-white">
            📖 Double-Entry Journal
          </span>
          <Link
            href="/finance/general-ledger"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          >
            🏛️ General Ledger →
          </Link>
          <Link
            href="/finance/trial-balance"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          >
            ⚖️ Trial Balance →
          </Link>
        </div>
      </header>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-500/30 dark:bg-emerald-950/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Total Credits (+ Inflow)
            </span>
            <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-black text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200">
              {filtered.filter((e) => e.direction === "in").length} Lines
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-emerald-700 dark:text-emerald-300">
            +{inr(totalIn)}
          </div>
          <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400">
            Funds deposited into accounts &amp; revenue posted
          </p>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5 dark:border-rose-500/30 dark:bg-rose-950/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-rose-800 dark:text-rose-300">
              Total Debits (− Outflow)
            </span>
            <span className="rounded-full bg-rose-200 px-2 py-0.5 text-[10px] font-black text-rose-900 dark:bg-rose-900 dark:text-rose-200">
              {filtered.filter((e) => e.direction === "out").length} Lines
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-rose-700 dark:text-rose-300">
            -{inr(totalOut)}
          </div>
          <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-400">
            Disbursements, supplier payments &amp; operating costs
          </p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5 dark:border-blue-500/30 dark:bg-blue-950/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-blue-800 dark:text-blue-300">
              Net Journal Balance
            </span>
            <span className="rounded-full bg-blue-200 px-2 py-0.5 text-[10px] font-black text-blue-900 dark:bg-blue-900 dark:text-blue-200">
              {filtered.length} Total
            </span>
          </div>
          <div className={`mt-2 font-mono text-2xl font-black ${net >= 0 ? "text-blue-800 dark:text-blue-300" : "text-rose-700 dark:text-rose-300"}`}>
            {inr(net)}
          </div>
          <p className="mt-1 text-xs text-blue-700/80 dark:text-blue-400">
            Net monetary movement across selected filter period
          </p>
        </div>
      </div>

      {/* Filter and Query Tooling */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input
            type="text"
            placeholder="Search description, account, reference number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as any)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="all">All Directions</option>
              <option value="in">↑ Credit (Inflow)</option>
              <option value="out">↓ Debit (Outflow)</option>
            </select>
            <select
              value={instrumentId}
              onChange={(e) => setInstrumentId(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="all">All Accounts</option>
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <select
              value={refType}
              onChange={(e) => setRefType(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="all">All Entry Types</option>
              {refTypes.map((r) => (
                <option key={r} value={r}>
                  {REF_TYPE_LABEL[r] ?? r}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
          />
          <span className="text-xs font-bold text-slate-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
          />
          {(search || direction !== "all" || instrumentId !== "all" || refType !== "all" || dateFrom || dateTo) && (
            <button
              onClick={() => {
                setSearch("");
                setDirection("all");
                setInstrumentId("all");
                setRefType("all");
                setDateFrom("");
                setDateTo("");
              }}
              className="ml-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Journal Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-white/10">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Posted Journal Entries</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Canonical line-item postings with explicit Debit and Credit columns.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:bg-white/[0.03]">
              <tr>
                <th className="px-5 py-3.5">Date</th>
                <th className="px-5 py-3.5">Payment Account</th>
                <th className="px-5 py-3.5 text-center">Post Direction</th>
                <th className="px-5 py-3.5">Method</th>
                <th className="px-5 py-3.5">Entry Class</th>
                <th className="px-5 py-3.5">Narrative Description</th>
                <th className="px-5 py-3.5 text-right">Debit (−)</th>
                <th className="px-5 py-3.5 text-right">Credit (+)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center text-sm text-slate-400">
                    No entries match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => (
                  <tr key={entry.id} className="transition hover:bg-slate-50/60 dark:hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {entry.entry_date}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 font-bold text-slate-900 dark:text-white">
                      {entry.payment_instruments?.name ?? <span className="text-slate-400">General Drawer</span>}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-black uppercase tracking-wider ${
                          entry.direction === "in"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/40 dark:bg-rose-950/40 dark:text-rose-300"
                        }`}
                      >
                        {entry.direction === "in" ? "↑ Credit" : "↓ Debit"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {METHOD_LABEL[entry.method ?? ""] ?? entry.method ?? "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                        {REF_TYPE_LABEL[entry.ref_type ?? ""] ?? entry.ref_type ?? "—"}
                      </span>
                    </td>
                    <td className="max-w-[280px] px-5 py-3.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                      <div className="truncate">{entry.description ?? "—"}</div>
                      {entry.ref_id && (
                        <div className="font-mono text-[10px] text-slate-400">Ref: {entry.ref_id}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                      {entry.direction === "out" ? inr(Number(entry.amount)) : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {entry.direction === "in" ? inr(Number(entry.amount)) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]">
                <tr>
                  <td colSpan={6} className="px-5 py-3.5 text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">
                    Grand Totals for {filtered.length} Entries
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-sm font-black text-rose-600 dark:text-rose-400">
                    {inr(totalOut)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                    {inr(totalIn)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      {toastView}
    </div>
  );
}

