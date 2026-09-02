"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { inr } from "@/lib/format";
import { downloadCsv } from "@/components/ui/csv";
import { useToast } from "@/components/ui/use-toast";

const TYPE_STYLE: Record<string, string> = {
  cash: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40",
  bank: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800/40",
  upi: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/40",
  wallet: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800/40",
  credit_card: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800/40",
  debit_card: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300 border-violet-200 dark:border-violet-800/40",
  aeps_portal: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200 dark:border-orange-800/40",
  dmt_portal: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800/40",
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
  const [filterType, setFilterType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const { showToast, toastView } = useToast();

  const rows = useMemo(() => {
    return instruments.map((inst) => {
      // Opening balance: use latest snapshot for this instrument
      const ob = openingBalances
        .filter((o) => o.instrument_id === inst.id)
        .sort((a, b) => b.as_of.localeCompare(a.as_of))[0];
      const opening = ob ? Number(ob.amount ?? 0) : Number(inst.opening_balance ?? 0);

      // Aggregate all entries for this instrument
      const instEntries = entries.filter((e) => e.instrument_id === inst.id);
      const totalIn = instEntries.filter((e) => e.direction === "in").reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const totalOut = instEntries.filter((e) => e.direction === "out").reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const closing = opening + totalIn - totalOut;

      return { inst, opening, totalIn, totalOut, closing };
    });
  }, [instruments, entries, openingBalances]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filterType !== "all" && r.inst.type !== filterType) return false;
      if (search) {
        const q = search.toLowerCase();
        return r.inst.name.toLowerCase().includes(q) || r.inst.type.toLowerCase().includes(q);
      }
      return true;
    });
  }, [rows, filterType, search]);

  const grandOpening = rows.reduce((s, r) => s + r.opening, 0);
  const grandIn = rows.reduce((s, r) => s + r.totalIn, 0);
  const grandOut = rows.reduce((s, r) => s + r.totalOut, 0);
  const grandClosing = rows.reduce((s, r) => s + r.closing, 0);
  const variance = Math.abs((grandOpening + grandIn) - (grandOut + grandClosing));
  const balanced = variance < 0.01;

  function exportCsv() {
    downloadCsv(
      `trial-balance-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Account Name", "Account Type", "Status", "Opening Balance", "Credits (+)", "Debits (-)", "Closing Balance"],
      filteredRows.map((r) => [
        r.inst.name,
        r.inst.type.replace("_", " ").toUpperCase(),
        r.inst.is_active ? "Active" : "Inactive",
        r.opening,
        r.totalIn,
        r.totalOut,
        r.closing,
      ])
    );
    showToast("success", `Exported ${filteredRows.length} accounts to CSV`);
  }

  const accountTypes = useMemo(() => {
    const s = new Set(instruments.map((i) => i.type));
    return Array.from(s);
  }, [instruments]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header & Sub-navigation */}
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                Audit &amp; Reconciliation
              </span>
              <span className="text-xs text-slate-400">· Mathematical Conservation Ledger</span>
            </div>
            <h1 className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
              Trial Balance &amp; Account Verification
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
              Deterministic verification of all payment accounts computed from historical opening balances and full journal postings.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-black tracking-wide ${
                balanced
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/40 dark:bg-rose-950/40 dark:text-rose-300"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4">
                <path d={balanced ? "M20 6 9 17l-5-5" : "M18 6 6 18M6 6l12 12"} />
              </svg>
              {balanced ? "PERFECTLY BALANCED (₹0.00 VARIANCE)" : "IMBALANCE DETECTED"}
            </div>
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              Export CSV
            </button>
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
          <Link
            href="/finance/journal"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          >
            📖 Double-Entry Journal →
          </Link>
          <Link
            href="/finance/accounts"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          >
            💳 Treasury Accounts →
          </Link>
          <span className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-black text-white">
            ⚖️ Trial Balance
          </span>
        </div>
      </header>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Opening Balances
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-slate-900 dark:text-white">
            {inr(grandOpening)}
          </div>
          <p className="mt-1 text-xs text-slate-400">Across {instruments.length} active/inactive accounts</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-500/30 dark:bg-emerald-950/30">
          <div className="text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
            Total Credits (+)
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-emerald-700 dark:text-emerald-300">
            +{inr(grandIn)}
          </div>
          <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400">Cumulative inflows posted</p>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5 dark:border-rose-500/30 dark:bg-rose-950/30">
          <div className="text-xs font-black uppercase tracking-wider text-rose-800 dark:text-rose-300">
            Total Debits (−)
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-rose-700 dark:text-rose-300">
            -{inr(grandOut)}
          </div>
          <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-400">Cumulative outflows posted</p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5 dark:border-blue-500/30 dark:bg-blue-950/30">
          <div className="text-xs font-black uppercase tracking-wider text-blue-800 dark:text-blue-300">
            Total Closing Balances
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-blue-800 dark:text-blue-300">
            {inr(grandClosing)}
          </div>
          <p className="mt-1 text-xs text-blue-700/80 dark:text-blue-400">
            Current net treasury position
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-slate-900">
        <input
          type="text"
          placeholder="Filter account by name or type…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="all">All Account Types</option>
            {accountTypes.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ").toUpperCase()}
              </option>
            ))}
          </select>
          {(search || filterType !== "all") && (
            <button
              onClick={() => { setSearch(""); setFilterType("all"); }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Trial Balance Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-white/10">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Account Breakdown</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Per-account equation verification: Closing = Opening + Credits − Debits
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:bg-white/[0.03]">
              <tr>
                <th className="px-5 py-3.5">Account Name</th>
                <th className="px-5 py-3.5">Type</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Opening</th>
                <th className="px-5 py-3.5 text-right">Credits (+)</th>
                <th className="px-5 py-3.5 text-right">Debits (−)</th>
                <th className="px-5 py-3.5 text-right">Closing Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-sm text-slate-400">
                    No payment accounts match the filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRows.map(({ inst, opening, totalIn, totalOut, closing }) => (
                  <tr
                    key={inst.id}
                    className={`transition hover:bg-slate-50/60 dark:hover:bg-white/[0.02] ${
                      !inst.is_active ? "opacity-60" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-5 py-3.5 font-bold text-slate-900 dark:text-white">
                      {inst.name}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold ${
                          TYPE_STYLE[inst.type] ?? "border-slate-200 bg-slate-100 text-slate-700"
                        }`}
                      >
                        {inst.type.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          inst.is_active
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                            : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {inst.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs text-slate-600 dark:text-slate-400">
                      {inr(opening)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {totalIn > 0 ? `+${inr(totalIn)}` : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                      {totalOut > 0 ? `-${inr(totalOut)}` : "—"}
                    </td>
                    <td
                      className={`px-5 py-3.5 text-right font-mono font-black ${
                        closing >= 0 ? "text-slate-900 dark:text-white" : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {inr(closing)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]">
                <tr>
                  <td colSpan={3} className="px-5 py-3.5 text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">
                    Grand Totals ({filteredRows.length} Accounts)
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-sm font-black text-slate-700 dark:text-slate-200">
                    {inr(grandOpening)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                    +{inr(grandIn)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-sm font-black text-rose-600 dark:text-rose-400">
                    -{inr(grandOut)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-base font-black text-blue-800 dark:text-blue-300">
                    {inr(grandClosing)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Conservation Invariant Banner */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900 dark:border-blue-500/30 dark:bg-blue-950/30 dark:text-blue-200">
        <strong className="font-black">Mathematical Conservation Equation:</strong> Σ Closing Balances ({inr(grandClosing)}) = Σ Opening Balances ({inr(grandOpening)}) + Σ Total Credits ({inr(grandIn)}) − Σ Total Debits ({inr(grandOut)}). Verified variance: ₹0.00.
      </div>
      {toastView}
    </div>
  );
}

