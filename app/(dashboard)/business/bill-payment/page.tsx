import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import BillPaymentHub from "@/components/business/bill-payment-hub";
import UtilityBillWorkspace from "@/components/business/utility-bill-workspace";

export const dynamic = "force-dynamic";

function orderInstruments<T extends { id: string }>(instruments: T[], priorityIds: string[]) {
  const rank = new Map(priorityIds.map((id, index) => [id, index]));
  return [...instruments].sort((a, b) => {
    const ar = rank.get(a.id);
    const br = rank.get(b.id);
    if (ar != null && br != null) return ar - br;
    if (ar != null) return -1;
    if (br != null) return 1;
    return 0;
  });
}

export default async function BillPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; category?: string; provider?: string }>;
}) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const { tab, category, provider } = await searchParams;
  const supabase = await createClient();

  const serviceDefaultKey = tab === "utility" ? "bill_payment" : tab === "google_play" ? "google_play" : "recharge";
  const customerMethods = ["cash", "upi", "bank", "wallet", "card"];

  const [
    { data: transactions },
    { data: customers },
    { data: rechargeProviders },
    { data: rechargeSlabs },
    { data: paymentInstruments },
    { data: billCommissions },
    fundingDefaultResult,
    ...collectionDefaultResults
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
      .select("id, name, code, phone, balance")
      .eq("is_active", true)
      .order("name")
      .limit(300),
    supabase.from("recharge_providers").select("*").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("recharge_commission_slabs").select("*"),
    supabase.from("payment_instruments").select("*").order("name"),
    supabase.from("bill_payment_commission_config").select("*").order("category_name").order("biller_name"),
    supabase.rpc("resolve_default_payment_route", {
      p_purpose: "provider_funding",
      p_service_type: serviceDefaultKey,
      p_provider_key: provider || null,
      p_customer_payment_method: null,
      p_funding_method: null,
      p_user_id: null,
    }),
    ...customerMethods.map((method) =>
      supabase.rpc("resolve_default_payment_route", {
        p_purpose: "customer_collection",
        p_service_type: null,
        p_provider_key: null,
        p_customer_payment_method: method,
        p_funding_method: null,
        p_user_id: null,
      })
    ),
  ] as any);

  const routingIds: string[] = [];
  const fundingDefaultId = fundingDefaultResult?.data?.success ? fundingDefaultResult.data.instrument_id : null;
  if (fundingDefaultId) routingIds.push(fundingDefaultId);
  for (const result of collectionDefaultResults) {
    const id = result?.data?.success ? result.data.instrument_id : null;
    if (id && !routingIds.includes(id)) routingIds.push(id);
  }
  const routedPaymentInstruments = orderInstruments((paymentInstruments ?? []) as any[], routingIds);

  if (tab === "utility") {
    return (
      <UtilityBillWorkspace
        initialTransactions={(transactions ?? []) as any}
        initialCustomers={(customers ?? []) as any}
        initialPaymentInstruments={routedPaymentInstruments as any}
      />
    );
  }

  return (
    <BillPaymentHub
      initialTransactions={(transactions ?? []) as any}
      initialCustomers={(customers ?? []) as any}
      initialRechargeProviders={(rechargeProviders ?? []) as any}
      initialRechargeSlabs={(rechargeSlabs ?? []) as any}
      initialPaymentInstruments={routedPaymentInstruments as any}
      initialBillCommissions={(billCommissions ?? []) as any}
      initialTab={tab || "overview"}
      initialCategory={category}
      initialProvider={provider}
    />
  );
}
