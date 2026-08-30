import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import BillPaymentHub from "@/components/business/bill-payment-hub";

export const dynamic = "force-dynamic";

export default async function BillPaymentPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const { data: transactions } = await supabase
    .from("transactions")
    .select("*, customers(name, phone), providers:recharge_providers(name), profiles(full_name)")
    .in("service_type", ["recharge", "bill_payment", "utility_bill"])
    .order("transaction_timestamp", { ascending: false, nullsFirst: false })
    .order("transaction_date", { ascending: false })
    .limit(300);

  return (
    <BillPaymentHub
      initialTransactions={(transactions ?? []) as any}
    />
  );
}
