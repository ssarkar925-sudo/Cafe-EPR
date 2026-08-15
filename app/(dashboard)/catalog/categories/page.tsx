import { createClient } from "@/lib/supabase/server";
import CategoriesClient from "@/components/catalog/categories-client";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const supabase = await createClient();

  const [{ data: categories }, { data: products }, { data: services }] =
    await Promise.all([
      supabase.from("categories").select("*").order("name"),
      supabase.from("products").select("category_id"),
      supabase.from("services").select("category_id"),
    ]);

  const counts: Record<string, number> = {};
  for (const p of (products ?? []) as { category_id: string | null }[]) {
    if (p.category_id) counts[p.category_id] = (counts[p.category_id] ?? 0) + 1;
  }
  for (const s of (services ?? []) as { category_id: string | null }[]) {
    if (s.category_id) counts[s.category_id] = (counts[s.category_id] ?? 0) + 1;
  }

  return (
    <CategoriesClient
      initialCategories={(categories ?? []) as any}
      counts={counts}
    />
  );
}
