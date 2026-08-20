import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import BusinessClient from "@/components/business/business-client";

export const dynamic = "force-dynamic";

const SERVICES: Record<string, string> = {
  aeps: "AEPS",
  dmt: "DMT",
  upi: "UPI",
  recharge: "Recharge",
};

const SUPABASE_POOL: Record<string, string> = {
  aeps: "aeps",
  dmt: "dmt",
  upi: "upi_qr",
  recharge: "recharge",
};

export default async function BusinessServicePage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const { service } = await params;
  if (!SERVICES[service]) redirect("/dashboard");

  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const txnSelect =
    service === "recharge"
      ? "*, customers(name, phone), providers:recharge_providers(name), profiles(full_name)"
      : "*, customers(name, phone), banks:aeps_banks(name), portals:aeps_portals(name), merchant_qrs:upi_merchant_qrs(display_name, upi_id), profiles(full_name)";

  const [{ data: transactions }, { data: customers }, { data: banks }, { data: portals }, { data: qrs }, { data: poolBalances }, { data: rechargeProviders }, { data: rechargeSlabs }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select(txnSelect)
        .eq("service_type", service)
        .order("transaction_timestamp", { ascending: false, nullsFirst: false })
        .order("transaction_date", { ascending: false })
        .limit(500),
      supabase
        .from("customers")
        .select("id, name, code, phone")
        .eq("is_active", true)
        .order("name")
        .limit(300),
      supabase.from("aeps_banks").select("*").order("name"),
      supabase.from("aeps_portals").select("*").order("name"),
      supabase.from("upi_merchant_qrs").select("*").order("display_name"),
      supabase.rpc("get_pool_balances"),
      service === "recharge"
        ? supabase.from("recharge_providers").select("*").eq("is_active", true).order("sort_order").order("name")
        : Promise.resolve({ data: null, error: null }),
      service === "recharge"
        ? supabase.from("recharge_commission_slabs").select("*")
        : Promise.resolve({ data: null, error: null }),
    ]);

  const poolKey = SUPABASE_POOL[service];
  const poolBal = (poolBalances as any)?.[poolKey] ?? null;

  return (
    <BusinessClient
      service={service}
      label={SERVICES[service]}
      initialTransactions={(transactions ?? []) as any}
      initialCustomers={(customers ?? []) as any}
      initialBanks={(banks ?? []) as any}
      initialPortals={(portals ?? []) as any}
      initialQrs={(qrs ?? []) as any}
      initialRechargeProviders={(rechargeProviders ?? []) as any}
      initialRechargeSlabs={(rechargeSlabs ?? []) as any}
      float={poolBal ?? null}
    />
  );
}
