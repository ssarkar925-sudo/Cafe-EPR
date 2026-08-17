import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import PosClient from "@/components/pos/pos-client";

export const dynamic = "force-dynamic";

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; mode?: string }>;
}) {
  const { customer, mode } = await searchParams;
  const role = await getUserRole();
  const canViewProfit = hasRole(role, ["admin", "manager"]);
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: products }, { data: services }, { data: customers }, { data: instruments }, { data: paymentMethods }, { data: todaysInvoices }, { data: todaysQuick }] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          "id, code, name, sale_price, stock_qty, reorder_level, unit, category_id, categories(name)"
        )
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("services")
        .select("id, name, sale_price, category_id, is_quick_favorite, quick_sort, categories(name)")
        .eq("is_active", true)
        .order("is_quick_favorite", { ascending: false })
        .order("quick_sort")
        .order("name"),
      supabase
        .from("customers")
        .select("id, name, code, phone, balance")
        .eq("is_active", true)
        .order("name")
        .limit(300),
      supabase
        .from("payment_instruments")
        .select("id, name, type")
        .eq("is_active", true)
        .order("type")
        .order("name"),
      supabase
        .from("payment_methods")
        .select("method")
        .eq("is_active", true),
      supabase
        .from("invoices")
        .select("total")
        .eq("invoice_date", today)
        .in("status", ["paid", "partial"]),
      supabase
        .from("quick_sales")
        .select(
          "id, sale_number, sale_date, customer_id, product_id, service_id, item_name, amount, cost, tendered, change_due, payments, status, created_at, customers(name), products(name), services(name)"
        )
        .eq("sale_date", today)
        .order("created_at", { ascending: false }),
    ]);

  const salesTodayCount = (todaysInvoices ?? []).length;
  const salesTodayAmount = (todaysInvoices ?? []).reduce(
    (s, i) => s + Number(i.total),
    0
  );
  const enabledMethods = (paymentMethods ?? []).map((p: any) => p.method);

  return (
    <PosClient
      products={(products ?? []) as any}
      services={(services ?? []) as any}
      customers={(customers ?? []) as any}
      instruments={(instruments ?? []) as any}
      salesTodayCount={salesTodayCount}
      salesTodayAmount={salesTodayAmount}
      initialCustomerId={customer || ""}
      initialMode={mode === "quick" ? "quick" : "invoice"}
      todayQuickSales={(todaysQuick ?? []) as any}
      enabledMethods={enabledMethods}
      canViewProfit={canViewProfit}
    />
  );
}
