import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import JournalClient from "@/components/finance/journal-client";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: entries }, { data: instruments }] = await Promise.all([
    supabase
      .from("cash_entries")
      .select(
        "id, direction, amount, method, description, entry_date, ref_type, ref_id, instrument_id, created_at, payment_instruments(name, type)"
      )
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("payment_instruments")
      .select("id, name, type")
      .eq("is_active", true)
      .order("type")
      .order("name"),
  ]);

  return (
    <JournalClient
      initialEntries={(entries ?? []) as any[]}
      instruments={(instruments ?? []) as any[]}
    />
  );
}
