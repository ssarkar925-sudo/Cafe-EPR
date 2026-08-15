import { createClient } from "@/lib/supabase/server";
import ServicesClient from "@/components/catalog/services-client";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const supabase = await createClient();

  const [{ data: services }, { data: categories }] = await Promise.all([
    supabase
      .from("services")
      .select("*, categories(name)")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("categories").select("id, name, is_active").order("name"),
  ]);

  return (
    <ServicesClient
      initialServices={(services ?? []) as any}
      categories={(categories ?? []) as any}
    />
  );
}
