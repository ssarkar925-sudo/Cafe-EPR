import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { getIstDateString } from "@/lib/date";
import ReconciliationClient from "@/components/finance/reconciliation-client";

export const dynamic = "force-dynamic";

export default async function FinancialReconciliationPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();
  const today = getIstDateString();

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
    supabase.from("payment_instruments").select("id,name,type,balance,opening_balance,details,is_active,created_at").order("type").order("name"),
    supabase.from("cash_entries").select("id,instrument_id,direction,amount,created_at,entry_date,remarks,description,method,ref_type,ref_id").not("instrument_id", "is", null).order("created_at", { ascending: true }),
    supabase.from("aeps_portals").select("id,payment_instrument_id,name"),
    supabase.from("transactions").select("id,transaction_number,service_type,amount,status,created_at,transaction_date,customer_pay_method,instrument_id,pay_from_instrument_id").eq("status", "success").order("created_at", { ascending: false }).limit(2000),
    supabase.from("settlements").select("id,source_instrument_id,dest_instrument_id,from_pool,to_pool,amount,status,created_at,settlement_number").eq("status", "success").order("created_at", { ascending: false }).limit(1000),
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
