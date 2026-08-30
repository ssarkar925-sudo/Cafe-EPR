import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import RechargeWorkspace from "@/components/business/recharge-workspace";

export const dynamic = "force-dynamic";

export default async function MobileRechargePage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: transactions }, { data: customers }, { data: rechargeProviders }, { data: rechargeSlabs }, { data: paymentInstruments }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("*, customers(name, phone), providers:recharge_providers(name), profiles(full_name)")
        .eq("service_type", "recharge")
        .order("transaction_timestamp", { ascending: false, nullsFirst: false })
        .order("transaction_date", { ascending: false })
        .limit(500),
      supabase
        .from("customers")
        .select("id, name, code, phone")
        .eq("is_active", true)
        .order("name")
        .limit(300),
      supabase.from("recharge_providers").select("*").eq("is_active", true).order("sort_order").order("name"),
      supabase.from("recharge_commission_slabs").select("*"),
      supabase.from("payment_instruments").select("*").order("name"),
    ]);

  return (
    <RechargeWorkspace
      initialTransactions={(transactions ?? []) as any}
      initialCustomers={(customers ?? []) as any}
      initialRechargeProviders={(rechargeProviders ?? []) as any}
      initialRechargeSlabs={(rechargeSlabs ?? []) as any}
      initialPaymentInstruments={(paymentInstruments ?? []) as any}
    />
  );
}
