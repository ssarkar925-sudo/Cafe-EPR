"use client";

import { useMemo } from "react";
import Link from "next/link";
import { inr } from "@/lib/format";

const POOL_META: Record<string, { label: string; icon: string; color: string; bg: string; border: string }> = {
  cash:        { label: "Cash Drawer",    icon: "M2 8h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Zm10-3V5H4a2 2 0 0 0-2 2",          color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/40",   border: "border-emerald-200 dark:border-emerald-500/30" },
  bank:        { label: "Bank Accounts",  icon: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01",                          color: "text-blue-700 dark:text-blue-300",     bg: "bg-blue-50 dark:bg-blue-950/40",         border: "border-blue-200 dark:border-blue-500/30" },
  upi_qr:      { label: "UPI / QR Float", icon: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14h1M14 20h1M20 20h1",                                 color: "text-cyan-700 dark:text-cyan-300",     bg: "bg-cyan-50 dark:bg-cyan-950/40",         border: "border-cyan-200 dark:border-cyan-500/30" },
  wallet:      { label: "Wallets",        icon: "M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M3 10h18M16 15h2",                 color: "text-amber-700 dark:text-amber-300",   bg: "bg-amber-50 dark:bg-amber-950/40",       border: "border-amber-200 dark:border-amber-500/30" },
  credit_card: { label: "Credit Cards",   icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z",               color: "text-rose-700 dark:text-rose-300",     bg: "bg-rose-50 dark:bg-rose-950/40",         border: "border-rose-200 dark:border-rose-500/30" },
  dmt:         { label: "DMT Float",      icon: "M22 2 11 13M22 2 15 22l-4-9-9-4z",                                                                            color: "text-fuchsia-700 dark:text-fuchsia-300", bg: "bg-fuchsia-50 dark:bg-fuchsia-950/40", border: "border-fuchsia-200 dark:border-fuchsia-500/30" },
  aeps:        { label: "AEPS Float",     icon: "M4 10h16M4 14h16M6 18V7m4 11V7m4 11V7M2 7l10-5 10 5z",                                                        color: "text-orange-700 dark:text-orange-300", bg: "bg-orange-50 dark:bg-orange-950/40",    border: "border-orange-200 dark:border-orange-500/30" },
};

const QUICK_LINKS = [
  { href: "/finance/cashbook",       label: "Daily Cash Book",    icon: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z", color: "text-emerald-600" },
  { href: "/finance/journal",        label: "Double-Entry Journal", icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",                                color: "text-indigo-600" },
  { href: "/finance/settlements",    label: "Settlements & Float", icon: "M3 7l7-4 7 4 4-2v13l-4 2-7-4-7 4V7zM10 3v13m7-11v13",                              color: "text-blue-600" },
  { href: "/finance/trial-balance",  label: "Trial Balance",       icon: "M3 3v18h18M7 14l4-4 3 3 5-6",                                                      color: "text-violet-600" },
  { href: "/finance/expenses",       label: "Expenses",            icon: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z", color: "text-amber-600" },
  { href: "/finance/pnl",           label: "P&L Report",          icon: "M3 3v18h18M7 14l4-4 3 3 5-6",                                                       color: "text-teal-600" },
  { href: "/finance/ledger",         label: "General Ledger",      icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-3 7h4m-4 4h4m-6-4h.01M9 16h.01", color: "text-slate-600" },
  { href: "/finance/reconciliation", label: "Reconciliation",      icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", color: "text-green-600" },
  { href: "/finance/opening-balances", label: "Opening Balances", icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",                        color: "text-sky-600" },
  { href: "/finance/accounts",       label: "Payment Accounts",    icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z", color: "text-purple-600" },
  { href: "/finance/day-close",      label: "Day Close",           icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M12 12v5M9.5 14.5 12 12l2.5 2.5", color: "text-red-600" },
  { href: "/reports",                label: "Reports & Analytics", icon: "M18 20V10M12 20V4M6 20v-6",                                                         color: "text-orange-600" },
];

const REF_TYPE_LABEL: Record<string, string> = {
  transaction: "Service",
  invoice: "Invoice",
  expense: "Expense",
  settlement: "Settlement",
  adjustment: "Adjustment",
  opening: "Opening",
};

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-5 w-5"}>
      <path d={d} />
    </svg>
  );
}

export default function FinanceDashboardClient({
  poolBalances,
  instruments,
  todayInflow,
  todayOutflow,
  todayNetMargin,
  monthExpenseTotal,
  pendingSettlements,
  recentEntries,
}: {
  poolBalances: any;
  instruments: any[];
  todayInflow: number;
  todayOutflow: number;
  todayNetMargin: number;
  monthExpenseTotal: number;
  pendingSettlements: any[];
  recentEntries: any[];
}) {
  const pools = useMemo(() => {
    return Object.entries(POOL_META).map(([key, meta]) => {
      const poolData = poolBalances?.[key];
      const current = Number(poolData?.current ?? 0);
      const opening = Number(poolData?.opening ?? 0);
      const movement = current - opening;
      return { key, ...meta, current, opening, movement };
    });
  }, [poolBalances]);

  const totalCapital = pools.reduce((s, p) => s + p.current, 0);

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Finance Hub</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Authoritative financial command centre — all money flows, accounts, and reports</p>
        </div>
        <Link href="/finance/day-close" className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition shadow">
          <Icon d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M12 12v5M9.5 14.5 12 12l2.5 2.5" className="h-4 w-4" />
          Day Close
        </Link>
      </div>

      {/* Today's P&L Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Today's Inflow", value: todayInflow,       color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-200 dark:border-emerald-500/30", icon: "M7 11l5-5 5 5M12 18V6" },
          { label: "Today's Outflow", value: todayOutflow,     color: "text-rose-700 dark:text-rose-300",       bg: "bg-rose-50 dark:bg-rose-950/40",       border: "border-rose-200 dark:border-rose-500/30",       icon: "M17 13l-5 5-5-5M12 6v12" },
          { label: "Today's Net",     value: todayNetMargin,   color: todayNetMargin >= 0 ? "text-blue-700 dark:text-blue-300" : "text-orange-700 dark:text-orange-300", bg: "bg-blue-50 dark:bg-blue-950/40", border: "border-blue-200 dark:border-blue-500/30", icon: "M3 3v18h18M7 14l4-4 3 3 5-6" },
          { label: "Month Expenses",  value: monthExpenseTotal, color: "text-amber-700 dark:text-amber-300",   bg: "bg-amber-50 dark:bg-amber-950/40",     border: "border-amber-200 dark:border-amber-500/30",     icon: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z" },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-2xl border ${stat.border} ${stat.bg} p-5`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon d={stat.icon} className={`h-4 w-4 ${stat.color}`} />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{stat.label}</span>
            </div>
            <div className={`text-2xl font-bold ${stat.color}`}>{inr(stat.value)}</div>
          </div>
        ))}
      </div>

      {/* 7-Pool Balance Matrix */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">7-Pool Capital Matrix</h2>
          <span className="text-xs text-slate-500">Total Capital: <span className="font-bold text-slate-800 dark:text-slate-200">{inr(totalCapital)}</span></span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {pools.map((pool) => (
            <div key={pool.key} className={`rounded-2xl border ${pool.border} ${pool.bg} p-4 flex flex-col gap-1`}>
              <Icon d={pool.icon} className={`h-5 w-5 ${pool.color} mb-1`} />
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{pool.label}</div>
              <div className={`text-lg font-bold ${pool.color}`}>{inr(pool.current)}</div>
              <div className={`text-[11px] font-medium ${pool.movement >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {pool.movement >= 0 ? "▲" : "▼"} {inr(Math.abs(pool.movement))} today
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pending Settlements Alert */}
      {pendingSettlements.length > 0 && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">{pendingSettlements.length} Pending Settlement{pendingSettlements.length > 1 ? "s" : ""}</span>
            <Link href="/finance/settlements" className="ml-auto text-xs font-medium text-amber-700 hover:text-amber-900 dark:text-amber-300 underline">View All →</Link>
          </div>
          <div className="space-y-1">
            {pendingSettlements.slice(0, 3).map((s) => (
              <div key={s.id} className="text-xs text-amber-700 dark:text-amber-300">
                {s.settlement_number} — {s.settlement_type} — {inr(Number(s.amount))} from {s.from_pool} → {s.to_pool}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Navigation Grid */}
      <div>
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">Finance Modules</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-4 flex flex-col items-start gap-2 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300 dark:hover:border-white/20 transition group"
            >
              <Icon d={link.icon} className={`h-5 w-5 ${link.color} group-hover:scale-110 transition-transform`} />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-tight">{link.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Journal Entries */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">Recent Entries</h2>
          <Link href="/finance/journal" className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 underline">Full Journal →</Link>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Account</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Description</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/10">
              {recentEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">No journal entries yet</td>
                </tr>
              ) : (
                recentEntries.map((entry: any) => (
                  <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{entry.entry_date}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                      {entry.payment_instruments?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        entry.direction === "in"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                      }`}>
                        {entry.direction === "in" ? "↑ Inflow" : "↓ Outflow"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                      <span className="text-xs text-slate-400 mr-1">[{REF_TYPE_LABEL[entry.ref_type] ?? entry.ref_type ?? "—"}]</span>
                      {entry.description ?? "—"}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${
                      entry.direction === "in" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
                    }`}>
                      {entry.direction === "in" ? "+" : "−"}{inr(Number(entry.amount ?? 0))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
