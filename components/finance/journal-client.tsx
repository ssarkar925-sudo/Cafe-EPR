"use client";

import { useMemo, useState } from "react";
import { inr } from "@/lib/format";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash", upi: "UPI", bank: "Bank", wallet: "Wallet",
  credit_card: "Card", debit_card: "Debit", khata: "Khata",
};

const REF_TYPE_LABEL: Record<string, string> = {
  transaction: "Service Txn", invoice: "Invoice", expense: "Expense",
  settlement: "Settlement", adjustment: "Adjustment", opening: "Opening Bal",
};

const DIR_STYLE: Record<string, string> = {
  in:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  out: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
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

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-5 w-5"}>
      <path d={d} />
    </svg>
  );
}

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

  const totalIn  = filtered.filter((e) => e.direction === "in").reduce((s, e) => s + Number(e.amount), 0);
  const totalOut = filtered.filter((e) => e.direction === "out").reduce((s, e) => s + Number(e.amount), 0);

  const refTypes = useMemo(() => {
    const s = new Set(initialEntries.map((e) => e.ref_type).filter(Boolean));
    return Array.from(s) as string[];
  }, [initialEntries]);

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Double-Entry Journal</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Authoritative ledger of every inflow and outflow across all accounts</p>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Inflow",  value: totalIn,           color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-200 dark:border-emerald-500/30" },
          { label: "Total Outflow", value: totalOut,          color: "text-rose-700 dark:text-rose-300",       bg: "bg-rose-50 dark:bg-rose-950/40",       border: "border-rose-200 dark:border-rose-500/30" },
          { label: "Net",           value: totalIn - totalOut, color: (totalIn - totalOut) >= 0 ? "text-blue-700 dark:text-blue-300" : "text-orange-700 dark:text-orange-300", bg: "bg-blue-50 dark:bg-blue-950/40", border: "border-blue-200 dark:border-blue-500/30" },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border ${s.border} ${s.bg} p-4`}>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{s.label}</div>
            <div className={`text-xl font-bold ${s.color}`}>{inr(s.value)}</div>
            <div className="text-xs text-slate-400">{filtered.length} entries shown</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search description, account, ref…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select value={direction} onChange={(e) => setDirection(e.target.value as any)} className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200">
          <option value="all">All Directions</option>
          <option value="in">↑ Inflow Only</option>
          <option value="out">↓ Outflow Only</option>
        </select>
        <select value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)} className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200">
          <option value="all">All Accounts</option>
          {instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <select value={refType} onChange={(e) => setRefType(e.target.value)} className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200">
          <option value="all">All Entry Types</option>
          {refTypes.map((r) => <option key={r} value={r}>{REF_TYPE_LABEL[r] ?? r}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200" />
        <input type="date" value={dateTo}   onChange={(e) => setDateTo(e.target.value)}   className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200" />
        {(search || direction !== "all" || instrumentId !== "all" || refType !== "all" || dateFrom || dateTo) && (
          <button onClick={() => { setSearch(""); setDirection("all"); setInstrumentId("all"); setRefType("all"); setDateFrom(""); setDateTo(""); }} className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-500 hover:text-red-600 transition shadow-sm">
            Clear
          </button>
        )}
      </div>

      {/* Journal Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Account</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Direction</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Method</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Entry Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Description</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Debit (−)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Credit (+)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/10">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">No entries match the current filters</td></tr>
              ) : (
                filtered.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{entry.entry_date}</td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">{entry.payment_instruments?.name ?? <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DIR_STYLE[entry.direction]}`}>
                        {entry.direction === "in" ? "↑ Credit" : "↓ Debit"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{METHOD_LABEL[entry.method ?? ""] ?? entry.method ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{REF_TYPE_LABEL[entry.ref_type ?? ""] ?? entry.ref_type ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 max-w-[220px] truncate">{entry.description ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-rose-600 dark:text-rose-400">{entry.direction === "out" ? inr(Number(entry.amount)) : ""}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">{entry.direction === "in" ? inr(Number(entry.amount)) : ""}</td>
                  </tr>
                ))
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-400">Total ({filtered.length} entries)</td>
                  <td className="px-4 py-3 text-right font-bold text-rose-600 dark:text-rose-400">{inr(totalOut)}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">{inr(totalIn)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
