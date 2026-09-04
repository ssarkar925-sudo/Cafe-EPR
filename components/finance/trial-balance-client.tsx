"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { inr } from "@/lib/format";
import { downloadCsv } from "@/components/ui/csv";
import { useToast } from "@/components/ui/use-toast";

type Account = { id: string; code: string; name: string; account_type: string; is_active: boolean };
type JournalLine = { account_id: string; debit: number | string | null; credit: number | string | null; journal_entries?: { status?: string | null } | null };

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  income: "Income",
  expense: "Expense",
  contra_income: "Contra Income",
};

export default function TrialBalanceClient({ accounts, journalLines }: { accounts: Account[]; journalLines: JournalLine[] }) {
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
  const { showToast, toastView } = useToast();

  const rows = useMemo(() => accounts.map((account) => {
    const lines = journalLines.filter((line) => line.account_id === account.id);
    const debit = lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0);
    const credit = lines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0);
    const net = debit - credit;
    return { account, debit, credit, net, debitBalance: Math.max(net, 0), creditBalance: Math.max(-net, 0) };
  }), [accounts, journalLines]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    if (filterType !== "all" && row.account.account_type !== filterType) return false;
    const q = search.trim().toLowerCase();
    return !q || row.account.code.toLowerCase().includes(q) || row.account.name.toLowerCase().includes(q) || row.account.account_type.toLowerCase().includes(q);
  }), [rows, filterType, search]);

  const totals = useMemo(() => rows.reduce((sum, row) => ({
    debit: sum.debit + row.debit,
    credit: sum.credit + row.credit,
    debitBalance: sum.debitBalance + row.debitBalance,
    creditBalance: sum.creditBalance + row.creditBalance,
  }), { debit: 0, credit: 0, debitBalance: 0, creditBalance: 0 }), [rows]);

  const variance = Math.abs(totals.debit - totals.credit);
  const balanced = variance < 0.01;

  function exportCsv() {
    downloadCsv(
      `trial-balance-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Code", "Account Name", "Account Type", "Debit Total", "Credit Total", "Debit Balance", "Credit Balance", "Status"],
      filteredRows.map((r) => [r.account.code, r.account.name, ACCOUNT_TYPE_LABEL[r.account.account_type] ?? r.account.account_type, r.debit, r.credit, r.debitBalance, r.creditBalance, r.account.is_active ? "Active" : "Inactive"])
    );
    showToast("success", `Exported ${filteredRows.length} ledger accounts to CSV`);
  }

  const accountTypes = useMemo(() => Array.from(new Set(accounts.map((a) => a.account_type))), [accounts]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">Double-Entry Accounting</span>
              <span className="text-xs text-slate-400">· General Ledger Trial Balance</span>
            </div>
            <h1 className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">Trial Balance</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">All posted journal debits and credits by accounting account. This is the accounting trial balance, separate from Treasury account reconciliation.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-black shadow-xs ${balanced ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/40 dark:bg-rose-950/40 dark:text-rose-300"}`}>
              <span className={`h-2 w-2 rounded-full ${balanced ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
              {balanced ? "BALANCED · ₹0.00 VARIANCE" : `IMBALANCE · ${inr(variance)}`}
            </div>
            <button onClick={exportCsv} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5 active:scale-[0.98]">Export CSV</button>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-white/5">
          <span className="text-xs font-bold text-slate-400">Jump to:</span>
          <Link href="/finance/cashbook" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">💵 Cashbook →</Link>
          <Link href="/finance/journal" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">📖 Journal →</Link>
          <Link href="/finance/accounts" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">💳 Treasury Accounts →</Link>
          <span className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-black text-white shadow-xs">⚖️ Trial Balance</span>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="bento-surface relative overflow-hidden rounded-2xl border p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 card-glow-indigo dark:bg-slate-900">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
          <div className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Journal Debit</div>
          <div className="mt-2 font-mono text-2xl font-black text-slate-900 dark:text-white">{inr(totals.debit)}</div>
          <p className="mt-1 text-xs text-slate-400">Posted journal lines</p>
        </div>
        <div className="bento-surface relative overflow-hidden rounded-2xl border p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 card-glow-cyan dark:bg-slate-900">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-600" />
          <div className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Journal Credit</div>
          <div className="mt-2 font-mono text-2xl font-black text-slate-900 dark:text-white">{inr(totals.credit)}</div>
          <p className="mt-1 text-xs text-slate-400">Posted journal lines</p>
        </div>
        <div className="bento-surface relative overflow-hidden rounded-2xl border p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 card-glow-emerald dark:bg-slate-900">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
          <div className="text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Debit Balances</div>
          <div className="mt-2 font-mono text-2xl font-black text-emerald-700 dark:text-emerald-300">{inr(totals.debitBalance)}</div>
          <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400">Net debit-side accounts</p>
        </div>
        <div className="bento-surface relative overflow-hidden rounded-2xl border p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 card-glow-amber dark:bg-slate-900">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-orange-600" />
          <div className="text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">Credit Balances</div>
          <div className="mt-2 font-mono text-2xl font-black text-amber-700 dark:text-amber-300">{inr(totals.creditBalance)}</div>
          <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-400">Net credit-side accounts</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row dark:border-white/10 dark:bg-slate-900">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search account code, name or type…" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white" />
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold dark:border-white/10 dark:bg-slate-950 dark:text-white">
          <option value="all">All Account Types</option>
          {accountTypes.map((type) => <option key={type} value={type}>{ACCOUNT_TYPE_LABEL[type] ?? type}</option>)}
        </select>
      </div>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-white/10"><h2 className="text-lg font-black text-slate-900 dark:text-white">Account Trial Balance</h2><p className="text-xs text-slate-500 dark:text-slate-400">Debit and credit totals come directly from the double-entry journal.</p></div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500 dark:bg-white/[0.03]"><tr><th className="px-5 py-3.5 text-left">Code</th><th className="px-5 py-3.5 text-left">Account</th><th className="px-5 py-3.5 text-left">Type</th><th className="px-5 py-3.5 text-right">Debit</th><th className="px-5 py-3.5 text-right">Credit</th><th className="px-5 py-3.5 text-right">Debit Balance</th><th className="px-5 py-3.5 text-right">Credit Balance</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredRows.map((row) => <tr key={row.account.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]"><td className="px-5 py-3 font-mono text-xs text-slate-500">{row.account.code}</td><td className="px-5 py-3 font-bold text-slate-900 dark:text-white">{row.account.name}</td><td className="px-5 py-3 text-xs text-slate-500">{ACCOUNT_TYPE_LABEL[row.account.account_type] ?? row.account.account_type}</td><td className="px-5 py-3 text-right font-mono">{inr(row.debit)}</td><td className="px-5 py-3 text-right font-mono">{inr(row.credit)}</td><td className="px-5 py-3 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-300">{row.debitBalance ? inr(row.debitBalance) : "—"}</td><td className="px-5 py-3 text-right font-mono font-semibold text-blue-700 dark:text-blue-300">{row.creditBalance ? inr(row.creditBalance) : "—"}</td></tr>)}
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-black dark:border-white/20 dark:bg-white/[0.04]"><td className="px-5 py-4" colSpan={3}>TOTAL</td><td className="px-5 py-4 text-right font-mono">{inr(totals.debit)}</td><td className="px-5 py-4 text-right font-mono">{inr(totals.credit)}</td><td className="px-5 py-4 text-right font-mono">{inr(totals.debitBalance)}</td><td className="px-5 py-4 text-right font-mono">{inr(totals.creditBalance)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      {toastView}
    </div>
  );
}
