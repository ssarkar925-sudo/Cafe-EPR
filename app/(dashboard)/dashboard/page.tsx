import { createClient } from "@/lib/supabase/server";
import DashboardClient from "@/components/dashboard/dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  const iso30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const iso30Timestamp = new Date(Date.now() - 30 * 86400000).toISOString();
  const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const monthFrom = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  // Execute ALL queries concurrently in parallel to eliminate network waterfalls
  const [
    { data: { user } },
    { count: customers },
    { count: products },
    { count: services },
    { data: invoices },
    { data: payments },
    { data: financials },
    { data: stockRows },
    { data: topRows },
    { data: pnl },
    { data: settlement },
    { data: poolBalances },
    { data: dueInvoices },
    { data: debtors },
    { data: quickRows },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("customers").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("services").select("id", { count: "exact", head: true }),
    supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, total, paid, due, status, customers(name), created_at")
      .gte("invoice_date", iso30)
      .order("invoice_date", { ascending: false })
      .limit(200),
    supabase
      .from("payments")
      .select("method, amount, received_at")
      .gte("received_at", iso30Timestamp),
    supabase.rpc("get_dashboard_financials", { p_from: iso30 }),
    supabase
      .from("products")
      .select("id, name, stock_qty, reorder_level")
      .eq("is_active", true),
    supabase
      .from("invoices")
      .select("invoice_date, invoice_items(product_id, amount, products(name))")
      .gte("invoice_date", sevenAgo)
      .limit(500),
    supabase.rpc("get_pnl", { p_from: monthFrom, p_to: isoToday }),
    supabase.rpc("get_settlement_summary"),
    supabase.rpc("get_pool_balances"),
    supabase.from("invoices").select("due").in("status", ["unpaid", "partial"]),
    supabase
      .from("customers")
      .select("name, balance")
      .gt("balance", 0)
      .order("balance", { ascending: false })
      .limit(8),
    supabase
      .from("quick_sales")
      .select("amount, cost, status")
      .eq("sale_date", isoToday),
  ]);

  const profile = user
    ? (await supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).single()).data
    : null;

  const financialData = (financials as any) ?? {};
  const cashEntries = financialData.cash_entries ?? [];
  const expenses = financialData.expenses ?? [];
  const txns = financialData.transactions ?? [];

  const receivables = (dueInvoices ?? []).reduce(
    (s, r: any) => s + Number(r.due),
    0
  );

  const activeQuick = (quickRows ?? []).filter((q) => q.status === "active");
  const quickTodayCount = activeQuick.length;
  const quickTodayAmount = activeQuick.reduce((s, q) => s + Number(q.amount), 0);
  const quickTodayMargin = activeQuick.reduce((s, q) => s + Number(q.amount) - Number(q.cost), 0);

  return (
    <DashboardClient
      name={profile?.full_name || user?.email?.split("@")[0] || "there"}
      avatarUrl={profile?.avatar_url || null}
      customers={customers ?? 0}
      products={products ?? 0}
      services={services ?? 0}
      invoices={(invoices ?? []) as any}
      payments={(payments ?? []) as any}
      cashEntries={cashEntries as any}
      expenses={expenses as any}
      stock={(stockRows ?? []) as any}
      topRows={(topRows ?? []) as any}
      pnl={pnl as any}
      today={isoToday}
      settlement={settlement as any}
      poolBalances={(poolBalances ?? {}) as any}
      transactions={txns as any}
      receivables={receivables}
      topDebtors={(debtors ?? []) as any}
      quickTodayCount={quickTodayCount}
      quickTodayAmount={quickTodayAmount}
      quickTodayMargin={quickTodayMargin}
    />
  );
}
