import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import AIControlCenter from "@/components/ai/ai-control-center";

export const dynamic = "force-dynamic";

export default async function AIPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) redirect("/dashboard");

  const supabase = await createClient();

  const [
    poolResult,
    { data: customers },
    { data: invoices },
    { data: transactions },
    { data: settlements },
    { data: cashEntries },
    { data: products },
    { data: expenses },
    { data: documents },
  ] = await Promise.all([
    supabase.rpc("get_pool_balances"),
    supabase.from("customers").select("id, name, phone, balance, credit_limit, created_at, gstin").order("name"),
    supabase.from("invoices").select("id, invoice_number, total_amount, paid_amount, status, payment_method, type, created_at").limit(1000),
    supabase.from("transactions").select("id, service_type, total_amount, net_earnings, status, payment_mode, created_at").limit(1000),
    supabase.from("settlements").select("id, settlement_number, from_pool, to_pool, amount, status, settlement_date, reference, remarks").order("created_at", { ascending: false }).limit(200),
    supabase.from("cash_entries").select("id, method, direction, amount, ref_type, ref_id, description, entry_date").limit(1000),
    supabase.from("products").select("id, name, stock_quantity, cost_price, sale_price, min_stock_alert").limit(500),
    supabase.from("expenses").select("id, amount, is_deductible, expense_date, category").limit(500),
    supabase.from("ai_document_vault").select("*").order("created_at", { ascending: false }).limit(200),
  ]);

  let gatewayStatus = { connected: false, status: "unknown", url: "" };
  try {
    const { data: waRow } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    if (waRow?.config) {
      const cfg = waRow.config as any;
      gatewayStatus = {
        connected: cfg.provider === "local_gateway" || Boolean(cfg.gateway_url),
        status: cfg.provider ?? "off",
        url: cfg.gateway_url ?? "",
      };
    }
  } catch {}

  return (
    <AIControlCenter
      initialPools={(poolResult?.data ?? null) as any}
      initialCustomers={(customers ?? []) as any}
      initialInvoices={(invoices ?? []) as any}
      initialTransactions={(transactions ?? []) as any}
      initialSettlements={(settlements ?? []) as any}
      initialCashEntries={(cashEntries ?? []) as any}
      initialProducts={(products ?? []) as any}
      initialExpenses={(expenses ?? []) as any}
      initialDocuments={(documents ?? []) as any}
      gatewayStatus={gatewayStatus}
    />
  );
}
