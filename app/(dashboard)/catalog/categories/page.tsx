import { createClient } from "@/lib/supabase/server";
import CategoriesClient from "@/components/catalog/categories-client";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .order("name");

  return <CategoriesClient initialCategories={(categories ?? []) as any} />;
}
