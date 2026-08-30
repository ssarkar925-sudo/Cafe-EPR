import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import RechargePlanManager from "@/components/business/recharge-plan-manager";

export const dynamic = "force-dynamic";

export default async function RechargePlansPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");
  const supabase = await createClient();
  const [{ data: plans }, { data: providers }] = await Promise.all([
    supabase.from("recharge_plan_catalog").select("*").order("sort_order").order("amount"),
    supabase.from("recharge_providers").select("id,name,is_active").order("sort_order").order("name"),
  ]);
  return <RechargePlanManager initialPlans={(plans ?? []) as any} initialProviders={(providers ?? []) as any} />;
}
