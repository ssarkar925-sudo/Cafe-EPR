import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FinanceDashboardClient from "@/components/finance/finance-dashboard-client";
import CashBookPage from "@/app/(dashboard)/finance/cashbook/page";
import JournalPage from "@/app/(dashboard)/finance/journal/page";
import SettlementsPage from "@/app/(dashboard)/finance/settlements/page";
import TrialBalancePage from "@/app/(dashboard)/finance/trial-balance/page";
import ExpensesPage from "@/app/(dashboard)/finance/expenses/page";
import PnlPage from "@/app/(dashboard)/finance/pnl/page";
import LedgerPage from "@/app/(dashboard)/finance/ledger/page";
import ReconciliationPage from "@/app/(dashboard)/finance/reconciliation/page";
import OpeningBalancesPage from "@/app/(dashboard)/finance/opening-balances/page";
import AccountsPage from "@/app/(dashboard)/finance/accounts/page";
import DayClosePage from "@/app/(dashboard)/finance/day-close/page";

export const dynamic = "force-dynamic";

type FinanceModule = "cashbook" | "journal" | "settlements" | "trial-balance" | "expenses" | "pnl" | "ledger" | "reconciliation" | "opening-balances" | "accounts" | "day-close";

const MODULES: Record<FinanceModule, React.ComponentType<any>> = {
  cashbook: CashBookPage,
  journal: JournalPage,
  settlements: SettlementsPage,
  "trial-balance": TrialBalancePage,
  expenses: ExpensesPage,
  pnl: PnlPage,
  ledger: LedgerPage,
  reconciliation: ReconciliationPage,
  "opening-balances": OpeningBalancesPage,
  accounts: AccountsPage,
  "day-close": DayClosePage,
};

export default async function FinancePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const role = await (async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    return (data?.role as string | null) ?? null;
  })();
  if (!role || !["admin", "manager"].includes(role)) redirect("/dashboard");

  const params = searchParams ? await searchParams : {};
  const requested = typeof params.module === "string" ? params.module : "";

  // All Finance modules render inside the same /finance workspace.
  // No module click redirects to Settings, Dashboard, or another section.
  if (requested && requested in MODULES) {
    const ModulePage = MODULES[requested as FinanceModule];
    return (
      <div className="space-y-4 pb-10">
        <div className="sticky top-0 z-20 flex items-center justify-between rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/95">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Finance &amp; Accounts</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Single-page finance workspace</p>
          </div>
          <a href="/finance" className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900">← Finance Hub</a>
        </div>
        <ModulePage />
      </div>
    );
  }

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const startOfMonth = today.slice(0, 8) + "01";

  const [
    { data: poolBalances },
    { data: instruments },
    { data: todayEntries },
    { data: monthExpenses },
    { data: pendingSettlements },
    { data: recentTxns },
  ] = await Promise.all([
    supabase.rpc("get_pool_balances", { p_as_of: today }),
    supabase.from("payment_instruments").select("id, name, type, is_active").order("type").order("name"),
    supabase.from("cash_entries").select("id, direction, amount, method, description, entry_date, instrument_id, payment_instruments(name, type)").eq("entry_date", today).order("created_at", { ascending: false }),
    supabase.from("expenses").select("id, amount, description, expense_date, category").gte("expense_date", startOfMonth).order("expense_date", { ascending: false }).limit(200),
    supabase.from("settlements").select("id, settlement_number, settlement_type, amount, from_pool, to_pool, settlement_date, status").eq("status", "pending").order("settlement_date", { ascending: false }).limit(50),
    supabase.from("cash_entries").select("id, direction, amount, method, description, entry_date, ref_type, ref_id, payment_instruments(name, type)").order("created_at", { ascending: false }).limit(20),
  ]);

  const entries = (todayEntries ?? []) as any[];
  const todayInflow = entries.filter((e) => e.direction === "in").reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const todayOutflow = entries.filter((e) => e.direction === "out").reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const monthExpenseTotal = ((monthExpenses ?? []) as any[]).reduce((s, e) => s + Number(e.amount ?? 0), 0);

  return (
    <FinanceDashboardClient
      poolBalances={(poolBalances ?? {}) as any}
      instruments={(instruments ?? []) as any[]}
      todayInflow={todayInflow}
      todayOutflow={todayOutflow}
      todayNetMargin={todayInflow - todayOutflow}
      monthExpenseTotal={monthExpenseTotal}
      pendingSettlements={(pendingSettlements ?? []) as any[]}
      recentEntries={(recentTxns ?? []) as any[]}
    />
  );
}
