import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import SettlementsClient from "@/components/finance/settlements-client";

export const dynamic = "force-dynamic";

export default async function SettlementsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const [
    { data: settlements },
    { data: poolBalances },
    { data: summary },
    { data: portals },
    { data: qrs },
    { data: paymentInstruments },
  ] = await Promise.all([
    supabase
      .from("settlements")
      .select(
        "id, settlement_number, settlement_type, settlement_date, from_pool, to_pool, direction, amount, reference, remarks, status, created_at, profiles(full_name)"
      )
      .order("settlement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.rpc("get_pool_balances"),
    supabase.rpc("get_settlement_summary"),
    supabase.from("aeps_portals").select("*").order("name"),
    supabase.from("upi_merchant_qrs").select("*").order("display_name"),
    supabase.from("payment_instruments").select("*").eq("is_active", true).order("name"),
  ]);

  const rows = (settlements ?? []).map((r: any) => ({
    ...r,
    profiles: r.profiles?.[0] ?? null,
  }));

  const parsedSummary: any = {
    cash: Number(poolBalances?.cash?.current ?? 0),
    bank: Number(poolBalances?.bank?.current ?? 0),
    wallet: Number(poolBalances?.wallet?.current ?? 0),
    dmt: Number(poolBalances?.dmt?.current ?? 0),
    aeps: Number(poolBalances?.aeps?.current ?? 0),
    upi_qr: Number(poolBalances?.upi_qr?.current ?? 0),
    credit_card: Number(poolBalances?.credit_card?.current ?? 0),
    count: rows.length,
  };

  if (Array.isArray(summary)) {
    summary.forEach((item: any) => {
      if (item?.pool && typeof item.available_balance === "number") {
        parsedSummary[item.pool] = item.available_balance;
      }
    });
  } else if (summary && typeof summary === "object") {
    Object.keys(parsedSummary).forEach((k) => {
      if (typeof (summary as any)[k] === "number") {
        parsedSummary[k] = (summary as any)[k];
      }
    });
  }

  return (
    <SettlementsClient
      initialSettlements={rows as any}
      initialSummary={parsedSummary}
      initialPortals={(portals ?? []) as any}
      initialQrs={(qrs ?? []) as any}
      initialPaymentInstruments={(paymentInstruments ?? []) as any}
    />
  );
}
