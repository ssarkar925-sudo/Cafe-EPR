import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { getIstDateString } from "@/lib/date";
import OpeningBalancesClient from "@/components/finance/opening-balances-client";
import type { OpeningPositionSnapshot } from "@/components/finance/opening-position-workspace";

export const dynamic = "force-dynamic";

export default async function OpeningBalancesPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();
  const today = getIstDateString();

  const [
    { data: balances },
    { data: instruments },
    { data: seeds },
    { data: customers },
    { data: suppliers },
    { data: products },
    { data: openingPosition },
  ] = await Promise.all([
    supabase.rpc("get_pool_balances", { p_as_of: today }),
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
    supabase
      .from("opening_positions")
      .select("id, opening_date, status, total_assets, total_liabilities, opening_capital, snapshot_data, remarks, finalized_at")
      .eq("status", "finalized")
      .order("opening_date", { ascending: false })
      .order("finalized_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const initialPosition = openingPosition
    ? ({
        id: openingPosition.id,
        opening_date: openingPosition.opening_date,
        status: openingPosition.status,
        total_assets: Number(openingPosition.total_assets || 0),
        total_liabilities: Number(openingPosition.total_liabilities || 0),
        opening_capital: Number(openingPosition.opening_capital || 0),
        remarks: openingPosition.remarks || "",
        finalized_at: openingPosition.finalized_at || undefined,
        ...(openingPosition.snapshot_data || {}),
      } as OpeningPositionSnapshot)
    : null;

  return (
    <OpeningBalancesClient
      initialBalances={(balances as any) ?? null}
      initialInstruments={(instruments ?? []) as any}
      initialSeeds={(seeds ?? []) as any}
      initialPosition={initialPosition}
      customers={(customers ?? []) as any}
      suppliers={(suppliers ?? []) as any}
      products={(products ?? []) as any}
    />
  );
}
