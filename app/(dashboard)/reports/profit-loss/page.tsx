import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserRole, hasRole } from "@/lib/authz";
import { inr } from "@/lib/format";
import { ChevronRight, TrendingUp, Receipt, Layers, Percent, Download, FileSpreadsheet, CalendarRange } from "lucide-react";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string }>;
type AccountRow = {
  system_key: string | null;
  name: string;
  account_type: string;
  debit: number;
  credit: number;
};

type StatementRow = [string, number, "positive" | "negative" | "subtotal" | "total"];

function isoDate(value: string | undefined, fallback: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value! : fallback;
}

export default async function ProfitLossPage({ searchParams }: { searchParams?: SearchParams }) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const monthStartIso = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const params = await searchParams;
  const fromDate = isoDate(params?.from, monthStartIso);
  const toDate = isoDate(params?.to, todayIso);
  const validPeriod = fromDate <= toDate;
  const supabase = await createClient();

  let accountRows: AccountRow[] = [];
  if (validPeriod) {
    const { data: lines, error } = await supabase
      .from("journal_lines")
      .select("debit,credit,account_id,accounting_accounts!inner(system_key,name,account_type),journal_entries!inner(status,entry_date)")
      .eq("journal_entries.status", "posted")
      .gte("journal_entries.entry_date", fromDate)
      .lte("journal_entries.entry_date", toDate);

    if (error) {
      throw new Error(`Unable to load the GL P&L statement: ${error.message}`);
    }

    const byKey = new Map<string, AccountRow>();
    for (const line of lines ?? []) {
      const account = (line as any).accounting_accounts;
      const key = String(account?.system_key ?? "");
      if (!key) continue;
      const row = byKey.get(key) ?? {
        system_key: key,
        name: String(account?.name ?? key),
        account_type: String(account?.account_type ?? "expense"),
        debit: 0,
        credit: 0,
      };
      row.debit += Number((line as any).debit || 0);
      row.credit += Number((line as any).credit || 0);
      byKey.set(key, row);
    }
    accountRows = [...byKey.values()];
  }

  const byKey = new Map(accountRows.map((row) => [row.system_key!, row]));
  const balance = (key: string, override?: "credit" | "debit") => {
    const row = byKey.get(key);
    if (!row) return 0;
    if (override === "credit") return row.credit - row.debit;
    if (override === "debit") return row.debit - row.credit;
    return row.account_type === "income"
      ? row.credit - row.debit
      : row.debit - row.credit;
  };

  const productSales = balance("PRODUCT_SALES");
  const serviceRevenue = balance("SERVICE_REVENUE");
  const serviceFees = balance("SERVICE_FEES");
  const commissionIncome = balance("COMMISSION_INCOME");
  const salesReturns = balance("SALES_RETURNS", "debit");
  const purchaseReturns = balance("PURCHASE_RETURNS", "credit");
  const cogs = balance("COGS");
  const inventoryAdjustment = balance("INVENTORY_ADJUSTMENT");
  const cashVariance = balance("CASH_VARIANCE");
  const operatingExpenses = balance("OPERATING_EXPENSES");

  const totalRevenue = productSales + serviceRevenue + serviceFees + commissionIncome;
  const grossProfit = totalRevenue - salesReturns - cogs + purchaseReturns - inventoryAdjustment;
  const net = grossProfit - operatingExpenses - cashVariance;
  const margin = totalRevenue > 0 ? (net / totalRevenue) * 100 : 0;

  const rows: StatementRow[] = [
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
    ["Less: Cash Shortage / (Overage)", -cashVariance, cashVariance > 0 ? "negative" : "positive"],
    ["NET OPERATING PROFIT", net, "total"],
  ];

  const csv = [
    ["Profit & Loss Statement", `${fromDate} to ${toDate}`],
    ["Line Item", "Amount (INR)"],
    ...rows.map(([label, value]) => [label, Number(value).toFixed(2)]),
    ["Net Margin (%)", `${margin.toFixed(2)}%`],
  ].map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
  const exportHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;

  return (
    <div className="space-y-6 pb-12" id="profit-loss-report">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-white/10 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Link href="/reports" className="hover:text-blue-600 dark:hover:text-blue-400">Reports &amp; Tax Hub</Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-bold text-slate-900 dark:text-white">Profit &amp; Loss Statement</span>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl dark:text-white">Profit &amp; Loss Statement</h1>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm dark:text-slate-400">Posted double-entry GL is the only authoritative source for this statement.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <form method="get" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-slate-900">
            <CalendarRange className="ml-1 h-4 w-4 text-slate-500" />
            <label className="sr-only" htmlFor="pnl-from">From</label>
            <input id="pnl-from" name="from" type="date" defaultValue={fromDate} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-200" />
            <span className="text-xs font-bold text-slate-400">to</span>
            <label className="sr-only" htmlFor="pnl-to">To</label>
            <input id="pnl-to" name="to" type="date" defaultValue={toDate} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-200" />
            <button type="submit" className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-black text-white hover:brightness-110 dark:bg-white dark:text-slate-950">Apply</button>
          </form>
          <a href={exportHref} download={`profit-loss-${fromDate}-to-${toDate}.csv`} className="btn-3d-tactile-primary inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-blue-500/20 hover:brightness-110">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </a>
          <Link href="/reports/tax-preparation" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Tax Workspace
          </Link>
        </div>
      </div>

      {!validPeriod ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">Invalid reporting period. The start date must be on or before the end date.</div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">Statement period: {fromDate} → {toDate} · Posted journals only</div>

          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <Kpi label="Total Revenue" value={inr(totalRevenue)} icon={<TrendingUp className="h-4 w-4" />} note="Posted income accounts" />
            <Kpi label="Gross Profit" value={inr(grossProfit)} icon={<Layers className="h-4 w-4" />} note="After returns, COGS & adjustments" />
            <Kpi label="Operating Expenses" value={inr(operatingExpenses)} icon={<Receipt className="h-4 w-4" />} note="Posted expense accounts" negative />
            <Kpi label="Net Profit" value={inr(net)} icon={<Percent className="h-4 w-4" />} note={`Operating Margin: ${margin.toFixed(2)}%`} negative={net < 0} />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <div><h2 className="text-sm font-black text-slate-950 dark:text-white">Operating Profit &amp; Loss Statement</h2><p className="text-xs text-slate-500 dark:text-slate-400">Deterministic double-entry GL statement for the selected period</p></div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">INR</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {rows.map(([label, value, type]) => {
                const isTotal = type === "total";
                const isSubtotal = type === "subtotal";
                const num = Number(value);
                if (isTotal) return <div key={label} className="flex items-center justify-between bg-gradient-to-r from-slate-950 to-slate-900 px-5 py-4 text-white dark:from-white dark:to-slate-100 dark:text-slate-950"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider sm:text-sm"><Percent className="h-4 w-4 text-emerald-400 dark:text-emerald-600" />{label}</div><span className={`font-mono text-base font-black tabular-nums sm:text-lg ${num >= 0 ? "text-emerald-400 dark:text-emerald-600" : "text-rose-400 dark:text-rose-600"}`}>{inr(num)}</span></div>;
                return <div key={label} className={`flex items-center justify-between px-5 py-3 text-xs sm:text-sm ${isSubtotal ? "bg-slate-50/80 font-bold text-slate-950 dark:bg-white/5 dark:text-white" : "text-slate-700 dark:text-slate-300"}`}><span className={label.startsWith("Less:") ? "pl-3 text-slate-500 dark:text-slate-400" : ""}>{label}</span><span className={`font-mono font-bold tabular-nums ${isSubtotal ? "text-slate-950 dark:text-white" : num < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-slate-100"}`}>{inr(num)}</span></div>;
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-blue-500/20 bg-blue-50/60 p-4 text-xs text-blue-950 dark:border-blue-500/20 dark:bg-blue-950/20 dark:text-blue-100">
            This report does not read invoices, Quick Sale records, expenses, purchases, or operational transaction tables as a second P&amp;L. Those are operational subledgers; posted journal entries remain the accounting statement source of truth.
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, icon, note, negative = false }: { label: string; value: string; icon: React.ReactNode; note: string; negative?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={`rounded-xl p-2 ${negative ? "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400" : "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400"}`}>{icon}</span><span className="text-xs font-black text-slate-500 dark:text-slate-400">{label}</span></div></div>
      <div className={`mt-3 font-mono text-xl font-black tabular-nums ${negative ? "text-rose-700 dark:text-rose-300" : "text-slate-950 dark:text-white"}`}>{value}</div>
      <div className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{note}</div>
    </div>
  );
}
