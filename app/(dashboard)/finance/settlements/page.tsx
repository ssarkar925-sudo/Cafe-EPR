import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import SettlementsClient from "@/components/finance/settlements-client";

export const dynamic = "force-dynamic";

export default async function SettlementsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: settlements }, { data: summary }] = await Promise.all([
    supabase
      .from("settlements")
      .select(
        "id, settlement_number, settlement_type, settlement_date, from_pool, to_pool, direction, amount, reference, remarks, status, created_at, profiles(full_name)"
      )
      .order("settlement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.rpc("get_settlement_summary"),
  ]);

  const rows = (settlements ?? []).map((r: any) => ({
    ...r,
    profiles: r.profiles?.[0] ?? null,
  }));

  return (
    <SettlementsClient
      initialSettlements={rows as any}
      initialSummary={(summary as any) ?? null}
    />
  );
}
