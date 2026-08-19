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

  return <ExpensesClient initialExpenses={(expenses ?? []) as any} instruments={(instruments ?? []) as any} />;
}