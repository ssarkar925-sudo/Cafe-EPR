import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import ReconciliationClient from "@/components/finance/reconciliation-client";

export const dynamic = "force-dynamic";

export default async function FinancialReconciliationPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const [
    { data: balances },
    { data: instruments },
    { data: cashEntries },
    { data: portals },
    { data: transactions },
    { data: settlements },
    { data: openingBalances },
  ] = await Promise.all([
    supabase.rpc("get_pool_balances", { p_as_of: today }),
    supabase.from("payment_instruments").select("*").order("type").order("name"),
    supabase.from("cash_entries").select("id, instrument_id, direction, amount, created_at, remarks, method, ref_type").not("instrument_id", "is", null),
    supabase.from("aeps_portals").select("id, payment_instrument_id, name"),
    supabase.from("transactions").select("id, transaction_number, service_type, pool_credit, pool_out, pool_credit_type, service_fee, upi_fee, amount, status, created_at, customer_pay_method, fee_source, portal_id, instrument_id").eq("status", "success").order("created_at", { ascending: false }).limit(200),
    supabase.from("settlements").select("id, source_instrument_id, dest_instrument_id, from_pool, to_pool, amount, status, created_at, settlement_number").eq("status", "success").order("created_at", { ascending: false }).limit(100),
    supabase.from("opening_balances").select("*").order("as_of", { ascending: false }),
  ]);

  return (
    <ReconciliationClient
      initialBalances={(balances as any) ?? null}
      initialInstruments={(instruments ?? []) as any}
      initialCashEntries={(cashEntries ?? []) as any}
      initialPortals={(portals ?? []) as any}
      initialTransactions={(transactions ?? []) as any}
      initialSettlements={(settlements ?? []) as any}
      initialOpeningBalances={(openingBalances ?? []) as any}
    />
  );
}
