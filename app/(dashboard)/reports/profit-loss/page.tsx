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
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400"><Link href="/reports" className="hover:text-blue-600 dark:hover:text-blue-400">Reports &amp; Tax Hub</Link><ChevronRight className="h-3.5 w-3.5 text-slate-400" /><span className="font-bold text-slate-900 dark:text-white">Profit &amp; Loss Statement</span></div><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-white">Profit &amp; Loss Statement</h1><p className="mt-1 text-xs text-slate-600 sm:text-sm dark:text-slate-400">Posted double-entry GL is the accounting source of truth. Operational cost snapshots are shown separately for reconciliation.</p></div>
        <div className="flex items-center gap-2.5"><a href={exportHref} download="profit-loss-statement.csv" className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-blue-500"><Download className="h-3.5 w-3.5" /><span>Export CSV</span></a><Link href="/reports/tax-preparation" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"><FileSpreadsheet className="h-3.5 w-3.5" /><span>Tax Workspace</span></Link></div>
      </div>
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-2 lg:grid-cols-4"><Kpi label="Total Revenue" value={inr(totalRevenue)} icon={<TrendingUp className="h-4 w-4" />} note="Posted income accounts" /><Kpi label="Gross Profit" value={inr(grossProfit)} icon={<Layers className="h-4 w-4" />} note="After returns, COGS & adjustments" /><Kpi label="Operating Expenses" value={inr(operatingExpenses)} icon={<Receipt className="h-4 w-4" />} note="Posted expense account" negative /><Kpi label="Net Profit" value={inr(net)} icon={<Percent className="h-4 w-4" />} note={`Margin: ${margin.toFixed(2)}%`} negative={net < 0} /></div>
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-white/10 dark:bg-slate-900"><div className="border-b border-slate-200 px-5 py-4 dark:border-white/10"><h2 className="text-sm font-bold text-slate-950 dark:text-white">Operating Profit &amp; Loss Breakdown</h2><p className="text-xs text-slate-500 dark:text-slate-400">All amounts in Indian Rupees (INR) · Posted GL journals</p></div><div className="divide-y divide-slate-100 dark:divide-white/5">{rows.map(([label, value, type]) => { const isTotal = type === "total"; const isSubtotal = type === "subtotal"; const num = Number(value); return <div key={label} className={`flex items-center justify-between px-5 py-3.5 text-sm ${isTotal ? "bg-slate-950 font-bold text-white dark:bg-white dark:text-slate-950" : isSubtotal ? "bg-slate-50/70 font-semibold text-slate-950 dark:bg-white/5 dark:text-white" : "text-slate-700 dark:text-slate-300"}`}><span>{label}</span><span className={`font-mono text-sm tabular-nums ${isTotal ? (num >= 0 ? "text-emerald-400 dark:text-emerald-600 font-bold" : "text-rose-400 dark:text-rose-600 font-bold") : isSubtotal ? "font-bold text-slate-950 dark:text-white" : num < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-950 dark:text-white"}`}>{inr(num)}</span></div>; })}</div></div>
      <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-950 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200"><strong>Accounting Standard:</strong> P&amp;L totals come from posted journal lines and therefore reconcile directly with Trial Balance / General Ledger. Quick Sale detail is <strong>{inr(quickProfit)}</strong> profit at <strong>{quickMargin.toFixed(2)}%</strong> from saved cost; invoice-item cost snapshot detail is <strong>{inr(invoiceCost)}</strong>. These operational details are reconciliation aids, not a second source of truth for the statement.</div>
    </div>
  );
}

function Kpi({ label, value, icon, note, negative = false }: { label: string; value: string; icon: React.ReactNode; note: string; negative?: boolean }) { return <div className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-white/10 dark:bg-slate-900"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span><span className="rounded-md bg-slate-100 p-1 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{icon}</span></div><div className={`mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums ${negative ? "text-rose-600 dark:text-rose-400" : "text-slate-950 dark:text-white"}`}>{value}</div><div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{note}</div></div>; }