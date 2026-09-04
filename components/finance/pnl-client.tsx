"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { inr } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";

export type Pnl = {
  revenue: number;
  returns: number;
  cogs: number;
  commission_income: number;
  expenses: number;
  net_revenue: number;
  gross_profit: number;
  net_profit: number;
  invoice_count: number;
  monthly: { month: string; revenue: number; cogs: number; expenses: number; commission: number; net: number }[];
  categories: { category: string; amount: number; count: number }[];
  top_products: {
    name: string;
    revenue: number;
    cogs?: number;
    profit?: number;
    invoices?: number;
    qty?: number;
  }[];
};

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
  { key: "all", label: "All" },
] as const;

type PeriodKey = (typeof PERIODS)[number]["key"];

function periodRange(key: PeriodKey): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const start = (d: Date) => d.toISOString().slice(0, 10);
  switch (key) {
    case "today": return { from: to, to };
    case "7d": return { from: start(new Date(now.getTime() - 6 * 86400000)), to };
    case "30d": return { from: start(new Date(now.getTime() - 29 * 86400000)), to };
    case "month": return { from: start(new Date(now.getFullYear(), now.getMonth(), 1)), to };
    case "year": return { from: `${now.getFullYear()}-01-01`, to };
    case "all": return { from: "2000-01-01", to };
  }
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function PnlClient({ initialPnl, defaultFrom, defaultTo }: {
  initialPnl: Pnl | null;
  defaultFrom: string;
  defaultTo: string;
}) {
  const supabase = useMemoCreateClient();
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [pnl, setPnl] = useState<Pnl | null>(initialPnl);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [custom, setCustom] = useState(false);
  const { showToast, toastView } = useToast();

  useRealtime(["invoices", "invoice_items", "returns", "return_items", "expenses", "transactions", "products", "services"]);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_pnl", { p_from: f, p_to: t });
    if (!error) setPnl(data as Pnl);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (custom) return;
    const { from: f, to: t } = periodRange(period);
    setFrom(f); setTo(t); load(f, t);
  }, [period, custom, load]);

  const applyCustom = () => {
    if (from && to && from <= to) { setCustom(true); load(from, to); }
  };

  const maxMonthlyNet = Math.max(1, ...(pnl?.monthly ?? []).map((m) => Math.abs(safeNumber(m.net))));

  function exportStatement() {
    downloadCsv(`pnl-${from}-to-${to}.csv`, ["Line", "Amount"], [
      ["Revenue", safeNumber(pnl?.revenue)], ["Returns", -safeNumber(pnl?.returns)],
      ["Net Revenue", safeNumber(pnl?.net_revenue)], ["COGS", -safeNumber(pnl?.cogs)],
      ["Gross Profit", safeNumber(pnl?.gross_profit)], ["Commission Income", safeNumber(pnl?.commission_income)],
      ["Expenses", -safeNumber(pnl?.expenses)], ["Net Profit", safeNumber(pnl?.net_profit)],
    ]);
    showToast("success", `P&L statement ${from} → ${to} exported`);
  }

  const kpis = [
    {
      label: "Net Revenue",
      value: inr(safeNumber(pnl?.net_revenue)),
      sub: pnl ? `${inr(safeNumber(pnl.revenue))} gross − ${inr(safeNumber(pnl.returns))} returns` : "",
      icon: "M6 3h12M6 8h12M6 13h8a4 4 0 0 0 0-8H6v17",
      glow: "card-glow-indigo",
      grad: "from-blue-500 to-indigo-600",
      color: "text-indigo-700 dark:text-indigo-300",
      href: "/invoices",
    },
    {
      label: "COGS",
      value: inr(safeNumber(pnl?.cogs)),
      sub: "Cost of goods & services sold",
      icon: "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z M3.3 7 12 12l8.7-5M12 22V12",
      glow: "card-glow-amber",
      grad: "from-amber-500 to-orange-600",
      color: "text-amber-700 dark:text-amber-300",
      href: "/catalog/products",
    },
    {
      label: "Gross Profit",
      value: inr(safeNumber(pnl?.gross_profit)),
      sub: pnl ? margin(safeNumber(pnl.net_revenue), safeNumber(pnl.cogs)) : "",
      icon: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
      glow: pnl && safeNumber(pnl.gross_profit) >= 0 ? "card-glow-emerald" : "card-glow-rose",
      grad: pnl && safeNumber(pnl.gross_profit) >= 0 ? "from-emerald-500 to-teal-600" : "from-rose-500 to-pink-600",
      color: pnl && safeNumber(pnl.gross_profit) >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400",
      href: "/reports",
    },
    {
      label: "Net Profit",
      value: inr(safeNumber(pnl?.net_profit)),
      sub: pnl ? `After ${inr(safeNumber(pnl.expenses))} expenses + ${inr(safeNumber(pnl.commission_income))} commission` : "",
      icon: "M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M3 10h18M16 15h2",
      glow: pnl && safeNumber(pnl.net_profit) >= 0 ? "card-glow-purple" : "card-glow-rose",
      grad: pnl && safeNumber(pnl.net_profit) >= 0 ? "from-violet-500 to-purple-600" : "from-rose-500 to-pink-600",
      color: pnl && safeNumber(pnl.net_profit) >= 0 ? "text-purple-700 dark:text-purple-300" : "text-rose-700 dark:text-rose-400",
      href: "/finance/expenses",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8 space-y-6">
      {/* Elevated Header */}
      <header className="bento-surface card-glow-indigo relative overflow-hidden rounded-3xl border p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="icon-box-3d flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-blue-600 to-indigo-700 text-white shadow-lg shadow-indigo-500/25">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d="M18 20V10M12 20V4M6 20v-6" />
              </svg>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
                  </span>
                  Profit &amp; Loss Ledger
                </span>
                <span className="text-xs text-slate-400">· {pnl?.invoice_count ?? 0} invoices ({from} → {to})</span>
              </div>
              <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
                Profit &amp; Loss Statement
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportStatement}
              className="btn-3d-tactile-secondary flex items-center gap-2 px-4 py-2 text-xs font-bold shadow-xs"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              Export CSV
            </button>
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-white/5 border border-slate-200/80 dark:border-white/10">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => { setCustom(false); setPeriod(p.key); }}
                  className={`rounded-lg px-3 py-1.5 font-bold transition-all duration-150 active:scale-95 ${
                    period === p.key && !custom
                      ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-400"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Date Filter Bar */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-white/5">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Custom Window:</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
          />
          <button
            onClick={applyCustom}
            className="btn-3d-tactile-primary px-3.5 py-1.5 text-xs font-bold"
          >
            Apply Range
          </button>
          {loading && <span className="text-xs font-bold text-indigo-500 animate-pulse">Computing statement…</span>}
        </div>
      </header>

      {/* Hero 4 Glowing Bento KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Link
            key={kpi.label}
            href={kpi.href}
            className={`bento-surface ${kpi.glow} relative flex flex-col justify-between overflow-hidden rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${kpi.grad}`} />
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {kpi.label}
                </span>
                <div className={`icon-box-3d flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${kpi.grad} text-white shadow-sm`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d={kpi.icon} />
                  </svg>
                </div>
              </div>
              <div className={`mt-2 font-mono text-2xl font-black tracking-tight ${kpi.color}`}>
                {kpi.value}
              </div>
            </div>
            {kpi.sub && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {kpi.sub}
              </p>
            )}
          </Link>
        ))}
      </div>

      {/* Monthly Performance & Statement */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="bento-surface card-glow-indigo rounded-3xl border p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">Monthly Performance Trend</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Net profitability movements month-by-month</p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
              {period.toUpperCase()}
            </span>
          </div>
          {pnl?.monthly && pnl.monthly.length > 0 ? (
            <div className="mt-6 flex h-48 items-end gap-2 pt-6">
              {pnl.monthly.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className={`font-mono text-[10px] font-bold ${m.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {compact(m.net)}
                  </span>
                  <div
                    className={`w-full rounded-t-lg shadow-sm transition-all duration-300 ${
                      m.net >= 0
                        ? "bg-gradient-to-t from-emerald-500 to-teal-400"
                        : "bg-gradient-to-t from-rose-500 to-pink-400"
                    }`}
                    style={{ height: `${Math.max(6, (Math.abs(m.net) / maxMonthlyNet) * 100)}%` }}
                  />
                  <span className="text-[10px] font-bold text-slate-500">
                    {monthNames[Number(m.month.slice(5)) - 1]}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-12 text-center text-xs text-slate-500">No transactions recorded for this period.</p>
          )}
        </div>

        <div className="bento-surface card-glow-emerald rounded-3xl border p-6 shadow-sm">
          <h2 className="text-base font-black text-slate-900 dark:text-white">Statement Summary</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Step-by-step P&amp;L derivation</p>
          <div className="mt-5 space-y-3 text-sm">
            <StatementRow label="Revenue" value={safeNumber(pnl?.revenue)} tone="emerald" />
            <StatementRow label="Less: Returns / Refunds" value={-safeNumber(pnl?.returns)} tone="rose" />
            <StatementRow label="Net Revenue" value={safeNumber(pnl?.net_revenue)} tone="slate" strong />
            <StatementRow label="Less: COGS" value={-safeNumber(pnl?.cogs)} tone="amber" />
            <StatementRow label="Gross Profit" value={safeNumber(pnl?.gross_profit)} tone="slate" strong />
            <StatementRow label="Commission Income" value={safeNumber(pnl?.commission_income)} tone="emerald" />
            <StatementRow label="Less: Expenses" value={-safeNumber(pnl?.expenses)} tone="rose" />
            <div className="border-t border-slate-200/80 pt-3 dark:border-white/10">
              <StatementRow label="Net Profit" value={safeNumber(pnl?.net_profit)} tone={pnl && safeNumber(pnl.net_profit) >= 0 ? "blue" : "rose"} strong large />
            </div>
          </div>
        </div>
      </div>

      {/* Top Products by Profit */}
      <div className="bento-surface card-glow-indigo rounded-3xl border p-6 shadow-sm">
        <h2 className="text-base font-black text-slate-900 dark:text-white">Top Products &amp; Services by Profit</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Item-level margins and contribution ranking</p>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pnl?.top_products && pnl.top_products.length > 0 ? (
            pnl.top_products.map((p) => {
              const revenue = safeNumber(p.revenue);
              const cogs = safeNumber(p.cogs);
              const profit = p.profit == null ? revenue - cogs : safeNumber(p.profit);
              const invoices = p.invoices == null ? safeNumber(p.qty) : safeNumber(p.invoices);
              return (
                <div key={p.name} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5 transition hover:border-indigo-200 dark:border-white/5 dark:bg-white/[0.02] dark:hover:border-indigo-500/30">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{p.name}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                      {inr(revenue)} rev · {inr(cogs)} cost · {invoices} inv
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-xs font-bold ${
                    profit >= 0
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                  }`}>
                    {profit >= 0 ? "+" : ""}{inr(profit)}
                  </span>
                </div>
              );
            })
          ) : (
            <p className="col-span-full py-6 text-center text-xs text-slate-500">No product sales recorded in this period.</p>
          )}
        </div>
      </div>

      {toastView}
    </div>
  );
}

function useMemoCreateClient() { return createClient(); }
function margin(revenue: number, cogs: number) { return revenue > 0 ? `${(((revenue - cogs) / revenue) * 100).toFixed(1)}% margin` : "0.0% margin"; }
function compact(value: number) { const n = safeNumber(value); return n >= 1000000 ? `₹${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${Math.round(n)}`; }
function StatementRow({ label, value, tone, strong, large }: { label: string; value: number; tone: string; strong?: boolean; large?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${strong ? "font-bold" : "font-medium"} text-slate-600 dark:text-slate-400`}>{label}</span>
      <span className={`font-mono ${strong ? "font-black" : "font-bold"} ${large ? "text-lg" : "text-sm"} ${
        tone === "rose" ? "text-rose-600 dark:text-rose-400" :
        tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
        tone === "amber" ? "text-amber-600 dark:text-amber-400" :
        tone === "blue" ? "text-indigo-600 dark:text-indigo-400" :
        "text-slate-900 dark:text-white"
      }`}>
        {inr(safeNumber(value))}
      </span>
    </div>
  );
}

