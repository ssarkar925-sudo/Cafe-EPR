import { createClient } from "@/lib/supabase/server";
import PosShell, { type PosCatalogItem, type PosCustomer, type PosInstrument } from "@/components/pos/pos-shell";

export const dynamic = "force-dynamic";

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { customer: initialCustomerId } = await searchParams;
  const supabase = await createClient();

  const [{ data: products }, { data: services }, { data: customers }, { data: instruments }, { data: profile }, { data: settings }] = await Promise.all([
    supabase
      .from("products")
      .select("id, code, name, sale_price, cost_price, stock_qty, reorder_level, unit, category_id, hsn_code, gst_rate, categories(name)")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("services")
      .select("id, name, sale_price, cost_price, category_id, sac_code, gst_rate, categories(name)")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("customers")
      .select("id, name, code, phone, balance, gstin, state_code")
      .eq("is_active", true)
      .order("name")
      .limit(500),
    supabase
      .from("payment_instruments")
      .select("id, name, type")
      .eq("is_active", true)
      .order("type")
      .order("name"),
    supabase.from("profiles").select("full_name").eq("id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle(),
    supabase.from("settings").select("shop_name").maybeSingle(),
  ]);

  const catalogProducts: PosCatalogItem[] = (products ?? []).map((item: any) => ({
    id: item.id,
    kind: "product",
    name: item.name,
    code: item.code,
    sale_price: item.sale_price,
    cost_price: item.cost_price,
    stock_qty: item.stock_qty,
    reorder_level: item.reorder_level,
    unit: item.unit,
    category_id: item.category_id,
    category_name: item.categories?.name ?? null,
    gst_rate: item.gst_rate,
    hsn_sac: item.hsn_code,
  }));

  const catalogServices: PosCatalogItem[] = (services ?? []).map((item: any) => ({
    id: item.id,
    kind: "service",
    name: item.name,
    code: null,
    sale_price: item.sale_price,
    cost_price: item.cost_price,
    unit: "service",
    category_id: item.category_id,
    category_name: item.categories?.name ?? null,
    gst_rate: item.gst_rate,
    hsn_sac: item.sac_code,
  }));

  const safeCustomers: PosCustomer[] = (customers ?? []).map((item: any) => ({
    id: item.id,
    name: item.name,
    code: item.code,
    phone: item.phone,
    balance: item.balance,
    gstin: item.gstin,
    state_code: item.state_code,
  }));

  const safeInstruments: PosInstrument[] = (instruments ?? []).map((item: any) => ({
    id: item.id,
    name: item.name,
    type: item.type,
  }));

  return (
    <PosShell
      shopName={settings?.shop_name || "CafeERP"}
      operatorName={profile?.full_name || "Operator"}
      products={catalogProducts}
      services={catalogServices}
      customers={safeCustomers}
      instruments={safeInstruments}
      initialCustomerId={initialCustomerId || ""}
    />
  );
}
