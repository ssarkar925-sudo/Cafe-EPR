import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import InventoryClient from "@/components/inventory/inventory-client";

export const metadata = {
  title: "Inventory Control | CyberCafe ERP",
  description: "Live stock valuation, replenishment watch, physical counts and audited adjustments",
};

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const supabase = await createClient();

  const [{ data: products, error: productsError }, { data: categories }] =
    await Promise.all([
      supabase
        .from("products")
        .select("*, categories(id, name)")
        .order("name")
        .limit(1000),
      supabase
        .from("categories")
        .select("id, name, is_active")
        .order("name"),
    ]);

  if (productsError) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm font-semibold text-rose-600">
          Inventory data could not be loaded: {productsError.message}
        </p>
        <Link
          href="/inventory"
          className="mt-3 inline-block rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white"
        >
          Retry
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-9rem)] bg-slate-50/60 px-4 py-5 sm:px-6 lg:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-[1500px]">
        <InventoryClient
          initialProducts={(products ?? []) as any}
          categories={(categories ?? []) as any}
        />
      </div>
    </div>
  );
}
