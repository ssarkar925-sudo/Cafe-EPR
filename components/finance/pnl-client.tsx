"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { getIstDateString } from "@/lib/date";
import { inr } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";

export type Pnl = {
  revenue: number;
  returns: number;
  cogs: number;
  commission: number;
  commission_income: number;
  expenses: number;
  net_revenue: number;
  gross_profit: number;
  operating_income?: number;
  total_income?: number;
  net_profit: number;
  gross_margin_percent?: number;
  margin_percent?: number;
  operating_margin_percent?: number;
  net_margin_percent?: number;
  product_cogs?: number;
  service_direct_cost?: number;
  custom_direct_cost?: number;
  quick_sale_cost?: number;
  verified_cogs?: number;
  unverified_cost_count?: number;
  unverified_cost_warning?: boolean;
  warning_message?: string | null;
  profit_label?: string;
  invoice_count: number;
  invoices_count?: number;
  monthly: { month: string; revenue: number; cogs: number; expenses: number; commission: number; net: number }[];
  categories: { category: string; amount: number; count?: number }[];
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

function shiftDate(dateString: string, days: number): string {
  const d = new Date(`${dateString}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function periodRange(key: PeriodKey): { from: string; to: string } {
  const to = getIstDateString();
  const [year, month] = to.split("-").map(Number);
  switch (key) {
    case "today":
      return { from: to, to };
    case "7d":
      return { from: shiftDate(to, -6), to };
    case "30d":
      return { from: shiftDate(to, -29), to };
    case "month":
      return { from: `${year}-${String(month).padStart(2, "0")}-01`, to };
    case "year":
      return { from: `${year}-01-01`, to };
    case "all":
      return { from: "2000-01-01", to };
  }
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function percent(value: unknown): string {
  return `${safeNumber(value).toFixed(1)}%`;
}

export default function PnlClient({ initialPnl, defaultFrom, defaultTo }: {
  initialPnl: Pnl | null;
  defaultFrom: string;
  defaultTo: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [pnl, setPnl] = useState<Pnl | null>(initialPnl);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [custom, setCustom] = useState(false);
  const { showToast, toastView } = useToast();

  useRealtime(["invoices", "invoice_items", "returns", "return_items", "expenses", "transactions", "quick_sales", "products", "services"]);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    setErrorMessage(null);
    const { data, error } = await supabase.rpc("get_pnl", { p_from: f, p_to: t });
    if (error) {
      setErrorMessage(error.message || "Unable to compute the P&L statement.");
    } else {
      setPnl(data as Pnl);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (custom) return;
    const { from: f, to: t } = periodRange(period);
    setFrom(f);
    setTo(t);
    load(f, t);
  }, [period, custom, load]);

  const applyCustom = () => {
    if (from && to && from <= to) {
      setCustom(true);
      load(from, to);
    }
  };

  const numbers = useMemo(() => {
    const revenue = safeNumber(pnl?.revenue);
    const returns = safeNumber(pnl?.returns);
    const netRevenue = safeNumber(pnl?.net_revenue || revenue - returns);
    const cogs = safeNumber(pnl?.cogs);
    const grossProfit = safeNumber(pnl?.gross_profit || netRevenue - cogs);
    const commission = safeNumber(pnl?.commission_income ?? pnl?.commission);
    const operatingIncome = safeNumber(pnl?.operating_income ?? grossProfit + commission);
    const totalIncome = safeNumber(pnl?.total_income ?? netRevenue + commission);
    const expenses = safeNumber(pnl?.expenses);
    const netProfit = safeNumber(pnl?.net_profit ?? operatingIncome - expenses);
    return {
      revenue,
      returns,
      netRevenue,
      cogs,
      grossProfit,
      commission,
      operatingIncome,
      totalIncome,
      expenses,
      netProfit,
      grossMargin: safeNumber(pnl?.gross_margin_percent ?? pnl?.margin_percent ?? (netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0)),
      operatingMargin: safeNumber(pnl?.operating_margin_percent ?? (totalIncome > 0 ? (operatingIncome / totalIncome) * 100 : 0)),
      netMargin: safeNumber(pnl?.net_margin_percent ?? (totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0)),
      productCogs: safeNumber(pnl?.product_cogs),
      serviceCost: safeNumber(pnl?.service_direct_cost),
      customCost: safeNumber(pnl?.custom_direct_cost),
      quickSaleCost: safeNumber(pnl?.quick_sale_cost),
      verifiedCogs: safeNumber(pnl?.verified_cogs ?? pnl?.cogs),
      unverifiedCount: safeNumber(pnl?.unverified_cost_count),
    };
  }, [pnl]);

  const maxMonthlyNet = Math.max(1, ...(pnl?.monthly ?? []).map((m) => Math.abs(safeNumber(m.net))));
  const expenseCategories = useMemo(() => pnl?.categories ?? [], [pnl]);

  function exportStatement() {
    downloadCsv(`pnl-${from}-to-${to}.csv`, ["Section", "Line", "Amount"], [
      ["Revenue", "Gross Revenue", numbers.revenue],
      ["Revenue", "Returns / Refunds", -numbers.returns],
      ["Revenue", "Net Revenue", numbers.netRevenue],
      ["Direct Costs", "Product COGS", -numbers.productCogs],
      ["Direct Costs", "Service Direct Cost", -numbers.serviceCost],
      ["Direct Costs", "Custom Direct Cost", -numbers.customCost],
      ["Direct Costs", "Quick Sale Cost", -numbers.quickSaleCost],
      ["Direct Costs", "Total COGS", -numbers.cogs],
      ["Profit", "Gross Profit", numbers.grossProfit],
      ["Income", "Commission / Service Income", numbers.commission],
      ["Profit", "Operating Income", numbers.operatingIncome],
      ["Expenses", "Operating Expenses", -numbers.expenses],
      ["Profit", "Net Profit", numbers.netProfit],
    ]);
    showToast("success", `Detailed P&L ${from} → ${to} exported`);
  }

  const kpis = [
    { label: "Net Revenue", value: inr(numbers.netRevenue), sub: `${inr(numbers.revenue)} gross − ${inr(numbers.returns)} returns`, grad: "from-blue-500 to-indigo-600", color: "text-indigo-700 dark:text-indigo-300", glow: "card-glow-indigo", href: "/invoices" },
    { label: "Gross Profit", value: inr(numbers.grossProfit), sub: `${percent(numbers.grossMargin)} gross margin`, grad: "from-emerald-500 to-teal-600", color: "text-emerald-700 dark:text-emerald-400", glow: "card-glow-emerald", href: "/reports" },
    { label: "Commission Income", value: inr(numbers.commission), sub: "Service / portal commission income", grad: "from-cyan-500 to-sky-600", color: "text-cyan-700 dark:text-cyan-300", glow: "card-glow-cyan", href: "/finance" },
    { label: "Operating Income", value: inr(numbers.operatingIncome), sub: `${percent(numbers.operatingMargin)} operating margin`, grad: "from-violet-500 to-purple-600", color: "text-purple-700 dark:text-purple-300", glow: "card-glow-purple", href: "/finance" },
    { label: "Operating Expenses", value: inr(numbers.expenses), sub: expenseCategories.length ? `${expenseCategories.length} expense categories` : "No active operating expenses", grad: "from-amber-500 to-orange-600", color: "text-amber-700 dark:text-amber-300", glow: "card-glow-amber", href: "/finance/expenses" },
    { label: "Net Profit", value: inr(numbers.netProfit), sub: `${percent(numbers.netMargin)} net margin`, grad: numbers.netProfit >= 0 ? "from-fuchsia-500 to-violet-600" : "from-rose-500 to-pink-600", color: numbers.netProfit >= 0 ? "text-fuchsia-700 dark:text-fuchsia-300" : "text-rose-700 dark:text-rose-400", glow: numbers.netProfit >= 0 ? "card-glow-purple" : "card-glow-rose", href: "/finance" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 lg:px-8">
      <header className="bento-surface card-glow-indigo relative overflow-hidden rounded-3xl border p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" /></span>
                Profit &amp; Loss
              </span>
              <span className="text-xs text-slate-400">{pnl?.invoice_count ?? 0} invoices · {from} → {to}</span>
            </div>
            <h1 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">Detailed Profit &amp; Loss Statement</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
              Revenue, returns, direct costs, commission income, operating expenses and final business profit, with GST and pass-through amounts excluded from operating revenue.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={exportStatement} className="btn-3d-tactile-secondary px-4 py-2 text-xs font-bold">Export Detailed CSV</button>
            <div className="flex rounded-xl border border-slate-200/80 bg-slate-100 p-1 text-xs dark:border-white/10 dark:bg-white/5">
              {PERIODS.map((p) => (
                <button key={p.key} onClick={() => { setCustom(false); setPeriod(p.key); }} className={`rounded-lg px-3 py-1.5 font-bold transition ${period === p.key && !custom ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-400" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}>{p.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-white/5">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Statement window:</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-slate-900 dark:text-slate-200" />
          <span className="text-xs text-slate-400">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-slate-900 dark:text-slate-200" />
          <button onClick={applyCustom} className="btn-3d-tactile-primary px-3.5 py-1.5 text-xs font-bold">Apply Range</button>
          {loading && <span className="text-xs font-bold text-indigo-500 animate-pulse">Computing…</span>}
          {errorMessage && <span className="text-xs font-bold text-rose-600">{errorMessage}</span>}
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className={`bento-surface ${kpi.glow} relative overflow-hidden rounded-2xl border p-5 transition hover:-translate-y-0.5 hover:shadow-md`}>
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${kpi.grad}`} />
            <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{kpi.label}</p>
            <p className={`mt-2 font-mono text-2xl font-black ${kpi.color}`}>{kpi.value}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{kpi.sub}</p>
          </Link>
        ))}
      </section>

      {(pnl?.unverified_cost_warning || numbers.unverifiedCount > 0) && (
        <section className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-950/20">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-amber-800 dark:text-amber-300">P&amp;L control warning</p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">{pnl?.warning_message || `${numbers.unverifiedCount} cost line(s) have an unverified cost basis.`}</p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">{pnl?.profit_label || "Profit before unverified costs"}</span>
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="bento-surface rounded-3xl border p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">Formal P&amp;L Derivation</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Every amount in the final profit is visible and traceable.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:bg-white/5 dark:text-slate-300">Accrual view</span>
          </div>
          <div className="mt-6 space-y-1">
            <StatementSection label="Revenue" />
            <StatementRow label="Gross revenue" value={numbers.revenue} tone="positive" />
            <StatementRow label="Less: returns / refunds" value={-numbers.returns} tone="negative" />
            <StatementRow label="Net revenue" value={numbers.netRevenue} tone="neutral" strong />

            <StatementSection label="Direct Costs / COGS" />
            <StatementRow label="Product COGS" value={-numbers.productCogs} tone="cost" />
            <StatementRow label="Service direct cost" value={-numbers.serviceCost} tone="cost" />
            <StatementRow label="Custom direct cost" value={-numbers.customCost} tone="cost" />
            <StatementRow label="Quick-sale cost" value={-numbers.quickSaleCost} tone="cost" />
            <StatementRow label="Total COGS" value={-numbers.cogs} tone="cost" strong />
            <StatementRow label="Gross profit" value={numbers.grossProfit} tone={numbers.grossProfit >= 0 ? "profit" : "negative"} strong />

            <StatementSection label="Other Operating Income" />
            <StatementRow label="Commission / service income" value={numbers.commission} tone="positive" />
            <StatementRow label="Operating income" value={numbers.operatingIncome} tone="neutral" strong />

            <StatementSection label="Operating Expenses" />
            <StatementRow label="Operating expenses" value={-numbers.expenses} tone="negative" strong />
            <div className="mt-3 border-t border-slate-200/80 pt-3 dark:border-white/10">
              <StatementRow label="Net profit" value={numbers.netProfit} tone={numbers.netProfit >= 0 ? "profit" : "negative"} strong large />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bento-surface card-glow-emerald rounded-3xl border p-6 shadow-sm">
            <h2 className="text-base font-black text-slate-900 dark:text-white">Margin Analysis</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Performance percentages for this window.</p>
            <div className="mt-5 space-y-4">
              <MetricBar label="Gross margin" value={numbers.grossMargin} />
              <MetricBar label="Operating margin" value={numbers.operatingMargin} />
              <MetricBar label="Net margin" value={numbers.netMargin} strong />
            </div>
          </div>
          <div className="bento-surface rounded-3xl border p-6 shadow-sm">
            <h2 className="text-base font-black text-slate-900 dark:text-white">Control Totals</h2>
            <div className="mt-4 space-y-3">
              <ControlRow label="Invoices" value={String(pnl?.invoice_count ?? 0)} />
              <ControlRow label="Verified COGS" value={inr(numbers.verifiedCogs)} />
              <ControlRow label="Unverified cost lines" value={String(numbers.unverifiedCount)} />
              <ControlRow label="Total income base" value={inr(numbers.totalIncome)} />
              <ControlRow label="Profit status" value={numbers.netProfit >= 0 ? "PROFIT" : "LOSS"} valueClass={numbers.netProfit >= 0 ? "text-emerald-600" : "text-rose-600"} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bento-surface rounded-3xl border p-6 shadow-sm">
          <h2 className="text-base font-black text-slate-900 dark:text-white">COGS Composition</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Where the direct cost is coming from.</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <CostCard label="Product COGS" value={numbers.productCogs} total={numbers.cogs} />
            <CostCard label="Service Direct Cost" value={numbers.serviceCost} total={numbers.cogs} />
            <CostCard label="Custom Direct Cost" value={numbers.customCost} total={numbers.cogs} />
            <CostCard label="Quick Sale Cost" value={numbers.quickSaleCost} total={numbers.cogs} />
          </div>
        </div>

        <div className="bento-surface rounded-3xl border p-6 shadow-sm">
          <h2 className="text-base font-black text-slate-900 dark:text-white">Expense Breakdown</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Active operating expenses by category.</p>
          <div className="mt-5 space-y-2">
            {expenseCategories.length ? expenseCategories.map((c) => (
              <div key={c.category} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 dark:border-white/5 dark:bg-white/[0.02]">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{c.category || "Uncategorised"}</p>
                  {c.count != null && <p className="text-[10px] text-slate-500">{c.count} voucher(s)</p>}
                </div>
                <span className="font-mono text-xs font-black text-rose-600 dark:text-rose-400">{inr(safeNumber(c.amount))}</span>
              </div>
            )) : <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-white/10">No operating expenses for this period.</p>}
          </div>
        </div>
      </section>

      <section className="bento-surface rounded-3xl border p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">Monthly Profitability Trend</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Revenue, COGS, commission and expenses roll into monthly net profit.</p>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">{period.toUpperCase()}</span>
        </div>
        {pnl?.monthly?.length ? (
          <div className="mt-6 flex h-52 items-end gap-2 overflow-x-auto pt-8">
            {pnl.monthly.map((m) => (
              <div key={m.month} className="flex min-w-12 flex-1 flex-col items-center gap-1.5">
                <span className={`font-mono text-[10px] font-bold ${safeNumber(m.net) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{compact(m.net)}</span>
                <div className={`w-full rounded-t-lg shadow-sm ${safeNumber(m.net) >= 0 ? "bg-gradient-to-t from-emerald-500 to-teal-400" : "bg-gradient-to-t from-rose-500 to-pink-400"}`} style={{ height: `${Math.max(8, (Math.abs(safeNumber(m.net)) / maxMonthlyNet) * 100)}%` }} />
                <span className="text-[10px] font-bold text-slate-500">{monthNames[Math.max(0, Number(m.month.slice(5)) - 1)]}</span>
              </div>
            ))}
          </div>
        ) : <p className="mt-10 text-center text-xs text-slate-500">No P&amp;L activity recorded for this period.</p>}
      </section>

      <section className="bento-surface rounded-3xl border p-6 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">Top Products &amp; Services</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Revenue contribution and unit-level profit visibility.</p>
          </div>
          <span className="text-[10px] font-bold text-slate-400">Top 10 by revenue</span>
        </div>
        <div className="mt-5 overflow-x-auto">
          {pnl?.top_products?.length ? (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] font-black uppercase tracking-wider text-slate-500 dark:border-white/10">
                  <th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Revenue</th><th className="px-3 py-2 text-right">COGS</th><th className="px-3 py-2 text-right">Profit</th><th className="px-3 py-2 text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {pnl.top_products.map((p) => {
                  const revenue = safeNumber(p.revenue);
                  const cogs = safeNumber(p.cogs);
                  const profit = p.profit == null ? revenue - cogs : safeNumber(p.profit);
                  const qty = safeNumber(p.qty ?? p.invoices);
                  const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;
                  return (
                    <tr key={p.name} className="border-b border-slate-100 dark:border-white/5">
                      <td className="max-w-[260px] truncate px-3 py-3 font-bold text-slate-900 dark:text-white">{p.name}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-slate-500">{qty}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs font-bold">{inr(revenue)}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-amber-700 dark:text-amber-300">{inr(cogs)}</td>
                      <td className={`px-3 py-3 text-right font-mono text-xs font-black ${profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{inr(profit)}</td>
                      <td className={`px-3 py-3 text-right font-mono text-xs font-black ${marginPct >= 0 ? "text-slate-700 dark:text-slate-200" : "text-rose-600"}`}>{percent(marginPct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p className="py-8 text-center text-xs text-slate-500">No product or service sales recorded in this period.</p>}
        </div>
      </section>

      <section className="bento-surface rounded-3xl border p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Accounting basis</p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
              P&amp;L recognises taxable business revenue, reverses completed sales returns, includes direct COGS and earned commission/service income, and subtracts active operating expenses. GST liabilities, customer deposits, portal floats and settlement transfers remain balance-sheet or clearing movements rather than profit.
            </p>
          </div>
          <Link href="/finance/reconciliation" className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-indigo-600 hover:bg-slate-50 dark:border-white/10 dark:text-indigo-300 dark:hover:bg-white/5">Open Reconciliation →</Link>
        </div>
      </section>

      {toastView}
    </div>
  );
}

function StatementSection({ label }: { label: string }) {
  return <div className="pb-1 pt-4 text-[10px] font-black uppercase tracking-widest text-slate-400 first:pt-0">{label}</div>;
}

function StatementRow({ label, value, tone, strong, large }: { label: string; value: number; tone: "positive" | "negative" | "cost" | "neutral" | "profit"; strong?: boolean; large?: boolean }) {
  const toneClass = tone === "negative" ? "text-rose-600 dark:text-rose-400" : tone === "cost" ? "text-amber-700 dark:text-amber-300" : tone === "positive" ? "text-emerald-600 dark:text-emerald-400" : tone === "profit" ? "text-indigo-700 dark:text-indigo-300" : "text-slate-900 dark:text-white";
  return <div className="flex items-center justify-between gap-4 rounded-lg px-2 py-2"><span className={`${strong ? "font-black" : "font-medium"} ${large ? "text-base" : "text-sm"} text-slate-600 dark:text-slate-400`}>{label}</span><span className={`${strong ? "font-black" : "font-bold"} ${large ? "text-lg" : "text-sm"} font-mono ${toneClass}`}>{inr(value)}</span></div>;
}

function MetricBar({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  const width = Math.max(0, Math.min(100, Math.abs(value)));
  return <div><div className="mb-1.5 flex items-center justify-between text-xs"><span className={strong ? "font-black text-slate-900 dark:text-white" : "font-bold text-slate-600 dark:text-slate-400"}>{label}</span><span className={`font-mono font-black ${value >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{percent(value)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5"><div className={`h-full rounded-full ${value >= 0 ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${width}%` }} /></div></div>;
}

function ControlRow({ label, value, valueClass = "text-slate-900 dark:text-white" }: { label: string; value: string; valueClass?: string }) {
  return <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0 dark:border-white/5"><span className="text-xs font-medium text-slate-500">{label}</span><span className={`font-mono text-xs font-black ${valueClass}`}>{value}</span></div>;
}

function CostCard({ label, value, total }: { label: string; value: number; total: number }) {
  const share = total > 0 ? (value / total) * 100 : 0;
  return <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-white/5 dark:bg-white/[0.02]"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 font-mono text-base font-black text-amber-700 dark:text-amber-300">{inr(value)}</p><p className="mt-1 text-[10px] text-slate-400">{percent(share)} of COGS</p></div>;
}

function compact(value: number) {
  const n = safeNumber(value);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return abs >= 1000000 ? `${sign}₹${(abs / 1000000).toFixed(1)}M` : abs >= 1000 ? `${sign}₹${(abs / 1000).toFixed(1)}k` : `${sign}₹${Math.round(abs)}`;
}
