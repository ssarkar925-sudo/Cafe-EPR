import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import Link from "next/link";
import FinanceOpsStrip from "@/components/finance/finance-ops-strip";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");
  const supabase = await createClient();
  const [{ data: entries }, { data: settlements }] = await Promise.all([
    supabase.from("cash_entries").select("id,direction,amount,entry_date").limit(2000),
    supabase.from("settlements").select("id,amount,settlement_date,status").limit(1000),
  ]);
  const e=(entries??[]) as any[], s=(settlements??[]) as any[];
  return <div className="space-y-6"><FinanceOpsStrip entries={e} settlements={s}/><div className="grid gap-4 md:grid-cols-3"><Link href="/finance/cashbook" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md dark:border-white/10 dark:bg-slate-900"><div className="text-xs font-bold uppercase tracking-wider text-emerald-600">Daily ledger</div><h1 className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">Cash Book →</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Review money-in, money-out and payment instrument movements.</p></Link><Link href="/finance/settlements" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-white/10 dark:bg-slate-900"><div className="text-xs font-bold uppercase tracking-wider text-blue-600">Reconciliation</div><h1 className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">Settlements →</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Move balances between pools and reconcile operational accounts.</p></Link><Link href="/reports/finance" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md dark:border-white/10 dark:bg-slate-900"><div className="text-xs font-bold uppercase tracking-wider text-violet-600">Analysis</div><h1 className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">Finance Reports →</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Drill into collections, expenses and settlement performance.</p></Link></div></div>;
}
