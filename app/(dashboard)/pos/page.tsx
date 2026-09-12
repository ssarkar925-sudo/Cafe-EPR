import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/authz";
import ModernPosClient from "@/components/pos/modern-pos-client";

export const dynamic = "force-dynamic";

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { customer } = await searchParams;
  const role = await getUserRole();
  const canUsePos = role === "admin" || role === "manager" || role === "staff";
  if (!canUsePos) return null;

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: products },
    { data: services },
    { data: customers },
    { data: instruments },
    { data: todaysInvoices },
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
    supabase
      .from("invoices")
      .select("id, invoice_number, total, status")
      .eq("invoice_date", today)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  return (
    <div className="pos-modern-root">
      <ModernPosClient
        products={(products ?? []) as any}
        services={(services ?? []) as any}
        customers={(customers ?? []) as any}
        instruments={(instruments ?? []) as any}
        todayInvoices={(todaysInvoices ?? []) as any}
        initialCustomerId={customer || ""}
      />
    </div>
  );
}
