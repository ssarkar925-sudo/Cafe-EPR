import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import BillPaymentHub from "@/components/business/bill-payment-hub";

export const dynamic = "force-dynamic";

export default async function BillPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; category?: string; provider?: string }>;
}) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const { tab, category, provider } = await searchParams;
  const supabase = await createClient();

  const [
    { data: transactions },
    { data: customers },
    { data: rechargeProviders },
    { data: rechargeSlabs },
    { data: paymentInstruments },
    { data: billCommissions },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("*, customers(name, phone), providers:recharge_providers(name), profiles(full_name)")
      .in("service_type", ["recharge", "bill_payment", "utility_bill", "utility", "google_play_recharge", "google_play"])
      .order("transaction_timestamp", { ascending: false, nullsFirst: false })
      .order("transaction_date", { ascending: false })
      .limit(600),
    supabase
      .from("customers")
      .select("id, name, code, phone")
      .eq("is_active", true)
      .order("name")
      .limit(300),
    supabase.from("recharge_providers").select("*").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("recharge_commission_slabs").select("*"),
    supabase.from("payment_instruments").select("*").order("name"),
    supabase.from("bill_payment_commission_config").select("*").order("category_name").order("biller_name"),
  ]);

  return (
    <BillPaymentHub
      initialTransactions={(transactions ?? []) as any}
      initialCustomers={(customers ?? []) as any}
      initialRechargeProviders={(rechargeProviders ?? []) as any}
      initialRechargeSlabs={(rechargeSlabs ?? []) as any}
      initialPaymentInstruments={(paymentInstruments ?? []) as any}
      initialBillCommissions={(billCommissions ?? []) as any}
      initialTab={tab || "overview"}
      initialCategory={category}
      initialProvider={provider}
    />
  );
}
