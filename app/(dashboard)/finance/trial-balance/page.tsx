import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import TrialBalanceClient from "@/components/finance/trial-balance-client";

export const dynamic = "force-dynamic";

export default async function TrialBalancePage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const [{ data: instruments }, { data: entries }, { data: openingBalances }, { data: poolBalances }] =
    await Promise.all([
      supabase.from("payment_instruments").select("id, name, type, is_active, opening_balance").order("type").order("name"),
      supabase
        .from("cash_entries")
        .select("instrument_id, direction, amount, entry_date")
        .not("instrument_id", "is", null),
      supabase
        .from("opening_balances")
        .select("pool, instrument_id, amount, as_of")
        .order("as_of", { ascending: false }),
      supabase.rpc("get_pool_balances", { p_as_of: today }),
    ]);

  return (
    <TrialBalanceClient
      instruments={(instruments ?? []) as any[]}
      entries={(entries ?? []) as any[]}
      openingBalances={(openingBalances ?? []) as any[]}
      poolBalances={(poolBalances ?? {}) as any}
    />
  );
}
