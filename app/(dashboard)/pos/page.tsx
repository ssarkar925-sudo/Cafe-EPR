import { createClient } from "@/lib/supabase/server";
import PosClient from "@/components/pos/pos-client";

export const dynamic = "force-dynamic";

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { customer } = await searchParams;
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: products }, { data: services }, { data: customers }, { data: todaysInvoices }] =
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
        .select("id, name, sale_price, category_id, categories(name)")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("customers")
        .select("id, name, code, phone, balance")
        .eq("is_active", true)
        .order("name")
        .limit(300),
      supabase
        .from("invoices")
        .select("total")
        .eq("invoice_date", today)
        .in("status", ["paid", "partial"]),
    ]);

  const salesTodayCount = (todaysInvoices ?? []).length;
  const salesTodayAmount = (todaysInvoices ?? []).reduce(
    (s, i) => s + Number(i.total),
    0
  );

  return (
    <PosClient
      products={(products ?? []) as any}
      services={(services ?? []) as any}
      customers={(customers ?? []) as any}
      salesTodayCount={salesTodayCount}
      salesTodayAmount={salesTodayAmount}
      initialCustomerId={customer || ""}
    />
  );
}
