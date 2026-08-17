import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import ProductsClient from "@/components/catalog/products-client";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from("products")
      .select("*, categories(name)")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("categories").select("id, name, is_active").order("name"),
  ]);

  return (
    <ProductsClient
      initialProducts={(products ?? []) as any}
      categories={(categories ?? []) as any}
    />
  );
}
