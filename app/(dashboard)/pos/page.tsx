import { createClient } from "@/lib/supabase/server";
import PosClient from "@/components/pos/pos-client";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const supabase = await createClient();

  const [{ data: products }, { data: services }, { data: customers }] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          "id, code, name, sale_price, stock_qty, unit, category_id, categories(name)"
        )
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("services")
        .select("id, name, price, category_id, categories(name)")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("customers")
        .select("id, name, code")
        .eq("is_active", true)
        .order("name"),
    ]);

  return (
    <PosClient
      products={(products ?? []) as any}
      services={(services ?? []) as any}
      customers={(customers ?? []) as any}
    />
  );
}
