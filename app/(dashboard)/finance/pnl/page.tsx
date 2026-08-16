import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import PnlClient from "@/components/finance/pnl-client";

export const dynamic = "force-dynamic";

export default async function PnlPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const to = now.toISOString().slice(0, 10);

  const { data: pnl } = await supabase.rpc("get_pnl", { p_from: from, p_to: to });

  return <PnlClient initialPnl={(pnl as any) ?? null} defaultFrom={from} defaultTo={to} />;
}
