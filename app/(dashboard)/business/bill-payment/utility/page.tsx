import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import UtilityBillWorkspace from "@/components/business/utility-bill-workspace";

export const dynamic = "force-dynamic";

export default async function UtilityBillPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: transactions }, { data: customers }, { data: paymentInstruments }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("*, customers(name, phone), profiles(full_name)")
        .in("service_type", ["bill_payment", "utility_bill", "utility", "recharge"])
        .order("transaction_timestamp", { ascending: false, nullsFirst: false })
        .order("transaction_date", { ascending: false })
        .limit(500),
      supabase
        .from("customers")
        .select("id, name, code, phone")
        .eq("is_active", true)
        .order("name")
        .limit(300),
      supabase.from("payment_instruments").select("*").order("name"),
    ]);

  return (
    <UtilityBillWorkspace
      initialTransactions={(transactions ?? []) as any}
      initialCustomers={(customers ?? []) as any}
      initialPaymentInstruments={(paymentInstruments ?? []) as any}
    />
  );
}
