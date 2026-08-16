import { createClient } from "@/lib/supabase/server";
import DashboardClient from "@/components/dashboard/dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { count: customers }, { count: products }, { count: services }] =
    await Promise.all([
      user
        ? supabase.from("profiles").select("full_name").eq("id", user.id).single()
        : Promise.resolve({ data: null }),
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("services").select("id", { count: "exact", head: true }),
    ]);

  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  const iso30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, total, paid, due, status, customers(name), created_at")
    .gte("invoice_date", iso30)
    .order("invoice_date", { ascending: false })
    .limit(200);

  const { data: payments } = await supabase
    .from("payments")
    .select("method, amount, received_at")
    .gte("received_at", new Date(Date.now() - 30 * 86400000).toISOString());

  const { data: cashEntries } = await supabase
    .from("cash_entries")
    .select("method, direction, amount, entry_date");

  const { data: expenses } = await supabase
    .from("expenses")
    .select("expense_date, amount, status")
    .gte("expense_date", iso30);

  const { data: stockRows } = await supabase
    .from("products")
    .select("id, name, stock_qty, reorder_level")
    .eq("is_active", true);

  const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const { data: topRows } = await supabase
    .from("invoices")
    .select("invoice_date, invoice_items(product_id, amount, products(name))")
    .gte("invoice_date", sevenAgo)
    .limit(500);

  const monthFrom = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const { data: pnl } = await supabase.rpc("get_pnl", {
    p_from: monthFrom,
    p_to: isoToday,
  });

  return (
    <DashboardClient
      name={profile?.full_name || user?.email?.split("@")[0] || "there"}
      customers={customers ?? 0}
      products={products ?? 0}
      services={services ?? 0}
      invoices={(invoices ?? []) as any}
      payments={(payments ?? []) as any}
      cashEntries={(cashEntries ?? []) as any}
      expenses={(expenses ?? []) as any}
      stock={(stockRows ?? []) as any}
      topRows={(topRows ?? []) as any}
      pnl={(pnl as any) ?? null}
      today={isoToday}
    />
  );
}
