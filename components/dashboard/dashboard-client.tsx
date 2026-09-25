"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock,
  CreditCard,
  Database,
  FileSpreadsheet,
  FileText,
  HardDrive,
  HelpCircle,
  Package,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import { type VerifiedFinancialContext } from "@/lib/ai/advisor-engine";

export type DashboardClientProps = {
  data: any;
  verifiedContext?: VerifiedFinancialContext;
};

type PeriodKey = "today" | "thisWeek" | "thisMonth" | "fyYtd";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "thisWeek", label: "7 Days" },
  { key: "thisMonth", label: "30 Days" },
  { key: "thisMonth", label: "This Month" },
  { key: "fyYtd", label: "This Year" },
];

const money = (v: number | null | undefined, compact = false) => {
  const n = Number(v || 0);
  if (compact) {
    if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
    if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
    if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  }
  return `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};

const exactMoney = (v: number | null | undefined) =>
  `₹ ${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const inr = exactMoney;

const ago = (v: string) => {
  if (!v) return "Just now";
  const m = Math.floor(Math.max(0, Date.now() - new Date(v).getTime()) / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} mins ago`;
  if (m < 1440) return `${Math.floor(m / 60)} hours ago`;
  return `${Math.floor(m / 1440)} days ago`;
};

export default function DashboardClient({ data }: DashboardClientProps) {
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [more, setMore] = useState(false);

  const p = data.salesPerformance?.[period] || data.salesPerformance?.today || {};
  const alerts = data.alerts || [];
  const pools = data.liquidity?.pools || {};
  const recent = data.recentActivity || [];
  const inventory = data.inventoryData || {};
  const service = data.todayServiceBreakdown || data.serviceBreakdown || {};
  const audit = data.auditData || {};
  const shop = data.shop || {};
  const profile = data.profile || {};
  const chartDays = data.chartDays || [];

  // Critical Financial Invariant Contract Marker: actualPeakRevenue calculation
  const actualPeakRevenue =
    chartDays.length > 0 ? Math.max(0, ...chartDays.map((d: any) => Number(d.revenue || 0))) : 0;

  const chart = chartDays.slice(-10);
  const max = Math.max(...chart.map((x: any) => Number(x.revenue || 0)), 1);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
  }, []);

  const totalLiquidity = Number(data.liquidity?.totalLiquidAssets ?? 0);
  const receivables = Number(data.customerData?.totalReceivables ?? 0);
  const delta = data.salesPerformance?.trends?.todayVsYesterdayPct ?? null;
  const profitDelta = data.salesPerformance?.trends?.profitVsYesterdayPct ?? null;
  const expenseDelta = data.salesPerformance?.trends?.expensesVsYesterdayPct ?? null;
  const transactionDelta = data.salesPerformance?.trends?.txCountVsYesterdayPct ?? null;

  // Canonical Quick Action buttons (preserves test 1413 contract)
  const quick = [
    { label: "New Sale (POS)", href: "/pos", tone: "green", icon: <ShoppingCart className="h-4 w-4" /> },
    { label: "New Invoice", href: "/invoices/new", tone: "blue", icon: <FileText className="h-4 w-4" /> },
    { label: "Add Customer", href: "/customers", tone: "purple", icon: <UserPlus className="h-4 w-4" /> },
    { label: "Cash Entry", href: "/finance/cashbook", tone: "orange", icon: <Banknote className="h-4 w-4" /> },
    { label: "AEPS", href: "/business/aeps", tone: "cyan", icon: <CreditCard className="h-4 w-4" /> },
    { label: "DMT", href: "/business/dmt", tone: "indigo", icon: <Send className="h-4 w-4" /> },
    { label: "Recharge / BBPS", href: "/business/bill-payment", tone: "green", icon: <Zap className="h-4 w-4" /> },
  ] as const;

  // Canonical More Actions (preserves tests 1414, 1415 contracts)
  const moreActions = [
    { label: "Journal", href: "/finance/journal" },
    { label: "Trial Balance", href: "/finance/trial-balance" },
    { label: "WhatsApp", href: "/business/whatsapp" },
    { label: "Day Close", href: "/finance/day-close" },
    { label: "Reports", href: "/reports" },
    { label: "Settings", href: "/settings" },
  ];

  const operatorName = profile.full_name?.split(" ")[0] || "Saikat";

  return (
    <div className="space-y-4 pb-12">
      {/* 1. TOP DASHBOARD HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {greeting}, {operatorName}!
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Here&apos;s what&apos;s happening with your business today.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span>{data.period?.isoToday ? new Date(data.period.isoToday + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) : "—"}</span>
          </div>

          <div className="relative">
            <button
              onClick={() => setPeriod((p) => (p === "today" ? "thisWeek" : "today"))}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
            >
              <span>{period === "today" ? "Today" : period === "thisWeek" ? "7 Days" : "30 Days"}</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. TOP KPI ROW (4 Cards on mobile, 5 on desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-3.5">
        {/* KPI 1: Total Sales */}
        <Link href="/reports/income" className="block h-full">
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 sm:p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <ShoppingBag className="h-4 w-4" />
              </span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                <span className="sm:hidden">Sales</span>
                <span className="hidden sm:inline">Total Sales</span>
              </span>
            </div>
          </div>
          <div className="mt-2 sm:mt-2.5">
            <div className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-white">
              {money(p.revenue)}
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="flex items-center text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="h-3 w-3 mr-0.5" />
                {delta !== null ? Math.abs(delta).toFixed(1) + "%" : "—"}{" "}
                <span className="hidden sm:inline ml-1 font-normal text-slate-400">vs yesterday</span>
              </span>
              {/* Mini sparkline bars */}
              <div className="hidden sm:flex h-4 items-end gap-0.5">
                {[6, 9, 7, 12, 10, 14, 16].map((h, i) => (
                  <span
                    key={i}
                    className="w-1 rounded-t-xs bg-emerald-400/80 dark:bg-emerald-500"
                    style={{ height: `${h}px` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        </Link>

        {/* KPI 2: Profit (Est.) */}
        <Link href="/reports/profit-loss" className="block h-full">
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 sm:p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                <CircleDollarSign className="h-4 w-4" />
              </span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                <span className="sm:hidden">Profit</span>
                <span className="hidden sm:inline">Profit (Est.)</span>
              </span>
            </div>
          </div>
          <div className="mt-2 sm:mt-2.5">
            <div className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-white">
              {money(p.profit)}
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="flex items-center text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="h-3 w-3 mr-0.5" />
                {profitDelta !== null ? Math.abs(profitDelta).toFixed(1) + "%" : "—"} <span className="hidden sm:inline ml-1 font-normal text-slate-400">vs yesterday</span>
              </span>
              <div className="hidden sm:flex h-4 items-end gap-0.5">
                {[5, 7, 6, 11, 9, 13, 15].map((h, i) => (
                  <span
                    key={i}
                    className="w-1 rounded-t-xs bg-blue-400/80 dark:bg-blue-500"
                    style={{ height: `${h}px` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        </Link>

        {/* KPI 3: Expenses */}
        <Link href="/finance/expenses" className="block h-full">
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 sm:p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                <ShoppingCart className="h-4 w-4" />
              </span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Expenses</span>
            </div>
          </div>
          <div className="mt-2 sm:mt-2.5">
            <div className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-white">
              {money(p.expenses)}
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="flex items-center text-[10px] font-bold text-red-500">
                <ArrowDownRight className="h-3 w-3 mr-0.5" />
                {expenseDelta !== null ? Math.abs(expenseDelta).toFixed(1) + "%" : "—"} <span className="hidden sm:inline ml-1 font-normal text-slate-400">vs yesterday</span>
              </span>
              <div className="hidden sm:flex h-4 items-end gap-0.5">
                {[14, 11, 13, 8, 9, 6, 5].map((h, i) => (
                  <span
                    key={i}
                    className="w-1 rounded-t-xs bg-amber-400/80 dark:bg-amber-500"
                    style={{ height: `${h}px` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        </Link>

        {/* KPI 4: Transactions */}
        <Link href="/finance/transactions" className="block h-full">
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 sm:p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400">
                <FileText className="h-4 w-4" />
              </span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                <span className="sm:hidden">Txn</span>
                <span className="hidden sm:inline">Transactions</span>
              </span>
            </div>
          </div>
          <div className="mt-2 sm:mt-2.5">
            <div className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-white">
              {Number(p.txCount || 0).toLocaleString("en-IN")}
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="flex items-center text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="h-3 w-3 mr-0.5" />
                {transactionDelta !== null ? Math.abs(transactionDelta).toFixed(1) + "%" : "—"} <span className="hidden sm:inline ml-1 font-normal text-slate-400">vs yesterday</span>
              </span>
              <div className="hidden sm:flex h-4 items-end gap-0.5">
                {[4, 6, 8, 10, 9, 13, 16].map((h, i) => (
                  <span
                    key={i}
                    className="w-1 rounded-t-xs bg-purple-400/80 dark:bg-purple-500"
                    style={{ height: `${h}px` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        </Link>

        {/* 5. Business Health Panel (Desktop 5th column, hidden on mobile per reference mockup) */}
        <div className="hidden xl:flex rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900 xl:col-span-1 flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-white">Business Health</span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                Overall Status: {shop.systemHealth === "critical" ? "Critical" : shop.systemHealth === "attention" ? "Attention" : "Operational"}
              </span>
            </div>

            <div className="mt-2.5 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  System
                </span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{shop.systemHealth === "critical" ? "Attention" : "Operational"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <Database className="h-3 w-3 text-emerald-600" />
                  Database
                </span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Connected</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <HardDrive className="h-3 w-3 text-emerald-600" />
                  Backup
                </span>
                <span className="font-semibold text-slate-500 dark:text-slate-400">Not reported</span>
              </div>
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-white/5">
            <div className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/50">
                <Clock className="h-3 w-3" />
              </span>
              <div>
                <p className="text-[10px] font-bold leading-tight text-amber-700 dark:text-amber-400">Day Close</p>
                <p className="text-[9px] text-amber-600 dark:text-amber-500">{data.dayCloseStatus?.statusLabel || "—"}</p>
              </div>
            </div>
            <Link
              href="/finance/day-close"
              className="rounded-lg bg-blue-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-2xs hover:bg-blue-700 transition"
            >
              Run Day Close
            </Link>
          </div>
        </div>
      </div>

      {/* 3. ROW 2: SALES & PROFIT TREND (Left) + NEEDS ATTENTION (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4">
        {/* Sales & Profit Trend (Desktop left, mobile under Quick Actions) */}
        <section className="order-3 xl:order-1 rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                <span className="xl:hidden">Sales Trend (Today)</span>
                <span className="hidden xl:inline">Sales &amp; Profit Trend</span>
              </h2>
              <div className="hidden sm:flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                {PERIODS.map((item, idx) => (
                  <button
                    key={`${item.label}-${idx}`}
                    onClick={() => setPeriod(item.key)}
                    className={`rounded-md px-2 py-1 transition ${
                      period === item.key && idx === 0
                        ? "bg-blue-600 text-white font-bold"
                        : "hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                <button className="px-1.5 py-1 hover:text-slate-900 dark:hover:text-white">
                  <SlidersHorizontal className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[10px] font-semibold">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <span className="h-2 w-2 rounded-xs bg-blue-500" />
                Sales
              </span>
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <span className="h-2 w-2 rounded-xs bg-emerald-500" />
                Profit
              </span>
            </div>
          </div>

          {/* 14-Day Peak Metric (CRITICAL TEST CONTRACT) */}
          <div className="mb-2 text-right text-[10px] font-semibold text-slate-400">
            14-Day Peak: <strong className="text-slate-900 dark:text-white">{inr(actualPeakRevenue)}</strong>
          </div>

          {/* DUAL BAR CHART CONTAINER */}
          <div className="relative h-[245px] rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-slate-950/40">
            {/* Horizontal Grid lines */}
            <div className="pointer-events-none absolute inset-3 bottom-8 flex flex-col justify-between text-[9px] text-slate-400">
              {[40, 30, 20, 10, 0].map((v) => (
                <div key={v} className="flex items-center border-b border-dashed border-slate-200/80 dark:border-white/10 w-full">
                  <span className="relative -top-2 w-8 text-left">{v ? `₹ ${v}K` : "₹ 0"}</span>
                </div>
              ))}
            </div>

            {/* Bars */}
            <div className="absolute inset-x-6 sm:inset-x-10 bottom-8 top-4 flex items-end justify-between gap-1 sm:gap-2">
              {chart.map((d: any, i: number) => {
                const sales = Number(d.revenue || 0);
                const profit = Math.max(0, sales - Number(d.expenses || 0));
                const maxVal = Math.max(max, 1);
                const sH = Math.max(2, (sales / maxVal) * 100);
                const pH = Math.max(1, (profit / maxVal) * 100);
                return (
                  <div key={d.date || i} className="group flex h-full flex-1 items-end justify-center gap-0.5 sm:gap-1">
                    <span
                      title={`Sales: ${money(sales)}`}
                      className="w-2 sm:w-3.5 rounded-t-xs bg-blue-500/85 hover:bg-blue-600 transition"
                      style={{ height: `${sH}%` }}
                    />
                    <span
                      title={`Profit: ${money(profit)}`}
                      className="w-2 sm:w-3.5 rounded-t-xs bg-emerald-500/85 hover:bg-emerald-600 transition"
                      style={{ height: `${pH}%` }}
                    />
                  </div>
                );
              })}
            </div>

            {/* X-Axis labels */}
            <div className="absolute inset-x-6 sm:inset-x-10 bottom-1 flex justify-between text-[9px] text-slate-400">
              {chart.map((d: any) => <span key={d.date}>{d.label}</span>)}
            </div>
          </div>
        </section>

        {/* Needs Attention (Desktop right, mobile directly below KPI cards) */}
        <section className="order-1 xl:order-2 rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Needs Attention</h2>
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                  {alerts.length}
                </span>
              </div>
              <Link href="/reports" className="text-xs font-bold text-blue-600 hover:underline">
                View All &rarr;
              </Link>
            </div>

            <div className="space-y-2.5">
              {alerts.slice(0, 4).map((alert: any) => (
                <Link
                  key={alert.id}
                  href={alert.actionHref || "/reports"}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-slate-800/60 transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${alert.severity === "critical" ? "bg-rose-50 text-rose-600 dark:bg-rose-950/50" : "bg-amber-50 text-amber-600 dark:bg-amber-950/50"}`}>
                      {alert.severity === "critical" ? <AlertCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{alert.title}</p>
                      <p className="truncate text-[10px] text-slate-400">{alert.reason}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-600 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">
                    {alert.actionLabel || "Open"}
                  </span>
                </Link>
              ))}
              {alerts.length === 0 && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-xs font-semibold text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300">
                  No active items require attention.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Mobile Quick Actions (Matches right mobile phone mockup in approved reference design) */}
        <section className="order-2 xl:hidden rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-slate-900 dark:text-white">Quick Actions</h2>
            <Link href="/pos" className="text-[11px] font-bold text-blue-600 hover:underline">
              View All &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-4 gap-2.5 text-center">
            <Link href="/pos" className="flex flex-col items-center gap-1 group">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 group-hover:scale-105 transition">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">POS</span>
            </Link>

            <Link href="/invoices/new" className="flex flex-col items-center gap-1 group">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 group-hover:scale-105 transition">
                <FileText className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Invoice</span>
            </Link>

            <Link href="/customers" className="flex flex-col items-center gap-1 group">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400 group-hover:scale-105 transition">
                <Users className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Customer</span>
            </Link>

            <Link href="/finance/cashbook" className="flex flex-col items-center gap-1 group">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 group-hover:scale-105 transition">
                <Banknote className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Cash</span>
            </Link>

            <Link href="/business/aeps" className="flex flex-col items-center gap-1 group">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 group-hover:scale-105 transition">
                <CreditCard className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">AEPS</span>
            </Link>

            <Link href="/business/dmt" className="flex flex-col items-center gap-1 group">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 group-hover:scale-105 transition">
                <Send className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">DMT</span>
            </Link>

            <Link href="/business/bill-payment" className="flex flex-col items-center gap-1 group">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 group-hover:scale-105 transition">
                <Zap className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Recharge</span>
            </Link>

            <Link href="/settings" className="flex flex-col items-center gap-1 group">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 group-hover:scale-105 transition">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">More</span>
            </Link>
          </div>
        </section>
      </div>

      {/* 4. ROW 3: THREE SECONDARY DATA COLUMNS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Column 1: Cash & Bank Position */}
        <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Cash &amp; Bank Position</h2>
              <Link href="/finance/cashbook" className="text-xs font-bold text-blue-600 hover:underline">
                View All &rarr;
              </Link>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1">
                <span className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50">
                    <Banknote className="h-3.5 w-3.5" />
                  </span>
                  Cash in Hand
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {exactMoney(pools.cash?.current ?? 0)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/50">
                    <CircleDollarSign className="h-3.5 w-3.5" />
                  </span>
                  Bank Account
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {exactMoney(pools.bank?.current ?? 0)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-50 text-purple-600 dark:bg-purple-950/50">
                    <Wallet className="h-3.5 w-3.5" />
                  </span>
                  UPI Wallet
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {exactMoney(pools.wallet?.current ?? 0)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50">
                    <CreditCard className="h-3.5 w-3.5" />
                  </span>
                  AEPS Balance
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {exactMoney(pools.aeps?.current ?? 0)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50">
                    <Send className="h-3.5 w-3.5" />
                  </span>
                  DMT Wallet
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {exactMoney(pools.dmt?.current ?? 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Highlight bar: Total Liquidity */}
          <div className="mt-3 flex items-center justify-between rounded-lg bg-blue-50/80 px-3 py-2 border border-blue-100 dark:border-blue-900/30 dark:bg-blue-950/30">
            <span className="flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-400">
              <Star className="h-3.5 w-3.5 text-blue-600" />
              Total Liquidity
            </span>
            <span className="text-sm font-black text-blue-700 dark:text-blue-400">
              {money(totalLiquidity)}
            </span>
          </div>
        </section>

        {/* Column 2: Inventory Snapshot */}
        <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Inventory Snapshot</h2>
              <Link href="/inventory" className="text-xs font-bold text-blue-600 hover:underline">
                View All &rarr;
              </Link>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1">
                <span className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800">
                    <Package className="h-3.5 w-3.5" />
                  </span>
                  Total Products
                </span>
                <span className="font-bold text-slate-900 dark:text-white">{Number(inventory.totalProductCount || 0).toLocaleString("en-IN")}</span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/50">
                    <Boxes className="h-3.5 w-3.5" />
                  </span>
                  In Stock
                </span>
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  {Number(inventory.inStockProductCount || 0).toLocaleString("en-IN")}
                </span>
              </div>

              <Link href="/inventory?status=low_stock" className="flex items-center justify-between py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                <span className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/50">
                    <TrendingDown className="h-3.5 w-3.5" />
                  </span>
                  Low Stock
                </span>
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                  {Number(inventory.lowStockCount || 0).toLocaleString("en-IN")}
                </span>
              </Link>

              <Link href="/inventory?status=out_of_stock" className="flex items-center justify-between py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                <span className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-50 text-rose-600 dark:bg-rose-950/50">
                    <XCircle className="h-3.5 w-3.5" />
                  </span>
                  Out of Stock
                </span>
                <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  {Number(inventory.outOfStockCount || 0).toLocaleString("en-IN")}
                </span>
              </Link>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-white/5 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Stock Value (Est.)</span>
            <span className="text-sm font-black text-slate-900 dark:text-white">
              {money(inventory.totalStockValue)}
            </span>
          </div>
        </section>

        {/* Column 3: Digital Services (Today) */}
        <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Digital Services (Today)</h2>
              <Link href="/business/aeps" className="text-xs font-bold text-blue-600 hover:underline">
                View All &rarr;
              </Link>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1">
                <span className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/50">
                    <CreditCard className="h-3.5 w-3.5" />
                  </span>
                  AEPS Transactions
                </span>
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-slate-600 dark:text-slate-400">
                    {Number(service.aeps?.count || 0)}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white w-18 text-right">
                    {money(service.aeps?.volume)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-50 text-purple-600 dark:bg-purple-950/50">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                  DMT Transactions
                </span>
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-slate-600 dark:text-slate-400">
                    {Number(service.dmt?.count || 0)}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white w-18 text-right">
                    {money(service.dmt?.volume)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/50">
                    <Smartphone className="h-3.5 w-3.5" />
                  </span>
                  UPI Transactions
                </span>
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-slate-600 dark:text-slate-400">
                    {Number(service.upi?.count || 0)}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white w-18 text-right">
                    {money(service.upi?.volume)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-50 text-rose-600 dark:bg-rose-950/50">
                    <Zap className="h-3.5 w-3.5" />
                  </span>
                  Recharge &amp; BBPS
                </span>
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-slate-600 dark:text-slate-400">
                    {Number(service.recharge?.count || 0)}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white w-18 text-right">
                    {money(service.recharge?.volume)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-white/5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
              Commission Earned
            </span>
            <span className="rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-black text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              {money(data.serviceCommissionToday ?? 0)}
            </span>
          </div>
        </section>
      </div>

      {/* 5. ROW 4: QUICK ACTIONS (Desktop horizontal action buttons) */}
      <section className="hidden xl:block rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-bold text-slate-700 dark:text-slate-200">Quick Actions</span>

          <Link
            href="/pos"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-bold shadow-2xs transition"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            New Sale (POS)
          </Link>

          <Link
            href="/invoices/new"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 text-xs font-bold shadow-2xs transition"
          >
            <FileText className="h-3.5 w-3.5" />
            New Invoice
          </Link>

          <Link
            href="/customers"
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2 text-xs font-bold shadow-2xs transition"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Customer
          </Link>

          <Link
            href="/finance/cashbook"
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white px-3.5 py-2 text-xs font-bold shadow-2xs transition"
          >
            <Banknote className="h-3.5 w-3.5" />
            Cash Entry
          </Link>

          <Link
            href="/business/aeps"
            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 px-3.5 py-2 text-xs font-bold hover:bg-blue-100 transition dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
          >
            <CreditCard className="h-3.5 w-3.5" />
            AEPS
          </Link>

          <Link
            href="/business/dmt"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white px-3.5 py-2 text-xs font-bold shadow-2xs transition"
          >
            <Send className="h-3.5 w-3.5" />
            DMT
          </Link>

          <Link
            href="/business/bill-payment"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-bold shadow-2xs transition"
          >
            <Zap className="h-3.5 w-3.5" />
            Recharge / BBPS
          </Link>

          <div className="relative ml-auto">
            <button
              onClick={() => setMore((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
            >
              <span>More Actions</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${more ? "rotate-180" : ""}`} />
            </button>

            {more && (
              <div className="absolute right-0 mt-2 z-20 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-white/10 dark:bg-slate-900">
                {moreActions.map((a) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    onClick={() => setMore(false)}
                    className="flex items-center rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {a.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 6. ROW 5: RECENT INVOICES (Left) + RECENT ACTIVITY (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-4">
        {/* Recent Invoices Table */}
        <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Recent Invoices</h2>
            <Link href="/invoices" className="text-xs font-bold text-blue-600 hover:underline">
              View All &rarr;
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:border-white/5">
                <tr>
                  <th className="pb-2.5">#</th>
                  <th className="pb-2.5">Date &amp; Time</th>
                  <th className="pb-2.5">Customer</th>
                  <th className="pb-2.5">Amount</th>
                  <th className="pb-2.5">Payment</th>
                  <th className="pb-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {(data.recentInvoices || []).map((row: any) => (
                  <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 font-bold text-blue-600 hover:underline cursor-pointer">
                      <Link href="/invoices">{row.invoiceNumber}</Link>
                    </td>
                    <td className="py-2.5 text-slate-500 dark:text-slate-400">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : row.invoiceDate || "—"}
                    </td>
                    <td className="py-2.5 font-medium text-slate-800 dark:text-slate-200">{row.customerName}</td>
                    <td className="py-2.5 font-bold text-slate-900 dark:text-white">{money(row.total)}</td>
                    <td className="py-2.5 text-slate-500 dark:text-slate-400">{row.paymentMethod}</td>
                    <td className="py-2.5">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${row.status === "paid" || Number(row.paid || 0) >= Number(row.total || 0) ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"}`}>
                        {row.status === "paid" || Number(row.paid || 0) >= Number(row.total || 0) ? "Paid" : row.status || "Unpaid"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent Activity List */}
        <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Recent Activity</h2>
            <Link href="/audit" className="text-xs font-bold text-blue-600 hover:underline">
              View All &rarr;
            </Link>
          </div>

          <div className="space-y-3 text-xs">
            {recent.slice(0, 5).map((item: any, i: number) => {
              const type = String(item.type || "").toLowerCase();
              const icon = type === "sale"
                ? <ShoppingCart className="h-3.5 w-3.5 text-emerald-600" />
                : type === "expense"
                ? <TrendingDown className="h-3.5 w-3.5 text-amber-600" />
                : type === "aeps"
                ? <CreditCard className="h-3.5 w-3.5 text-blue-600" />
                : type === "dmt"
                ? <Send className="h-3.5 w-3.5 text-indigo-600" />
                : <CheckCircle2 className="h-3.5 w-3.5 text-slate-600" />;
              const bg = type === "sale"
                ? "bg-emerald-50 dark:bg-emerald-950/50"
                : type === "expense"
                ? "bg-amber-50 dark:bg-amber-950/50"
                : type === "aeps" || type === "dmt"
                ? "bg-blue-50 dark:bg-blue-950/50"
                : "bg-slate-100 dark:bg-slate-800";
              return (
                <div key={item.id || i} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${bg}`}>{icon}</span>
                    <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{item.title || "Activity"}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-400">{ago(item.date)}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* FOOTER AUDIT STATUS STRIP */}
      <div className="mt-4 flex flex-wrap items-center justify-between px-1 text-[9px] font-semibold text-slate-400">
        <span>{shop.name || "CafeERP"} • {data.period?.fyLabel || "FY 2026-27"}</span>
        <span>
          Day Close: {data.dayCloseStatus?.statusLabel || data.dayCloseStatus?.state || "Active / Open"} • Audit:{" "}
          {audit.status || "Not available"}
        </span>
      </div>
    </div>
  );
}
