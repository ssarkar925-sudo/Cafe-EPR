import AepsMobileCollector from "@/components/business/aeps-mobile-collector";
import { createClient } from "@/lib/supabase/server";

export default async function AepsMobileCollectorPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("aeps_portals")
    .select("id,name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  return <AepsMobileCollector initialPortals={(data || []).map((p) => ({ id: String(p.id), name: String(p.name) }))} />;
}
