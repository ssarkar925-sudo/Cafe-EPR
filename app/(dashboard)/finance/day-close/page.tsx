import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import DayCloseClient from "@/components/finance/day-close-client";

export const dynamic = "force-dynamic";

export default async function DayClosePage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: openClose }, { data: closings }] = await Promise.all([
    supabase.rpc("get_open_close"),
    supabase.rpc("get_closings", { p_limit: 30 }),
  ]);

  return (
    <DayCloseClient
      initialOpenClose={(openClose as any) ?? null}
      initialClosings={(((closings as any)?.closings) ?? []) as any}
    />
  );
}