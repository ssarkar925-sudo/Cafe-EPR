import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import ExpensesClient from "@/components/finance/expenses-client";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: expenses }, { data: instruments }] = await Promise.all([
    supabase
      .from("expenses")
      .select("*, profiles(full_name)")
      .order("expense_date", { ascending: false })
      .limit(300),
    supabase.from("payment_instruments").select("id, name, type").eq("is_active", true),
  ]);

  let enriched = (expenses ?? []) as any[];
  const ids = enriched.map((e: any) => e.id);
  if (ids.length) {
    const { data: ces } = await supabase
      .from("cash_entries")
      .select("ref_id, instrument_id, method")
      .eq("ref_type", "expense")
      .in("ref_id", ids)
      .order("created_at", { ascending: true });
    const byId = new Map<string, any>();
    for (const ce of (ces ?? []) as any[]) {
      if (!byId.has(ce.ref_id)) byId.set(ce.ref_id, ce);
    }
    enriched = enriched.map((e: any) => {
      const ce = byId.get(e.id);
      return { ...e, source: ce?.instrument_id ?? "", method: ce?.method ?? "cash" };
    });
  }

  return <ExpensesClient initialExpenses={enriched as any} instruments={(instruments ?? []) as any} />;
}