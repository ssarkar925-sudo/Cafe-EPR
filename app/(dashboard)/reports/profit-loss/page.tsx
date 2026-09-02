import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserRole, hasRole } from "@/lib/authz";
import { inr } from "@/lib/format";
import {
  ChevronRight,
  TrendingUp,
  Receipt,
  Layers,
  Percent,
  Download,
  FileSpreadsheet,
  Building2,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProfitLossPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");
  const supabase = await createClient();
  const [{ data: invoices }, { data: returns }, { data: expenses }, { data: quickSales }, { data: transactions }] = await Promise.all([
    supabase.from("invoices").select("invoice_date,total,status").neq("status", "cancelled").limit(5000),
    supabase.from("returns").select("return_date,subtotal,status").eq("status", "completed").limit(5000),
    supabase.from("expenses").select("expense_date,amount,status").eq("status", "active").limit(5000),
    supabase.from("quick_sales").select("sale_date,amount,cost,status").eq("status", "active").limit(5000),
    supabase.from("transactions").select("transaction_date,service_type,service_fee,portal_commission,status").eq("status", "success").limit(5000),
  ]);

  const sales = (invoices ?? []).reduce((s, x) => s + Number(x.total || 0), 0);
  const returnsTotal = (returns ?? []).reduce((s, x) => s + Number(x.subtotal || 0), 0);
  const quickRevenue = (quickSales ?? []).reduce((s, x) => s + Number(x.amount || 0), 0);
  const quickCost = (quickSales ?? []).reduce((s, x) => s + Number(x.cost || 0), 0);
  const serviceIncome = (transactions ?? []).reduce((s, x) => {
    const fee = Number(x.service_fee || 0);
    const commission = Number(x.portal_commission || 0);
    return s + (x.service_type === "dmt" ? fee - commission : fee + commission);
  }, 0);
  const expensesTotal = (expenses ?? []).reduce((s, x) => s + Number(x.amount || 0), 0);
  const net = sales - returnsTotal + quickRevenue - quickCost + serviceIncome - expensesTotal;
  const grossSales = sales + quickRevenue;
  const grossProfit = sales - returnsTotal + quickRevenue - quickCost + serviceIncome;
  const margin = grossSales > 0 ? (net / grossSales) * 100 : 0;

  const rows = [
    ["POS / Invoice Sales Revenue", sales, "positive"],
    ["POS Quick Sales Revenue", quickRevenue, "positive"],
    ["Less: Sales Returns & Refunds", -returnsTotal, "negative"],
    ["Less: POS Inventory COGS", -quickCost, "negative"],
    ["Service Fees & Commission Income", serviceIncome, "positive"],
    ["Gross Operating Profit", grossProfit, "subtotal"],
    ["Less: Operating Expenses", -expensesTotal, "negative"],
    ["NET OPERATING PROFIT", net, "total"],
  ];

  const csv = [
    ["Line Item", "Amount (INR)"],
    ...rows.map(([label, value]) => [label, Number(value).toFixed(2)]),
    ["Net Margin (%)", `${margin.toFixed(2)}%`],
  ].map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
  const exportHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;

  return (
    <div className="space-y-6 pb-12" id="profit-loss-report">
      {/* Top Breadcrumbs & Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Link href="/reports" className="hover:text-blue-600 dark:hover:text-blue-400">
              Reports &amp; Tax Hub
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-bold text-slate-900 dark:text-white">Profit &amp; Loss Statement</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-white">
            Profit &amp; Loss Statement
          </h1>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
            Deterministic P&amp;L accounting: Revenue, returns, POS COGS, service fees, and operating expenses.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <a
            href={exportHref}
            download={`profit-loss-statement.csv`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-blue-500"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </a>
          <Link
            href="/reports/tax-preparation"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Tax Workspace</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Gross Turnover
            </span>
            <span className="rounded-md bg-blue-50 p-1 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-950 dark:text-white tabular-nums">
            {inr(grossSales)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">POS Invoices + Quick Sales</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Gross Profit
            </span>
            <span className="rounded-md bg-slate-100 p-1 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <Layers className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-950 dark:text-white tabular-nums">
            {inr(grossProfit)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">After returns, COGS &amp; fees</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Expenses
            </span>
            <span className="rounded-md bg-rose-50 p-1 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
              <Receipt className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400 tabular-nums">
            {inr(expensesTotal)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Active recorded outflows</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Net Profit
            </span>
            <span className="rounded-md bg-emerald-50 p-1 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Percent className="h-4 w-4" />
            </span>
          </div>
          <div className={`mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums ${net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {inr(net)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Margin: {margin.toFixed(2)}%</div>
        </div>
      </div>

      {/* Statement Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">Operating Profit &amp; Loss Breakdown</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">All amounts in Indian Rupees (INR)</p>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {rows.map(([label, value, type]) => {
            const isTotal = type === "total";
            const isSubtotal = type === "subtotal";
            const num = Number(value);

            return (
              <div
                key={String(label)}
                className={`flex items-center justify-between px-5 py-3.5 text-sm ${
                  isTotal
                    ? "bg-slate-950 font-bold text-white dark:bg-white dark:text-slate-950"
                    : isSubtotal
                    ? "bg-slate-50/70 font-semibold text-slate-950 dark:bg-white/5 dark:text-white"
                    : "text-slate-700 dark:text-slate-300"
                }`}
              >
                <span>{String(label)}</span>
                <span
                  className={`font-mono text-sm tabular-nums ${
                    isTotal
                      ? num >= 0
                        ? "text-emerald-400 dark:text-emerald-600 font-bold"
                        : "text-rose-400 dark:text-rose-600 font-bold"
                      : isSubtotal
                      ? "font-bold text-slate-950 dark:text-white"
                      : num < 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-slate-950 dark:text-white"
                  }`}
                >
                  {inr(num)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Compliance Note */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-950 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
        <strong>Accounting Standard:</strong> Net Operating Margin is <strong>{margin.toFixed(2)}%</strong>. Customer principal volumes for AEPS, DMT, and UPI cash disbursements are strictly handled as pass-through float movements and excluded from taxable income.
      </div>
    </div>
  );
}
