import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import MasterClient from "@/components/business/master-client";

export const dynamic = "force-dynamic";

export default async function PortalsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();
  const [{ data }, { data: txnRows }] = await Promise.all([
    supabase.from("aeps_portals").select("*").order("name"),
    supabase.from("transactions").select("portal_id").eq("service_type", "aeps"),
  ]);

  const usage: Record<string, number> = {};
  for (const t of (txnRows ?? []) as { portal_id: string | null }[]) {
    if (t.portal_id) usage[t.portal_id] = (usage[t.portal_id] ?? 0) + 1;
  }

  return (
    <MasterClient
      title="AEPS Portals"
      desc="AEPS settlement portals used by the shop."
      table="aeps_portals"
      fields={[
        { key: "name", label: "Portal Name", required: true, placeholder: "PayNearby" },
        { key: "code", label: "Code", placeholder: "PN" },
        { key: "remarks", label: "Remarks", placeholder: "Settlement daily by 6 PM" },
      ]}
      rows={(data ?? []) as any}
      usage={usage}
    />
  );
}
