import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import PosClient from "@/components/pos/pos-client";
import PosOpsStrip from "@/components/pos/pos-ops-strip";
import PosV2Shell from "@/components/pos/pos-v2-shell";

export const dynamic = "force-dynamic";

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; mode?: string; edit?: string }>;
}) {
  const { customer, mode, edit } = await searchParams;
  const role = await getUserRole();
  const canViewProfit = hasRole(role, ["admin", "manager"]);
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: products },
    { data: services },
    { data: customers },
    { data: instruments },
    { data: paymentMethods },
    { data: todaysInvoices },
    { data: todaysQuick },
    editInvoiceRes,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, code, name, sale_price, stock_qty, reorder_level, unit, category_id, hsn_code, gst_rate, categories(name)")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("services")
      .select("id, name, sale_price, category_id, is_quick_favorite, quick_sort, sac_code, gst_rate, categories(name)")
      .eq("is_active", true)
      .order("is_quick_favorite", { ascending: false })
      .order("quick_sort")
      .order("name"),
    supabase
      .from("customers")
      .select("id, name, code, phone, balance, gstin, state_code")
      .eq("is_active", true)
      .order("name")
      .limit(300),
    supabase
      .from("payment_instruments")
      .select("id, name, type")
      .eq("is_active", true)
      .order("type")
      .order("name"),
    supabase.from("payment_methods").select("method").eq("is_active", true),
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, invoice_date, customer_id, discount, total, status, customers(name), invoice_items(product_id, service_id, description, qty, rate, amount), payments(method, instrument_id, amount)"
      )
      .eq("invoice_date", today)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("quick_sales")
      .select(
        "id, sale_number, sale_date, customer_id, product_id, service_id, item_name, amount, cost, tendered, change_due, payments, status, created_at, customers(name), products(name), services(name)"
      )
      .eq("sale_date", today)
      .order("created_at", { ascending: false }),
    edit
      ? supabase
          .from("invoices")
          .select(
            "id, invoice_number, invoice_date, customer_id, discount, total, status, customers(name), invoice_items(product_id, service_id, description, qty, rate, amount), payments(method, instrument_id, amount)"
          )
          .eq("id", edit)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const activeInvoices = (todaysInvoices ?? []).filter((i: any) => i.status !== "cancelled");
  const salesTodayCount = activeInvoices.length;
  const salesTodayAmount = activeInvoices.reduce((s: number, i: any) => s + Number(i.total), 0);
  const enabledMethods = (paymentMethods ?? []).map((p: any) => p.method);
  const initialEditingInvoice = editInvoiceRes?.data ?? null;
  const posMode = mode === "quick" ? "quick" : "invoice";

  return (
    <div className="pos-premium-root">
      <PosV2Shell mode={posMode} salesCount={salesTodayCount} salesAmount={salesTodayAmount}>
        <PosOpsStrip count={salesTodayCount} amount={salesTodayAmount} />
        <PosClient
          products={(products ?? []) as any}
          services={(services ?? []) as any}
          customers={(customers ?? []) as any}
          instruments={(instruments ?? []) as any}
          salesTodayCount={salesTodayCount}
          salesTodayAmount={salesTodayAmount}
          initialCustomerId={customer || ""}
          initialMode={posMode}
          todayQuickSales={(todaysQuick ?? []) as any}
          enabledMethods={enabledMethods}
          canViewProfit={canViewProfit}
          todayInvoices={(todaysInvoices ?? []) as any}
          initialEditingInvoice={initialEditingInvoice as any}
        />
      </PosV2Shell>
    </div>
  );
}
