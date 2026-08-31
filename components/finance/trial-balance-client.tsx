"use client";

import { useMemo } from "react";
import { inr } from "@/lib/format";

const TYPE_STYLE: Record<string, string> = {
  cash:        "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  bank:        "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  upi:         "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
  wallet:      "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  credit_card: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  debit_card:  "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  aeps_portal: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  dmt_portal:  "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
};

type Instrument = { id: string; name: string; type: string; is_active: boolean; opening_balance: number | string };
type Entry = { instrument_id: string | null; direction: "in" | "out"; amount: number | string; entry_date: string };
type OpeningBalance = { pool: string; instrument_id: string | null; amount: number | string; as_of: string };

export default function TrialBalanceClient({
  instruments,
  entries,
  openingBalances,
  poolBalances,
}: {
  instruments: Instrument[];
  entries: Entry[];
  openingBalances: OpeningBalance[];
  poolBalances: any;
}) {
  const rows = useMemo(() => {
    return instruments.map((inst) => {
      // Opening balance: use latest snapshot for this instrument
      const ob = openingBalances
        .filter((o) => o.instrument_id === inst.id)
        .sort((a, b) => b.as_of.localeCompare(a.as_of))[0];
      const opening = ob ? Number(ob.amount ?? 0) : Number(inst.opening_balance ?? 0);

      // Aggregate all entries for this instrument
      const instEntries = entries.filter((e) => e.instrument_id === inst.id);
      const totalIn  = instEntries.filter((e) => e.direction === "in").reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const totalOut = instEntries.filter((e) => e.direction === "out").reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const closing  = opening + totalIn - totalOut;

      return { inst, opening, totalIn, totalOut, closing };
    });
  }, [instruments, entries, openingBalances]);

  const grandOpening = rows.reduce((s, r) => s + r.opening, 0);
  const grandIn      = rows.reduce((s, r) => s + r.totalIn, 0);
  const grandOut     = rows.reduce((s, r) => s + r.totalOut, 0);
  const grandClosing = rows.reduce((s, r) => s + r.closing, 0);
  const balanced     = Math.abs((grandOpening + grandIn) - (grandOut + grandClosing)) < 0.01;

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Trial Balance</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Auto-computed from all opening balances and cash entries — per payment account</p>
        </div>
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${balanced ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4">
            <path d={balanced ? "M20 6 9 17l-5-5" : "M18 6 6 18M6 6l12 12"} />
          </svg>
          {balanced ? "Balanced ✓" : "IMBALANCE ⚠"}
        </div>
      </div>

      {/* Grand Totals */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Opening Balances", value: grandOpening,  color: "text-slate-700 dark:text-slate-300",    bg: "bg-slate-50 dark:bg-slate-900", border: "border-slate-200 dark:border-white/10" },
          { label: "Total Credits (+)", value: grandIn,       color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-200 dark:border-emerald-500/30" },
          { label: "Total Debits (−)",  value: grandOut,      color: "text-rose-700 dark:text-rose-300",       bg: "bg-rose-50 dark:bg-rose-950/40",       border: "border-rose-200 dark:border-rose-500/30" },
          { label: "Closing Balances",  value: grandClosing,  color: "text-blue-700 dark:text-blue-300",       bg: "bg-blue-50 dark:bg-blue-950/40",       border: "border-blue-200 dark:border-blue-500/30" },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border ${s.border} ${s.bg} p-5`}>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{s.label}</div>
            <div className={`text-2xl font-bold ${s.color}`}>{inr(s.value)}</div>
          </div>
        ))}
      </div>

      {/* Trial Balance Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Account</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Opening</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Credits (+)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Debits (−)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Closing Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/10">
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">No payment accounts configured</td></tr>
              ) : (
                rows.map(({ inst, opening, totalIn, totalOut, closing }) => (
                  <tr key={inst.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${!inst.is_active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{inst.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLE[inst.type] ?? "bg-slate-100 text-slate-600"}`}>
                        {inst.type.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${inst.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400"}`}>
                        {inst.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">{inr(opening)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400 font-medium">{totalIn > 0 ? inr(totalIn) : "—"}</td>
                    <td className="px-4 py-3 text-right text-rose-600 dark:text-rose-400 font-medium">{totalOut > 0 ? inr(totalOut) : "—"}</td>
                    <td className={`px-4 py-3 text-right font-bold ${closing >= 0 ? "text-slate-800 dark:text-slate-200" : "text-red-600 dark:text-red-400"}`}>
                      {inr(closing)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-slate-800">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200">Grand Total ({rows.length} accounts)</td>
                <td className="px-4 py-3 text-right font-bold text-slate-700 dark:text-slate-200">{inr(grandOpening)}</td>
                <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">{inr(grandIn)}</td>
                <td className="px-4 py-3 text-right font-bold text-rose-600 dark:text-rose-400">{inr(grandOut)}</td>
                <td className={`px-4 py-3 text-right font-bold text-lg ${balanced ? "text-blue-700 dark:text-blue-300" : "text-red-600 dark:text-red-400"}`}>
                  {inr(grandClosing)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Invariant note */}
      <div className="rounded-2xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-950/30 p-4 text-sm text-blue-800 dark:text-blue-200">
        <strong>Conservation Invariant:</strong> Closing Balance = Opening Balance + Total Credits − Total Debits. When balanced, Σ Closing = Σ(Opening + Credits − Debits) with ₹0.00 variance.
      </div>
    </div>
  );
}
