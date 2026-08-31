import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import FinanceDashboardClient from "@/components/finance/finance-dashboard-client";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

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
    supabase
      .from("cash_entries")
      .select("id, direction, amount, method, description, entry_date, instrument_id, payment_instruments(name, type)")
      .eq("entry_date", today)
      .order("created_at", { ascending: false }),
    supabase
      .from("expenses")
      .select("id, amount, description, expense_date, category")
      .gte("expense_date", startOfMonth)
      .order("expense_date", { ascending: false })
      .limit(200),
    supabase
      .from("settlements")
      .select("id, settlement_number, settlement_type, amount, from_pool, to_pool, settlement_date, status")
      .eq("status", "pending")
      .order("settlement_date", { ascending: false })
      .limit(50),
    supabase
      .from("cash_entries")
      .select("id, direction, amount, method, description, entry_date, ref_type, ref_id, payment_instruments(name, type)")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const entries = (todayEntries ?? []) as any[];
  const todayInflow = entries.filter((e) => e.direction === "in").reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const todayOutflow = entries.filter((e) => e.direction === "out").reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const monthExpenseTotal = ((monthExpenses ?? []) as any[]).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const pools = (poolBalances ?? {}) as any;

  return (
    <FinanceDashboardClient
      poolBalances={pools}
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
