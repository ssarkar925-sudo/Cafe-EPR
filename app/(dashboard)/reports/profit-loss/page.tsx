import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserRole, hasRole } from "@/lib/authz";
import { inr } from "@/lib/format";
import { ChevronRight, TrendingUp, Receipt, Layers, Percent, Download, FileSpreadsheet } from "lucide-react";

export const dynamic = "force-dynamic";

type AccountRow = { code: string; name: string; account_type: string; debit: number | string; credit: number | string };

export default async function ProfitLossPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");
  const supabase = await createClient();

  // The P&L is an accounting statement: posted double-entry journals are the source of truth.
  // Operational tables are retained only for the Quick Sale / invoice cost reconciliation details.
  const [{ data: accounts }, { data: invoiceItems }, { data: quickSales }] = await Promise.all([
    supabase.from("accounting_accounts").select("code,name,account_type").eq("is_active", true).order("code"),
    supabase.from("invoice_items").select("invoice_id,qty,returned_qty,cost_price,profit_amount,profit_margin_pct").limit(20000),
    supabase.from("quick_sales").select("amount,cost,status").eq("status", "active").limit(5000),
  ]);

  const accountIds = (accounts ?? []).map((a) => a.code);
  const { data: lines } = await supabase
    .from("journal_lines")
    .select("debit,credit,account_id,accounting_accounts!inner(code,name,account_type)")
    .in("accounting_accounts.code", accountIds.length ? accountIds : ["__none__"]);

  const byCode = new Map<string, AccountRow>();
  for (const a of accounts ?? []) byCode.set(a.code, { ...a, debit: 0, credit: 0 });
  for (const l of lines ?? []) {
    const a = (l as any).accounting_accounts;
    if (!a?.code) continue;
    const row = byCode.get(a.code);
    if (!row) continue;
    row.debit = Number(row.debit) + Number((l as any).debit || 0);
    row.credit = Number(row.credit) + Number((l as any).credit || 0);
  }

  const balance = (code: string) => {
    const a = byCode.get(code);
    if (!a) return 0;
    // Income accounts carry credit balances; expense accounts carry debit balances.
    // Contra-income is handled explicitly below because sales returns are debits while
    // purchase returns are credits and belong on the cost side of the P&L.
    return a.account_type === "income"
      ? Number(a.credit) - Number(a.debit)
      : Number(a.debit) - Number(a.credit);
  };

  const productSales = balance("4000");
  const serviceRevenue = balance("4010");
  const serviceFees = balance("4020");
  const commissionIncome = balance("4030");
  const salesReturns = (() => { const a = byCode.get("5100"); return a ? Number(a.debit) - Number(a.credit) : 0; })();
  const purchaseReturns = (() => { const a = byCode.get("4100"); return a ? Number(a.credit) - Number(a.debit) : 0; })();
  const cogs = balance("5000");
  const inventoryAdjustment = balance("5200");
  const operatingExpenses = balance("6000");

  const totalRevenue = productSales + serviceRevenue + serviceFees + commissionIncome;
  const grossProfit = totalRevenue - salesReturns - cogs + purchaseReturns - inventoryAdjustment;
  const net = grossProfit - operatingExpenses;
  const margin = totalRevenue > 0 ? (net / totalRevenue) * 100 : 0;

  const quickRevenue = (quickSales ?? []).reduce((s, x) => s + Number(x.amount || 0), 0);
  const quickCost = (quickSales ?? []).reduce((s, x) => s + Number(x.cost || 0), 0);
  const quickProfit = quickRevenue - quickCost;
  const quickMargin = quickRevenue > 0 ? (quickProfit / quickRevenue) * 100 : 0;
  const invoiceCost = (invoiceItems ?? []).reduce((s, x) => {
    const qty = Math.max(0, Number(x.qty || 0) - Number(x.returned_qty || 0));
    return s + Number(x.cost_price || 0) * qty;
  }, 0);

  const rows: [string, number, string][] = [
    ["Product Sales Revenue", productSales, "positive"],
    ["Service Revenue", serviceRevenue, "positive"],
    ["Service Fees", serviceFees, "positive"],
    ["Commission Income", commissionIncome, "positive"],
    ["Less: Sales Returns", -salesReturns, "negative"],
    ["Less: Cost of Goods Sold", -cogs, "negative"],
    ["Add: Purchase Returns", purchaseReturns, "positive"],
    ["Less: Inventory Adjustments", -inventoryAdjustment, "negative"],
    ["Gross Operating Profit", grossProfit, "subtotal"],
    ["Less: Operating Expenses", -operatingExpenses, "negative"],
    ["NET OPERATING PROFIT", net, "total"],
  ];

  const csv = [
    ["Line Item", "Amount (INR)"],
    ...rows.map(([label, value]) => [label, Number(value).toFixed(2)]),
    ["Quick Sale Revenue Detail", quickRevenue.toFixed(2)],
    ["Quick Sale Saved COGS Detail", quickCost.toFixed(2)],
    ["Quick Sale Profit Detail", quickProfit.toFixed(2)],
    ["Quick Sale Margin Detail (%)", `${quickMargin.toFixed(2)}%`],
    ["Invoice Item COGS Detail", invoiceCost.toFixed(2)],
    ["Net Margin (%)", `${margin.toFixed(2)}%`],
  ].map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
  const exportHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;

  return (
    <div className="space-y-6 pb-12" id="profit-loss-report">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Link href="/reports" className="hover:text-blue-600 dark:hover:text-blue-400">
              Reports &amp; Tax Hub
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-bold text-slate-900 dark:text-white">Profit &amp; Loss Statement</span>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl dark:text-white">
            Profit &amp; Loss Statement
          </h1>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm dark:text-slate-400">
            Posted double-entry GL is the authoritative source of truth. Operational snapshots are reconciled below.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <a
            href={exportHref}
            download="profit-loss-statement.csv"
            className="btn-3d-tactile-primary inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-blue-500/20 hover:brightness-110 active:scale-95"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </a>
          <Link
            href="/reports/tax-preparation"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-95 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Tax Workspace</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Total Revenue"
          value={inr(totalRevenue)}
          icon={<TrendingUp className="h-4 w-4" />}
          note="Posted income accounts"
          glowClass="card-glow-indigo border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.06] via-white to-white dark:border-indigo-500/30 dark:from-indigo-950/25 dark:via-slate-900 dark:to-slate-900"
          iconClass="bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400"
        />
        <Kpi
          label="Gross Profit"
          value={inr(grossProfit)}
          icon={<Layers className="h-4 w-4" />}
          note="After returns, COGS & adjustments"
          glowClass="card-glow-emerald border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] via-white to-white dark:border-emerald-500/30 dark:from-emerald-950/25 dark:via-slate-900 dark:to-slate-900"
          iconClass="bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
        />
        <Kpi
          label="Operating Expenses"
          value={inr(operatingExpenses)}
          icon={<Receipt className="h-4 w-4" />}
          note="Posted expense accounts"
          glowClass="card-glow-rose border-rose-500/20 bg-gradient-to-br from-rose-500/[0.06] via-white to-white dark:border-rose-500/30 dark:from-rose-950/25 dark:via-slate-900 dark:to-slate-900"
          iconClass="bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400"
          negative
        />
        <Kpi
          label="Net Profit"
          value={inr(net)}
          icon={<Percent className="h-4 w-4" />}
          note={`Operating Margin: ${margin.toFixed(2)}%`}
          glowClass={net >= 0
            ? "card-glow-emerald border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] via-white to-white dark:border-emerald-500/30 dark:from-emerald-950/25 dark:via-slate-900 dark:to-slate-900"
            : "card-glow-rose border-rose-500/20 bg-gradient-to-br from-rose-500/[0.06] via-white to-white dark:border-rose-500/30 dark:from-rose-950/25 dark:via-slate-900 dark:to-slate-900"}
          iconClass={net >= 0
            ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
            : "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400"}
          negative={net < 0}
        />
      </div>

      {/* P&L Line Items Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-950 dark:text-white">
              Operating Profit &amp; Loss Statement
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Deterministic double-entry GL ledger posting verification
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
            All amounts in INR
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {rows.map(([label, value, type]) => {
            const isTotal = type === "total";
            const isSubtotal = type === "subtotal";
            const num = Number(value);

            if (isTotal) {
              return (
                <div
                  key={label}
                  className="flex items-center justify-between bg-gradient-to-r from-slate-950 to-slate-900 px-5 py-4 text-white shadow-inner dark:from-white dark:to-slate-100 dark:text-slate-950"
                >
                  <div className="flex items-center gap-2 font-black uppercase tracking-wider text-xs sm:text-sm">
                    <Percent className="h-4 w-4 text-emerald-400 dark:text-emerald-600" />
                    <span>{label}</span>
                  </div>
                  <span
                    className={`font-mono text-base sm:text-lg font-black tabular-nums ${
                      num >= 0
                        ? "text-emerald-400 dark:text-emerald-600"
                        : "text-rose-400 dark:text-rose-600"
                    }`}
                  >
                    {inr(num)}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={label}
                className={`flex items-center justify-between px-5 py-3 text-xs sm:text-sm transition-colors ${
                  isSubtotal
                    ? "bg-slate-50/80 font-bold text-slate-950 dark:bg-white/5 dark:text-white"
                    : "text-slate-700 hover:bg-slate-50/50 dark:text-slate-300 dark:hover:bg-white/[0.02]"
                }`}
              >
                <span className={label.startsWith("Less:") ? "pl-3 text-slate-500 dark:text-slate-400" : ""}>
                  {label}
                </span>
                <span
                  className={`font-mono font-bold tabular-nums ${
                    isSubtotal
                      ? "text-slate-950 dark:text-white"
                      : num < 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-slate-900 dark:text-slate-100"
                  }`}
                >
                  {inr(num)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Accounting Footnote */}
      <div className="rounded-2xl border border-blue-500/20 bg-blue-50/60 p-4 text-xs text-blue-950 dark:border-blue-500/30 dark:bg-blue-950/20 dark:text-blue-200">
        <strong>Accounting Standard:</strong> P&amp;L totals come from posted journal lines and therefore reconcile directly with Trial Balance / General Ledger. Quick Sale detail is <strong>{inr(quickProfit)}</strong> profit at <strong>{quickMargin.toFixed(2)}%</strong> from saved cost; invoice-item cost snapshot detail is <strong>{inr(invoiceCost)}</strong>. These operational details are reconciliation aids, not a second source of truth for the statement.
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  note,
  glowClass = "",
  iconClass = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  negative = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  note: string;
  glowClass?: string;
  iconClass?: string;
  negative?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-5 shadow-xs transition-all hover:shadow-md ${glowClass}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${iconClass}`}>
          {icon}
        </div>
      </div>
      <div
        className={`mt-2 font-mono text-2xl font-black tracking-tight tabular-nums ${
          negative ? "text-rose-600 dark:text-rose-400" : "text-slate-950 dark:text-white"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
        {note}
      </div>
    </div>
  );
}