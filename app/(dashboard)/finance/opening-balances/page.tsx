import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import OpeningBalancesClient from "@/components/finance/opening-balances-client";

export const dynamic = "force-dynamic";

export default async function OpeningBalancesPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const [
    { data: balances },
    { data: instruments },
    { data: seeds },
    { data: customers },
    { data: suppliers },
    { data: products },
  ] = await Promise.all([
    supabase.rpc("get_pool_balances"),
    supabase.from("payment_instruments").select("*").order("type").order("name"),
    supabase
      .from("opening_balances")
      .select("id, pool, instrument_id, amount, as_of, remarks, created_at")
      .order("as_of", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("customers").select("id, name, phone").order("name").limit(500),
    supabase
      .from("suppliers")
      .select("id, name, code, current_balance, opening_balance")
      .order("name")
      .limit(500),
    supabase
      .from("products")
      .select("id, name, code, unit, cost_price, stock_qty, categories(name)")
      .order("name")
      .limit(500),
  ]);

  return (
    <OpeningBalancesClient
      initialBalances={(balances as any) ?? null}
      initialInstruments={(instruments ?? []) as any}
      initialSeeds={(seeds ?? []) as any}
      customers={(customers ?? []) as any}
      suppliers={(suppliers ?? []) as any}
      products={(products ?? []) as any}
    />
  );
}