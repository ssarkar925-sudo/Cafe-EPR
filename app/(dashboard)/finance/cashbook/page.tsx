import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import CashbookClient from "@/components/finance/cashbook-client";

export const dynamic = "force-dynamic";

export default async function CashbookPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: entries }, { data: instruments }] = await Promise.all([
    supabase
      .from("cash_entries")
      .select("*, payment_instruments(name, type)")
      .order("entry_date", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1000),
    supabase
      .from("payment_instruments")
      .select("id, name, type")
      .eq("is_active", true)
      .order("type")
      .order("name"),
  ]);

  return (
    <CashbookClient initialEntries={(entries ?? []) as any} instruments={(instruments ?? []) as any} />
  );
}
