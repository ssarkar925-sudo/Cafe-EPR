import { createClient } from "@/lib/supabase/server";
import ExpensesClient from "@/components/finance/expenses-client";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const supabase = await createClient();

  const { data: expenses } = await supabase
    .from("expenses")
    .select("*, profiles(full_name)")
    .order("expense_date", { ascending: false })
    .limit(300);

  return <ExpensesClient initialExpenses={(expenses ?? []) as any} />;
}
