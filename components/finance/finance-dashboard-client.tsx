"use client";

import { useMemo } from "react";
import Link from "next/link";
import { inr } from "@/lib/format";

const POOL_META: Record<string, { label: string; icon: string; color: string; bg: string; border: string; grad: string; glow: string }> = {
  cash: { label: "Cash Drawer", icon: "M2 8h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Zm10-3V5H4a2 2 0 0 0-2 2", color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50/80 dark:bg-emerald-950/40", border: "border-emerald-200 dark:border-emerald-800/40", grad: "from-emerald-500 to-teal-600", glow: "card-glow-emerald" },
  bank: { label: "Bank Accounts", icon: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01", color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-50/80 dark:bg-blue-950/40", border: "border-blue-200 dark:border-blue-800/40", grad: "from-blue-500 to-indigo-600", glow: "card-glow-indigo" },
  upi_qr: { label: "UPI / QR Float", icon: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14h1M14 20h1M20 20h1", color: "text-cyan-700 dark:text-cyan-300", bg: "bg-cyan-50/80 dark:bg-cyan-950/40", border: "border-cyan-200 dark:border-cyan-800/40", grad: "from-cyan-500 to-teal-600", glow: "card-glow-cyan" },
  wallet: { label: "Wallets", icon: "M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M3 10h18M16 15h2", color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50/80 dark:bg-amber-950/40", border: "border-amber-200 dark:border-amber-800/40", grad: "from-amber-500 to-orange-600", glow: "card-glow-amber" },
  credit_card: { label: "Credit Cards", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z", color: "text-rose-700 dark:text-rose-300", bg: "bg-rose-50/80 dark:bg-rose-950/40", border: "border-rose-200 dark:border-rose-800/40", grad: "from-rose-500 to-pink-600", glow: "card-glow-rose" },
  dmt: { label: "DMT Float", icon: "M22 2 11 13M22 2 15 22l-4-9-9-4z", color: "text-fuchsia-700 dark:text-fuchsia-300", bg: "bg-fuchsia-50/80 dark:bg-fuchsia-950/40", border: "border-fuchsia-200 dark:border-fuchsia-800/40", grad: "from-fuchsia-500 to-purple-600", glow: "card-glow-purple" },
  aeps: { label: "AEPS Float", icon: "M4 10h16M4 14h16M6 18V7m4 11V7m4 11V7M2 7l10-5 10 5z", color: "text-orange-700 dark:text-orange-300", bg: "bg-orange-50/80 dark:bg-orange-950/40", border: "border-orange-200 dark:border-orange-800/40", grad: "from-orange-500 to-amber-600", glow: "card-glow-amber" },
};

const MODULE_GROUPS = [
  {
    title: "Operational Cash & Accounts",
    links: [
      { href: "/finance/cashbook", label: "Daily Cash Book", desc: "Counter drawer inflows & payouts", icon: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300" },
      { href: "/finance/expenses", label: "Operating Expenses", desc: "Shop spending vouchers & cash sync", icon: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z", color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300" },
      { href: "/finance/accounts", label: "Payment Accounts", desc: "Banks, UPI IDs, and digital wallets", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z", color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-300" },
      { href: "/finance/day-close", label: "Day Close Register", desc: "Shift reconciliation and cash lock", icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M12 12v5M9.5 14.5 12 12l2.5 2.5", color: "text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-300" },
    ],
  },
  {
    title: "Canonical Accounting & Ledgers",
    links: [
      { href: "/finance/journal", label: "Double-Entry Journal", desc: "Auditable credit & debit chronologies", icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01", color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-300" },
      { href: "/finance/general-ledger", label: "General Ledger", desc: "Account-level financial summaries", icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-3 7h4m-4 4h4m-6-4h.01M9 16h.01", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300" },
      { href: "/finance/trial-balance", label: "Trial Balance", desc: "Mathematical conservation verification", icon: "M3 3v18h18M7 14l4-4 3 3 5-6", color: "text-violet-600 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-300" },
      { href: "/finance/transactions", label: "Transaction Register", desc: "Low-level unified postings stream", icon: "M13 10V3L4 14h7v7l9-11h-7z", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300" },
    ],
  },
  {
    title: "Customer Credit & Treasury Control",
    links: [
      { href: "/finance/ledger", label: "Customer Due Khata", desc: "Customer credit balances & WhatsApp statements", icon: "M17 20h5v-2a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm6 3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM7 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0z", color: "text-teal-600 bg-teal-50 dark:bg-teal-950/40 dark:text-teal-300" },
      { href: "/finance/settlements", label: "Settlements & Float", desc: "Transfers between internal cash pools", icon: "M3 7l7-4 7 4 4-2v13l-4 2-7-4-7 4V7zM10 3v13m7-11v13", color: "text-sky-600 bg-sky-50 dark:bg-sky-950/40 dark:text-sky-300" },
      { href: "/finance/pnl", label: "P&L Statement", desc: "Revenues, cost of goods, and net margin", icon: "M18 20V10M12 20V4M6 20v-6", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300" },
      { href: "/finance/reconciliation", label: "Bank Reconciliation", desc: "Statement vs. ledger alignment", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", color: "text-green-600 bg-green-50 dark:bg-green-950/40 dark:text-green-300" },
    ],
  },
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
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <header className="bento-surface card-glow-indigo relative overflow-hidden rounded-3xl border p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="icon-box-3d flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-blue-600 to-indigo-700 text-white shadow-lg shadow-indigo-500/25">
              <Icon d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01" className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
                  </span>
                  Financial Operations &amp; Ledger
                </span>
                <span className="text-xs text-slate-400">· Canonical Treasury Hub</span>
              </div>
              <h1 className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
                Finance &amp; Treasury Command Hub
              </h1>
              <p className="mt-1 max-w-3xl text-xs text-slate-500 dark:text-slate-400">
                Authoritative command center for daily cash drawers, double-entry journals, operating expense disbursements, and customer dues.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/finance/day-close"
              className="btn-3d-tactile-primary flex items-center gap-2 px-5 py-2.5 text-xs font-black shadow-sm"
            >
              <Icon d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M12 12v5M9.5 14.5 12 12l2.5 2.5" className="h-4 w-4" />
              Day Close Register
            </Link>
          </div>
        </div>
      </header>

      {/* Today's P&L Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Today's Inflow",
            value: todayInflow,
            color: "text-emerald-700 dark:text-emerald-300",
            glow: "card-glow-emerald",
            iconBg: "from-emerald-500 to-teal-600",
            icon: "M7 11l5-5 5 5M12 18V6"
          },
          {
            label: "Today's Outflow",
            value: todayOutflow,
            color: "text-rose-700 dark:text-rose-300",
            glow: "card-glow-rose",
            iconBg: "from-rose-500 to-pink-600",
            icon: "M17 13l-5 5-5-5M12 6v12"
          },
          {
            label: "Today's Net Margin",
            value: todayNetMargin,
            color: todayNetMargin >= 0 ? "text-cyan-700 dark:text-cyan-300" : "text-amber-700 dark:text-amber-300",
            glow: todayNetMargin >= 0 ? "card-glow-cyan" : "card-glow-amber",
            iconBg: todayNetMargin >= 0 ? "from-cyan-500 to-blue-600" : "from-amber-500 to-orange-600",
            icon: "M3 3v18h18M7 14l4-4 3 3 5-6"
          },
          {
            label: "This Month Expenses",
            value: monthExpenseTotal,
            color: "text-amber-700 dark:text-amber-300",
            glow: "card-glow-amber",
            iconBg: "from-amber-500 to-orange-600",
            icon: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z"
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`bento-surface relative overflow-hidden rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 ${stat.glow}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{stat.label}</span>
              <div className={`icon-box-3d flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${stat.iconBg} text-white shadow-sm`}>
                <Icon d={stat.icon} className="h-4 w-4" />
              </div>
            </div>
            <div className={`mt-2 font-mono text-2xl font-black ${stat.color}`}>{inr(stat.value)}</div>
          </div>
        ))}
      </div>

      {/* 7-Pool Capital Matrix */}
      <div className="bento-surface card-glow-indigo relative overflow-hidden rounded-3xl border p-6">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">7-Pool Capital &amp; Treasury Matrix</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Live liquidity positions across all physical cash drawers and digital payment pools.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-indigo-200/80 bg-indigo-50/50 px-3.5 py-1.5 dark:border-indigo-900/40 dark:bg-indigo-950/20">
            <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">Total Liquid Capital:</span>
            <span className="font-mono text-sm font-black text-indigo-950 dark:text-white">{inr(totalCapital)}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {pools.map((pool) => (
            <div
              key={pool.key}
              className={`bento-surface ${pool.glow} relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}
            >
              <div className="flex items-center justify-between">
                <div className={`icon-box-3d flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${pool.grad} text-white shadow-sm`}>
                  <Icon d={pool.icon} className="h-4 w-4" />
                </div>
                <span className={`font-mono text-[10px] font-extrabold ${pool.movement >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                  {pool.movement >= 0 ? "▲" : "▼"} {inr(Math.abs(pool.movement))}
                </span>
              </div>
              <div className="mt-3">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{pool.label}</div>
                <div className={`mt-0.5 font-mono text-base font-black tracking-tight ${pool.color}`}>{inr(pool.current)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pending Settlements Alert */}
      {pendingSettlements.length > 0 && (
        <div className="bento-surface card-glow-amber relative overflow-hidden rounded-2xl border p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="icon-box-3d flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xs">
              <Icon d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-black text-amber-800 dark:text-amber-200">
              {pendingSettlements.length} Pending Settlement Voucher{pendingSettlements.length > 1 ? "s" : ""}
            </span>
            <Link href="/finance/settlements" className="ml-auto text-xs font-bold text-amber-700 underline hover:text-amber-900 dark:text-amber-300">
              Process Settlements →
            </Link>
          </div>
          <div className="space-y-1.5 pl-9">
            {pendingSettlements.slice(0, 3).map((s) => (
              <div key={s.id} className="text-xs font-medium text-amber-800 dark:text-amber-300">
                <span className="font-mono font-bold">{s.settlement_number}</span> · {s.settlement_type} · <span className="font-mono font-bold">{inr(Number(s.amount))}</span> from {s.from_pool} → {s.to_pool}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Navigation Groups */}
      <div className="space-y-6">
        {MODULE_GROUPS.map((group) => (
          <div key={group.title} className="bento-surface card-glow-indigo relative overflow-hidden rounded-3xl border p-6">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {group.title}
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {group.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex flex-col justify-between rounded-2xl border border-slate-100 bg-slate-50/60 p-4.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300/60 hover:bg-indigo-50/20 hover:shadow-md active:scale-98 dark:border-white/5 dark:bg-white/[0.02] dark:hover:border-indigo-500/40 dark:hover:bg-indigo-950/20"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className={`icon-box-3d flex h-9 w-9 items-center justify-center rounded-xl shadow-xs ${link.color}`}>
                        <Icon d={link.icon} className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-bold text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                        Open →
                      </span>
                    </div>
                    <div className="mt-3 font-black text-slate-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
                      {link.label}
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {link.desc}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity Table */}
      <div className="bento-surface card-glow-indigo overflow-hidden rounded-3xl border shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4 dark:border-white/10">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">Recent Journal Postings</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Latest synchronized ledger postings across all accounts</p>
          </div>
          <Link href="/finance/journal" className="text-xs font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">
            View Full Journal →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:bg-white/[0.03]">
              <tr>
                <th className="px-5 py-3.5">Date</th>
                <th className="px-5 py-3.5">Account</th>
                <th className="px-5 py-3.5">Flow Direction</th>
                <th className="px-5 py-3.5">Description</th>
                <th className="px-5 py-3.5 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {recentEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-400">
                    No journal entries recorded yet.
                  </td>
                </tr>
              ) : (
                recentEntries.map((entry: any) => (
                  <tr key={entry.id} className="transition hover:bg-slate-50/60 dark:hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                      {entry.entry_date}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 font-bold text-slate-800 dark:text-slate-200">
                      {entry.payment_instruments?.name ?? "Cash Drawer"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          entry.direction === "in"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                            : "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                        }`}
                      >
                        {entry.direction === "in" ? "↑ Inflow (+)" : "↓ Outflow (−)"}
                      </span>
                    </td>
                    <td className="max-w-[280px] truncate px-5 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                      <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        {REF_TYPE_LABEL[entry.ref_type] ?? entry.ref_type ?? "entry"}
                      </span>
                      {entry.description ?? "—"}
                    </td>
                    <td
                      className={`whitespace-nowrap px-5 py-3.5 text-right font-mono font-black ${
                        entry.direction === "in"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
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

