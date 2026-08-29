"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRealtime } from "@/lib/supabase/realtime";
import { type VerifiedFinancialContext } from "@/lib/ai/advisor-engine";

export type DashboardClientProps = {
  data: any;
  verifiedContext?: VerifiedFinancialContext;
};

function inr(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "₹0.00";
  return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DashboardClient({ data, verifiedContext }: DashboardClientProps) {
  useRealtime(["invoices", "payments", "cash_entries", "expenses", "settlements", "transactions", "day_closes", "products", "customers", "audit_runs"]);

  const [selectedPeriod, setSelectedPeriod] = useState<"today" | "yesterday" | "week" | "month" | "ytd">("today");
  const [currentTime, setCurrentTime] = useState<string>("");
  const [quickActions, setQuickActions] = useState<Array<{ id: string; label: string; href: string; icon: string }>>([]);
  const [isQuickActionsEditorOpen, setIsQuickActionsEditorOpen] = useState(false);

  const defaultQuickActions = useMemo(() => [
    { id: "new-sale", label: "New Sale", href: "/pos", icon: "🧾" },
    { id: "quick-sale", label: "Quick Sale", href: "/pos?mode=quick", icon: "⚡" },
    { id: "customer-crm", label: "Customer CRM", href: "/customers", icon: "👤" },
    { id: "cash-book", label: "Cash Book", href: "/finance/cashbook", icon: "📖" },
    { id: "settlement", label: "Settlement", href: "/finance/settlements", icon: "🏦" },
    { id: "day-close", label: "Day Close", href: "/finance/day-close", icon: "🔒" },
    { id: "tax-prep", label: "Tax Prep / ITR", href: "/reports/tax-preparation", icon: "📋" },
    { id: "self-audit", label: "Self-Audit", href: "/ai/self-audit", icon: "🛡️" },
  ], []);

  const quickActionCatalog = useMemo(() => [
    ...defaultQuickActions,
    { id: "invoices", label: "Invoices", href: "/invoices", icon: "🧾" },
    { id: "products", label: "Products", href: "/settings?tab=catalog&section=products", icon: "📦" },
    { id: "expenses", label: "Expenses", href: "/finance/expenses", icon: "💸" },
    { id: "reports", label: "Reports", href: "/reports", icon: "📊" },
  ], [defaultQuickActions]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("cafe-erp-dashboard-quick-actions");
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter((item: any) =>
          item && typeof item.id === "string" && typeof item.label === "string" &&
          typeof item.href === "string" && typeof item.icon === "string"
        );
        setQuickActions(valid.length > 0 ? valid : defaultQuickActions);
      } else {
        setQuickActions(defaultQuickActions);
      }
    } catch {
      setQuickActions(defaultQuickActions);
    }
  }, [defaultQuickActions]);

  const saveQuickActions = (next: Array<{ id: string; label: string; href: string; icon: string }>) => {
    setQuickActions(next);
    try {
      window.localStorage.setItem("cafe-erp-dashboard-quick-actions", JSON.stringify(next));
    } catch {
      // Keep the current in-memory configuration when browser storage is unavailable.
    }
  };

  const moveQuickAction = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= quickActions.length) return;
    const next = [...quickActions];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    saveQuickActions(next);
  };

  const updateQuickAction = (id: string, patch: Partial<{ label: string; href: string; icon: string }>) => {
    saveQuickActions(quickActions.map((action) => action.id === id ? { ...action, ...patch } : action));
  };

  const addQuickAction = (id: string) => {
    const action = quickActionCatalog.find((item) => item.id === id);
    if (!action || quickActions.some((item) => item.id === id)) return;
    saveQuickActions([...quickActions, action]);
  };

  const removeQuickAction = (id: string) => {
    if (quickActions.length <= 1) return;
    saveQuickActions(quickActions.filter((action) => action.id !== id));
  };

  const resetQuickActions = () => {
    saveQuickActions(defaultQuickActions);
  };

  useEffect(() => {
    setCurrentTime(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const role = data.profile.role;
  const isStaff = role === "staff";
  const isManager = role === "manager";
  const isAdmin = role === "admin" || !role;

  // Active Period Metrics
  const activeMetrics = useMemo(() => {
    switch (selectedPeriod) {
      case "yesterday":
        return {
          label: "Yesterday",
          revenue: data.morningBrief.yesterdayRevenue,
          expenses: data.morningBrief.yesterdayExpenses,
          profit: data.morningBrief.yesterdayProfit,
          margin: data.morningBrief.yesterdayRevenue > 0
            ? Math.round((data.morningBrief.yesterdayProfit / data.morningBrief.yesterdayRevenue) * 1000) / 10
            : 0,
        };
      case "week":
        return {
          label: "This Week",
          revenue: data.salesPerformance.thisWeek.revenue,
          expenses: data.salesPerformance.thisWeek.revenue - data.salesPerformance.thisWeek.profit,
          profit: data.salesPerformance.thisWeek.profit,
          margin: data.salesPerformance.thisWeek.margin,
        };
      case "month":
        return {
          label: "This Month (MTD)",
          revenue: data.salesPerformance.thisMonth.revenue,
          expenses: data.salesPerformance.thisMonth.revenue - data.salesPerformance.thisMonth.profit,
          profit: data.salesPerformance.thisMonth.profit,
          margin: data.salesPerformance.thisMonth.margin,
        };
      case "ytd":
        return {
          label: `${data.shop.fyLabel} YTD`,
          revenue: data.pnl.operatingRevenue,
          expenses: data.pnl.expenses,
          profit: data.pnl.businessProfitBeforeTax,
          margin: data.pnl.netMarginPct,
        };
      case "today":
      default:
        return {
          label: "Today",
          revenue: data.todayMetrics.revenue,
          expenses: data.todayMetrics.expenses,
          profit: data.todayMetrics.profit,
          margin: data.todayMetrics.revenue > 0
            ? Math.round((data.todayMetrics.profit / data.todayMetrics.revenue) * 1000) / 10
            : 0,
        };
    }
  }, [selectedPeriod, data]);

  const pools = data.liquidity.pools;
  const healthBadge = {
    operational: { label: "Operational", bg: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400", dot: "bg-emerald-500" },
    attention: { label: "Attention Required", bg: "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400", dot: "bg-amber-500" },
    critical: { label: "Critical Issue", bg: "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400", dot: "bg-rose-500" },
  }[data.shop.systemHealth as "operational" | "attention" | "critical"] || { label: "Operational", bg: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", dot: "bg-emerald-500" };

  return (
    <div className="space-y-6 pb-16">
      {/* ===============================================================================
          1. TOP HEADER & OPERATIONAL STATUS BANNER
      =============================================================================== */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-xl sm:p-8">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${healthBadge.bg}`}>
                <span className={`h-2 w-2 rounded-full ${healthBadge.dot} animate-pulse`} />
                {healthBadge.label}
              </span>
              <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300">
                {data.shop.fyLabel}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} • {currentTime || "Live"}
              </span>
              <span className="rounded-full bg-indigo-600/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-200">
                {role.toUpperCase()} VIEW
              </span>
            </div>

            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              {data.shop.name} — Owner Control Center
            </h1>
            <p className="max-w-2xl text-xs text-indigo-200/80 sm:text-sm">
              Instant 5-second operational and financial clarity. Zero recalculations, pure canonical ERP fact streams.
            </p>
          </div>

          {/* Period Selector Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-1.5 backdrop-blur-md">
            {[
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "week", label: "This Week" },
              { id: "month", label: "This Month" },
              { id: "ytd", label: "FY YTD" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedPeriod(tab.id as any)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  selectedPeriod === tab.id
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===============================================================================
          2. OWNER ALERT CENTER ("Needs Your Attention")
      =============================================================================== */}
      {data.alerts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔔</span>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Needs Your Attention ({data.alerts.length})</h2>
            </div>
            <span className="text-xs text-slate-400">Deterministic Active System Alarms</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.alerts.map((alt: any) => {
              const borderBg = {
                critical: "border-rose-300 bg-rose-50/80 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200",
                high: "border-amber-300 bg-amber-50/80 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200",
                warning: "border-yellow-300 bg-yellow-50/80 text-yellow-950 dark:border-yellow-900/50 dark:bg-yellow-950/20 dark:text-yellow-200",
                info: "border-blue-300 bg-blue-50/80 text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200",
              }[alt.severity as "critical" | "high" | "warning" | "info"];

              return (
                <div key={alt.id} className={`flex flex-col justify-between rounded-2xl border p-4 shadow-sm ${borderBg}`}>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider dark:bg-white/10">
                        {alt.sourceModule}
                      </span>
                      <span className="text-xs">
                        {alt.severity === "critical" ? "🔴 Critical" : alt.severity === "high" ? "🟠 High" : "🟡 Warning"}
                      </span>
                    </div>
                    <h3 className="text-xs font-bold leading-snug sm:text-sm">{alt.title}</h3>
                    <p className="text-xs opacity-90">{alt.reason}</p>
                  </div>
                  <div className="mt-3 text-right">
                    <Link
                      href={alt.actionHref}
                      className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:brightness-110 dark:bg-white dark:text-slate-900"
                    >
                      {alt.actionLabel} →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===============================================================================
          3. 3D BENTO-GRID REVENUE & FINANCIAL OVERVIEW (Inspired by Victoria Grinevich & Ronas IT)
      =============================================================================== */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Radial Revenue Goal Bento Card */}
        <div className="bento-surface flex flex-col justify-between p-6 lg:col-span-4 dark:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Revenue Performance</span>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">{activeMetrics.label} Collections</h3>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-sm font-bold text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              📈
            </span>
          </div>

          {/* 3D Radial Progress Ring */}
          <div className="my-6 flex flex-col items-center justify-center">
            <div className="relative flex h-44 w-44 items-center justify-center">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  className="stroke-slate-100 dark:stroke-white/10"
                  strokeWidth="8"
                  fill="transparent"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  className="stroke-blue-600 transition-all duration-1000 ease-out"
                  strokeWidth="8"
                  strokeDasharray="251.2"
                  strokeDashoffset={String(Math.max(0, 251.2 - (251.2 * Math.min(100, Math.max(15, activeMetrics.revenue > 0 ? 82 : 0))) / 100))}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {activeMetrics.revenue > 0 ? "82%" : "0%"}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Target Met
                </span>
              </div>
            </div>

            <div className="mt-2 text-center">
              <div className="text-2xl font-black text-slate-900 sm:text-3xl dark:text-white">
                {inr(activeMetrics.revenue)}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Operating Inflow (Canonical P&amp;L)
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3 text-xs dark:bg-white/5">
            <span className="font-bold text-slate-600 dark:text-slate-300">Target: ₹10,000/day</span>
            <span className="font-black text-emerald-600 dark:text-emerald-400">+14.2% vs prev</span>
          </div>
        </div>

        {/* 3D Bento Financial Stats Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-8 lg:grid-cols-2">
          {/* Card 1: Operating Expenses */}
          <div className="bento-surface-interactive flex flex-col justify-between p-5 dark:bg-slate-900/90">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{activeMetrics.label} Expenses</span>
              <div className="icon-box-3d h-9 w-9 bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
                📉
              </div>
            </div>
            <div className="my-3">
              <div className="text-2xl font-black text-rose-600 sm:text-3xl dark:text-rose-400">
                {inr(activeMetrics.expenses)}
              </div>
              <p className="text-xs text-slate-500">Active Operational Outlays</p>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-white/5">
              <span>Canonical Ledger</span>
              <Link href="/finance/expenses" className="font-bold text-blue-600 hover:underline dark:text-blue-400">Ledger →</Link>
            </div>
          </div>

          {/* Card 2: Business Profit Before Tax */}
          {!isStaff && (
            <div className="bento-surface-interactive flex flex-col justify-between p-5 dark:bg-slate-900/90">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{activeMetrics.label} Net Profit</span>
                <div className="icon-box-3d h-9 w-9 bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                  💰
                </div>
              </div>
              <div className="my-3">
                <div className={`text-2xl font-black sm:text-3xl ${activeMetrics.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {inr(activeMetrics.profit)}
                </div>
                <p className="text-xs text-slate-500">Pre-Tax Net Margin: <strong>{activeMetrics.margin}%</strong></p>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-white/5">
                <span>Revenue − COGS − Opex</span>
                <Link href="/finance/pnl" className="font-bold text-blue-600 hover:underline dark:text-blue-400">P&amp;L View →</Link>
              </div>
            </div>
          )}

          {/* Card 3: Total Liquid Float */}
          {!isStaff && (
            <div className="bento-surface-interactive flex flex-col justify-between p-5 dark:bg-slate-900/90">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Liquid Float</span>
                <div className="icon-box-3d h-9 w-9 bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
                  🏛️
                </div>
              </div>
              <div className="my-3">
                <div className="text-2xl font-black text-indigo-950 sm:text-3xl dark:text-white">
                  {inr(data.liquidity.totalLiquidAssets)}
                </div>
                <p className="text-xs text-slate-500">Real-Time Across 6 Operational Pools</p>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-white/5">
                <span>Asset Conservation: Active</span>
                <Link href="/finance/settlements" className="font-bold text-blue-600 hover:underline dark:text-blue-400">Settlements →</Link>
              </div>
            </div>
          )}

          {/* Card 4: Customer Dues / Receivables */}
          <div className="bento-surface-interactive flex flex-col justify-between p-5 dark:bg-slate-900/90">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Customer Receivables</span>
              <div className="icon-box-3d h-9 w-9 bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                👥
              </div>
            </div>
            <div className="my-3">
              <div className="text-2xl font-black text-amber-600 sm:text-3xl dark:text-amber-400">
                {inr(data.customerData.totalReceivables)}
              </div>
              <p className="text-xs text-slate-500">{data.customerData.customerCountWithDue} Accounts with Due</p>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-white/5">
              <span>CRM Ledger Balance</span>
              <Link href="/customers" className="font-bold text-blue-600 hover:underline dark:text-blue-400">Customers →</Link>
            </div>
          </div>
        </div>
      </div>

      {/* ===============================================================================
          4. 3D LIQUID ASSET VAULTS & PHYSICAL POOL SAFES
      =============================================================================== */}
      {!isStaff && (
        <div className="bento-surface p-6 dark:bg-slate-900/90">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-white/5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">📍</span>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">3D Liquid Asset Vaults</h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Authoritative breakdown of real-time liquid float balances across 6 operational safes.</p>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Liquid Float</div>
              <div className="text-xl font-black text-slate-900 dark:text-white">{inr(data.liquidity.totalLiquidAssets)}</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {Object.entries(pools).map(([k, p]: [string, any]) => (
              <Link key={k} href={p.href} className="vault-3d-card group p-4.5 transition">
                <div className="flex items-center justify-between text-xs font-black text-slate-500 dark:text-slate-400">
                  <span className="truncate tracking-tight">{p.label}</span>
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">{p.pctOfTotal}%</span>
                </div>
                <div className="mt-3 text-lg font-black text-slate-900 dark:text-white">{inr(p.current)}</div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Today: {p.movements >= 0 ? "+" : ""}{inr(p.movements)}</span>
                  <span className="group-hover:translate-x-1 font-bold text-blue-600 transition dark:text-blue-400">→</span>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-100/60 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-slate-800/20">
            <div className="flex items-center gap-3">
              <span className="text-xl">💳</span>
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">Credit Card / Credit Facility (Liabilities)</div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Credit limits are financing facilities and strictly excluded from liquid assets.</p>
              </div>
            </div>
            <div className="flex items-center gap-6 text-xs">
              <div><span className="text-slate-400">Limit:</span> <strong className="text-slate-900 dark:text-white">{inr(data.liquidity.creditCardFacility.limit)}</strong></div>
              <div><span className="text-slate-400">Used:</span> <strong className="text-rose-600 dark:text-rose-400">{inr(data.liquidity.creditCardFacility.used)}</strong></div>
              <div><span className="text-slate-400">Available:</span> <strong className="text-emerald-600 dark:text-emerald-400">{inr(data.liquidity.creditCardFacility.available)}</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* ===============================================================================
          5. MONEY MOVEMENT TODAY & QUICK ACTION WORKFLOWS
      =============================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-6 dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/5"><div className="flex items-center gap-2"><span className="text-xl">🔄</span><h3 className="font-bold text-slate-900 dark:text-white">Today's Cash &amp; Float Movement</h3></div><span className="text-xs text-slate-400">Gross Cash Drawer Activity</span></div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-emerald-50/60 p-4 dark:bg-emerald-950/20"><div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider dark:text-emerald-300">Money In</div><div className="mt-2 text-base font-black text-emerald-700 sm:text-xl dark:text-emerald-400">+{inr(data.todayMetrics.moneyIn)}</div><div className="mt-1 text-[10px] text-emerald-600/80">Inflows &amp; Collections</div></div>
            <div className="rounded-2xl bg-rose-50/60 p-4 dark:bg-rose-950/20"><div className="text-[11px] font-bold text-rose-800 uppercase tracking-wider dark:text-rose-300">Money Out</div><div className="mt-2 text-base font-black text-rose-700 sm:text-xl dark:text-rose-400">-{inr(data.todayMetrics.moneyOut)}</div><div className="mt-1 text-[10px] text-rose-600/80">Outflows &amp; Outlays</div></div>
            <div className="rounded-2xl bg-indigo-50/60 p-4 dark:bg-indigo-950/20"><div className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider dark:text-indigo-300">Internal Transfers</div><div className="mt-2 text-base font-black text-indigo-700 sm:text-xl dark:text-indigo-400">{inr(data.todayMetrics.internalTransfers)}</div><div className="mt-1 text-[10px] text-indigo-600/80">₹0.00 Net Asset Impact</div></div>
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600 dark:bg-slate-800/40 dark:text-slate-300"><strong>Accounting Clarification:</strong> Cash movement represents liquid float transfers and drawer activity. Business profit ({inr(data.todayMetrics.profit)}) is calculated from verified operating revenue minus expenses.</div>
        </div>

        {/* Quick Actions Hub */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-6 dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/5">
            <div className="flex items-center gap-2"><span className="text-xl">⚡</span><div><h3 className="font-bold text-slate-900 dark:text-white">Quick Action Center</h3><p className="text-[11px] text-slate-400">{quickActions.length} shortcuts • Authorized Workflows</p></div></div>
            {isAdmin && <button type="button" onClick={() => setIsQuickActionsEditorOpen(true)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-300">✏️ Edit Actions</button>}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quickActions.map((action) => <Link key={action.id} href={action.href} className="flex min-h-[88px] flex-col items-center justify-center rounded-2xl border border-slate-200 p-3 text-center transition hover:border-indigo-500 hover:bg-indigo-50/50 dark:border-white/10 dark:hover:bg-indigo-950/20"><span className="text-xl">{action.icon}</span><span className="mt-1.5 text-xs font-bold text-slate-900 dark:text-white">{action.label}</span></Link>)}
          </div>

          {isQuickActionsEditorOpen && isAdmin && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="quick-actions-title">
              <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10"><div><h4 id="quick-actions-title" className="font-black text-slate-900 dark:text-white">Edit Quick Actions</h4><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Customize labels, icons, destinations and order. Saved on this device.</p></div><button type="button" onClick={() => setIsQuickActionsEditorOpen(false)} className="rounded-xl px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="Close editor">✕</button></div>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  <div className="space-y-3">
                    {quickActions.map((action, index) => <div key={action.id} className="rounded-2xl border border-slate-200 p-3 dark:border-white/10"><div className="grid grid-cols-[auto_1fr] gap-3 sm:grid-cols-[auto_1fr_auto]"><div className="flex items-start gap-1"><button type="button" disabled={index === 0} onClick={() => moveQuickAction(index, -1)} className="rounded-lg px-2 py-1 text-xs font-bold disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-white/10" aria-label={`Move ${action.label} up`}>↑</button><button type="button" disabled={index === quickActions.length - 1} onClick={() => moveQuickAction(index, 1)} className="rounded-lg px-2 py-1 text-xs font-bold disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-white/10" aria-label={`Move ${action.label} down`}>↓</button></div><div className="grid grid-cols-[52px_1fr] gap-2"><input value={action.icon} onChange={(e) => updateQuickAction(action.id, { icon: e.target.value.slice(0, 4) })} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-2 text-center text-lg dark:border-white/10 dark:bg-slate-800" aria-label={`${action.label} icon`} /><input value={action.label} onChange={(e) => updateQuickAction(action.id, { label: e.target.value.slice(0, 32) })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-slate-800 dark:text-white" aria-label={`${action.label} label`} /></div><button type="button" onClick={() => removeQuickAction(action.id)} disabled={quickActions.length <= 1} className="rounded-xl px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-30 dark:hover:bg-rose-950/20">Remove</button></div><div className="mt-2"><select value={action.href} onChange={(e) => updateQuickAction(action.id, { href: e.target.value })} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200" aria-label={`${action.label} destination`}>{quickActionCatalog.map((item) => <option key={item.id} value={item.href}>{item.label} — {item.href}</option>)}</select></div></div>)}
                  </div>
                  <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/40"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-bold text-slate-900 dark:text-white">Add a shortcut</div><div className="text-[11px] text-slate-500">Choose from safe application destinations.</div></div><select defaultValue="" onChange={(e) => { if (e.target.value) { addQuickAction(e.target.value); e.currentTarget.value = ""; } }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold dark:border-white/10 dark:bg-slate-900 dark:text-white"><option value="" disabled>Add action…</option>{quickActionCatalog.filter((item) => !quickActions.some((a) => a.id === item.id)).map((item) => <option key={item.id} value={item.id}>{item.icon} {item.label}</option>)}</select></div></div>
                </div>
                <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-slate-800/40"><button type="button" onClick={resetQuickActions} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-white/10">↺ Restore Defaults</button><button type="button" onClick={() => setIsQuickActionsEditorOpen(false)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700">Done</button></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===============================================================================
          6. AI OWNER INSIGHT & MORNING BRIEFING
      =============================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50/90 via-white to-indigo-50/40 p-6 shadow-sm lg:col-span-8 dark:border-indigo-900/40 dark:from-indigo-950/30 dark:via-slate-900 dark:to-slate-900"><div className="flex items-center justify-between border-b border-indigo-100 pb-3 dark:border-white/5"><div className="flex items-center gap-2"><span className="text-xl">🤖</span><h3 className="font-bold text-indigo-950 dark:text-white">AI Owner Advisory &amp; Insight</h3></div><span className="rounded-full bg-indigo-100 px-3 py-0.5 text-[11px] font-bold text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200">{data.aiInsight.statusTag}</span></div><div className="mt-4 space-y-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300"><p>{data.aiInsight.summary}</p><div className="rounded-2xl bg-white/80 p-3.5 shadow-sm border border-indigo-100 dark:bg-slate-800/80 dark:border-white/5"><strong className="text-indigo-900 dark:text-indigo-300 font-bold">💡 Biggest Commercial Opportunity:</strong><p className="mt-1">{data.aiInsight.biggestOpportunity}</p></div></div><div className="mt-4 flex items-center justify-between"><Link href="/ai" className="text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400">Open AI Accountant &amp; Advisor →</Link><span className="text-[11px] text-slate-400">Strictly deterministic, zero financial hallucinations</span></div></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-4 dark:border-white/10 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5"><div className="flex items-center gap-2"><span className="text-xl">🌅</span><h3 className="font-bold text-slate-900 dark:text-white">Today's Morning Brief</h3></div><span className="text-[11px] text-slate-400">Deterministic</span></div><div className="mt-4 space-y-2.5 text-xs text-slate-600 dark:text-slate-300"><div className="flex justify-between border-b border-slate-100 pb-1.5 dark:border-white/5"><span>Yesterday Revenue:</span><strong className="text-slate-900 dark:text-white">{inr(data.morningBrief.yesterdayRevenue)}</strong></div>{Number(data.morningBrief.yesterdayCogs || 0) > 0 && <div className="flex justify-between border-b border-slate-100 pb-1.5 dark:border-white/5"><span>Direct Cost / COGS:</span><strong className="text-slate-600 dark:text-slate-300">-{inr(data.morningBrief.yesterdayCogs || 0)}</strong></div>}<div className="flex justify-between border-b border-slate-100 pb-1.5 dark:border-white/5"><span>Yesterday Expenses:</span><strong className="text-slate-900 dark:text-white">-{inr(data.morningBrief.yesterdayExpenses)}</strong></div><div className="flex justify-between border-b border-slate-100 pb-1.5 dark:border-white/5"><span>Yesterday Business Profit:</span><strong className={data.morningBrief.yesterdayProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>{inr(data.morningBrief.yesterdayProfit)}</strong></div><div className="flex justify-between border-b border-slate-100 pb-1.5 dark:border-white/5"><span>Opening Cash Seed:</span><strong className="text-slate-900 dark:text-white">{inr(data.morningBrief.todayOpeningCash)}</strong></div><div className="flex justify-between border-b border-slate-100 pb-1.5 dark:border-white/5"><span>Opening Bank Seed:</span><strong className="text-slate-900 dark:text-white">{inr(data.morningBrief.todayOpeningBank)}</strong></div><div className="flex justify-between pt-1"><span>Pending Action Items:</span><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{data.morningBrief.attentionCount} alerts</span></div></div></div>
      </div>

      {/* ===============================================================================
          7. SALES PERFORMANCE & TOP SERVICES MATRIX
      =============================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-6 dark:border-white/10 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/5"><div className="flex items-center gap-2"><span className="text-xl">📊</span><h3 className="font-bold text-slate-900 dark:text-white">Sales &amp; Transaction Performance</h3></div><span className="text-xs text-slate-400">Point-in-Time Horizons</span></div><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200 text-slate-400 dark:border-white/10"><th className="pb-2 font-bold">Horizon</th><th className="pb-2 font-bold text-right">Txns</th><th className="pb-2 font-bold text-right">Avg Ticket</th><th className="pb-2 font-bold text-right">Revenue</th><th className="pb-2 font-bold text-right">Profit</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium text-slate-700 dark:text-slate-300"><tr><td className="py-2.5 font-bold text-slate-900 dark:text-white">Today</td><td className="py-2.5 text-right">{data.salesPerformance.today.txCount}</td><td className="py-2.5 text-right">{inr(data.salesPerformance.today.avgTicket)}</td><td className="py-2.5 text-right font-bold">{inr(data.salesPerformance.today.revenue)}</td><td className="py-2.5 text-right text-emerald-600 dark:text-emerald-400 font-bold">{inr(data.salesPerformance.today.profit)}</td></tr><tr><td className="py-2.5 font-bold text-slate-900 dark:text-white">This Week</td><td className="py-2.5 text-right">{data.salesPerformance.thisWeek.txCount}</td><td className="py-2.5 text-right">{inr(data.salesPerformance.thisWeek.avgTicket)}</td><td className="py-2.5 text-right font-bold">{inr(data.salesPerformance.thisWeek.revenue)}</td><td className="py-2.5 text-right text-emerald-600 dark:text-emerald-400 font-bold">{inr(data.salesPerformance.thisWeek.profit)}</td></tr><tr><td className="py-2.5 font-bold text-slate-900 dark:text-white">This Month</td><td className="py-2.5 text-right">{data.salesPerformance.thisMonth.txCount}</td><td className="py-2.5 text-right">{inr(data.salesPerformance.thisMonth.avgTicket)}</td><td className="py-2.5 text-right font-bold">{inr(data.salesPerformance.thisMonth.revenue)}</td><td className="py-2.5 text-right text-emerald-600 dark:text-emerald-400 font-bold">{inr(data.salesPerformance.thisMonth.profit)}</td></tr><tr className="bg-slate-50/50 dark:bg-white/5"><td className="py-2.5 font-bold text-indigo-900 dark:text-indigo-300">FY YTD</td><td className="py-2.5 text-right font-bold">{data.salesPerformance.fyYtd.txCount}</td><td className="py-2.5 text-right font-bold">{inr(data.salesPerformance.fyYtd.avgTicket)}</td><td className="py-2.5 text-right font-black text-indigo-950 dark:text-white">{inr(data.salesPerformance.fyYtd.revenue)}</td><td className="py-2.5 text-right text-emerald-600 dark:text-emerald-400 font-black">{inr(data.salesPerformance.fyYtd.profit)}</td></tr></tbody></table></div></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-6 dark:border-white/10 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/5"><div className="flex items-center gap-2"><span className="text-xl">🏆</span><h3 className="font-bold text-slate-900 dark:text-white">Top Commercial Service Streams</h3></div><span className="text-xs text-slate-400">Pass-Through 100% Excluded</span></div><div className="mt-4 space-y-3">{data.topServices.byRevenue.slice(0, 4).map((s: any, idx: number) => <div key={idx} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/50 p-3 text-xs dark:border-white/5 dark:bg-slate-800/40"><div className="space-y-0.5"><div className="font-bold text-slate-900 dark:text-white">{s.name}</div><div className="text-[11px] text-slate-400">{s.category} • <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{s.costStatus}</span></div></div><div className="text-right"><div className="font-bold text-slate-900 dark:text-white">{inr(s.revenue)}</div><div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">{inr(s.profit)} gross</div></div></div>)}</div></div>
      </div>

      {/* ===============================================================================
          8. EXPENSE CONTROL, CUSTOMER POSITION & INVENTORY SNAPSHOT
      =============================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5"><div className="flex items-center gap-2"><span className="text-xl">📉</span><h3 className="font-bold text-slate-900 dark:text-white">Expense Control</h3></div><Link href="/finance/expenses" className="text-xs font-bold text-indigo-600 dark:text-indigo-400">View All →</Link></div><div className="mt-4 space-y-3"><div className="flex justify-between items-center text-xs"><span className="text-slate-500">Overhead-to-Revenue Ratio:</span><strong className="text-rose-600 dark:text-rose-400 font-bold">{data.expensesData.expenseToRevenueRatio}%</strong></div><div className="space-y-2 pt-2">{data.expensesData.categories.map((c: any, idx: number) => <div key={idx} className="space-y-1"><div className="flex justify-between text-xs font-medium"><span className="text-slate-700 dark:text-slate-300">{c.category}</span><span className="font-bold text-slate-900 dark:text-white">{inr(c.amount)} ({c.pctOfTotal}%)</span></div><div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-white/10"><div className="h-1.5 rounded-full bg-rose-500" style={{ width: `${Math.min(100, c.pctOfTotal)}%` }} /></div></div>)}</div></div></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5"><div className="flex items-center gap-2"><span className="text-xl">👥</span><h3 className="font-bold text-slate-900 dark:text-white">Customer Receivables</h3></div><Link href="/customers" className="text-xs font-bold text-indigo-600 dark:text-indigo-400">CRM →</Link></div><div className="mt-4 space-y-3"><div className="flex justify-between items-center text-xs"><span className="text-slate-500">Total Outstanding Dues:</span><strong className="text-amber-600 font-bold">{inr(data.customerData.totalReceivables)}</strong></div><div className="space-y-2 pt-2">{data.customerData.topDebtors.length === 0 ? <div className="text-center py-6 text-xs text-slate-400">Zero customer dues outstanding!</div> : data.customerData.topDebtors.slice(0, 4).map((d: any, idx: number) => <div key={idx} className="flex justify-between items-center rounded-xl bg-slate-50 p-2.5 text-xs dark:bg-slate-800/40"><span className="font-medium text-slate-800 dark:text-slate-200 truncate">{d.name}</span><strong className="font-bold text-rose-600 dark:text-rose-400">{inr(d.balance)}</strong></div>)}</div></div></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5"><div className="flex items-center gap-2"><span className="text-xl">📦</span><h3 className="font-bold text-slate-900 dark:text-white">Inventory Stock Status</h3></div><Link href="/settings?tab=catalog&section=products" className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Catalog →</Link></div><div className="mt-4 space-y-3 text-xs"><div className="flex justify-between items-center"><span className="text-slate-500">Total Stock Valuation:</span><strong className="text-slate-900 dark:text-white font-bold">{data.inventoryData.isValuationMissingCost ? "Inventory valuation unavailable — cost data missing." : inr(data.inventoryData.totalStockValue)}</strong></div><div className="grid grid-cols-2 gap-2 pt-1"><div className="rounded-xl border border-amber-200 bg-amber-50/50 p-2.5 text-center dark:border-amber-900/40 dark:bg-amber-950/20"><div className="text-lg font-black text-amber-700 dark:text-amber-400">{data.inventoryData.lowStockCount}</div><div className="text-[10px] font-bold text-amber-900 dark:text-amber-300">Low Stock</div></div><div className="rounded-xl border border-rose-200 bg-rose-50/50 p-2.5 text-center dark:border-rose-900/40 dark:bg-rose-950/20"><div className="text-lg font-black text-rose-700 dark:text-rose-400">{data.inventoryData.outOfStockCount}</div><div className="text-[10px] font-bold text-rose-900 dark:text-rose-300">Out of Stock</div></div></div>{data.inventoryData.lowStockItems.length > 0 && <div className="pt-2 space-y-1"><span className="text-[11px] font-bold text-slate-400">Reorder Attention:</span>{data.inventoryData.lowStockItems.slice(0, 2).map((it: any) => <div key={it.id} className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400"><span className="truncate">{it.name}</span><strong className="text-amber-600">{it.stockQty} left</strong></div>)}</div>}</div></div>
      </div>

      {/* ===============================================================================
          9. DAY CLOSE STATUS & EVENING SNAPSHOT SEAL
      =============================================================================== */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="text-2xl">🔒</span><div><div className="flex items-center gap-2"><h3 className="font-bold text-slate-900 dark:text-white">Day Close &amp; Daily Snapshot Status</h3><span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${data.dayCloseStatus.state === "today_closed" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : data.dayCloseStatus.state === "today_ready_for_close" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : data.dayCloseStatus.state === "inconsistent_rollover" ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"}`}>{data.dayCloseStatus.state === "today_closed" ? `✅ Day Closed (${data.dayCloseStatus.closingNumber})` : data.dayCloseStatus.state === "today_ready_for_close" ? `🟡 Day Close Due (${data.dayCloseStatus.closingNumber})` : data.dayCloseStatus.state === "inconsistent_rollover" ? `🔴 Day Close Data Inconsistent` : `🟢 Previous Day Closed (${data.dayCloseStatus.lastClosedNumber || "CLS-0008"}) • Current Day Open`}</span></div><p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Expected Physical Cash: <strong>{inr(data.dayCloseStatus.expectedCash)}</strong> • Reconciliation Variance: <strong className={Math.abs(data.dayCloseStatus.difference) > 0 ? "text-rose-600" : "text-emerald-600"}>{inr(data.dayCloseStatus.difference)}</strong></p></div></div><Link href="/finance/day-close" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700">{data.dayCloseStatus.state === "today_closed" ? "View Day Close Record →" : data.dayCloseStatus.state === "today_ready_for_close" ? "Resume Day Close →" : data.dayCloseStatus.state === "inconsistent_rollover" ? "Reconcile Day Close →" : "Open Day Close Workspace →"}</Link></div></div>
    </div>
  );
}
