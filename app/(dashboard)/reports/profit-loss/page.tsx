import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getUserRole, hasRole } from "@/lib/authz";
import { inr } from "@/lib/format";

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
    ["POS / Invoice Sales Revenue", sales],
    ["POS Quick Sales Revenue", quickRevenue],
    ["Less: Sales Returns", -returnsTotal],
    ["Less: POS COGS", -quickCost],
    ["Service Fees & Commission Income", serviceIncome],
    ["Gross Profit / Operating Income", grossProfit],
    ["Operating Expenses", -expensesTotal],
    ["NET PROFIT", net],
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Financial report</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Profit & Loss</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Revenue, returns, POS cost, service income and operating expenses. Transaction principal is excluded from income.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[["Revenue", grossSales],["Gross Profit", grossProfit],["Expenses", expensesTotal],["Net Profit", net]].map(([label,value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{inr(Number(value))}</div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10"><h2 className="font-semibold text-slate-950 dark:text-white">Profit & Loss Statement</h2></div>
        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {rows.map(([label,value]) => (
            <div key={String(label)} className={`flex items-center justify-between px-5 py-4 ${label === "NET PROFIT" ? "bg-slate-50 font-bold dark:bg-white/5" : ""}`}>
              <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
              <span className="text-sm font-semibold text-slate-950 dark:text-white">{inr(Number(value))}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
        Net margin: <strong>{margin.toFixed(2)}%</strong>. This report intentionally does not treat AEPS/DMT/UPI/Recharge/Bill Payment principal as income.
      </div>
    </div>
  );
}
