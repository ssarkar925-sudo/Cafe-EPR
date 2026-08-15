import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import ExpensesClient from "@/components/finance/expenses-client";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const { data: expenses } = await supabase
    .from("expenses")
    .select("*, profiles(full_name)")
    .order("expense_date", { ascending: false })
    .limit(300);

  return <ExpensesClient initialExpenses={(expenses ?? []) as any} />;
}
