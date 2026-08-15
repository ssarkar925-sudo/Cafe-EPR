import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import TransactionsClient from "@/components/finance/transactions-client";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: transactions }, { data: customers }] = await Promise.all([
    supabase
      .from("transactions")
      .select("*, profiles(full_name)")
      .order("transaction_date", { ascending: false })
      .limit(300),
    supabase
      .from("customers")
      .select("id, name, code")
      .eq("is_active", true)
      .order("name")
      .limit(300),
  ]);

  return (
    <TransactionsClient
      initialTransactions={(transactions ?? []) as any}
      initialCustomers={(customers ?? []) as any}
    />
  );
}
