import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import SecurityCenterClient from "@/components/security/security-center";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin"])) redirect("/dashboard");

  const supabase = await createClient();

  const [
    { data: settings },
    { data: customers },
    { data: invoices },
    { data: products },
    { data: settlements },
    { data: cashEntries },
    { data: expenses },
  ] = await Promise.all([
    supabase.from("settings").select("shop_name").limit(1).maybeSingle(),
    supabase.from("customers").select("id, name, phone, balance").limit(500),
    supabase.from("invoices").select("id, invoice_number, total_amount, paid_amount, status").limit(500),
    supabase.from("products").select("id, name, stock_quantity, cost_price, sale_price").limit(500),
    supabase.from("settlements").select("id, settlement_number, from_pool, to_pool, amount, settlement_date").limit(500),
    supabase.from("cash_entries").select("id, method, direction, amount, entry_date").limit(500),
    supabase.from("expenses").select("id, amount, expense_date").limit(500),
  ]);

  return (
    <SecurityCenterClient
      shopName={settings?.shop_name || "Sarkar Communication"}
      customers={(customers ?? []) as any}
      invoices={(invoices ?? []) as any}
      products={(products ?? []) as any}
      settlements={(settlements ?? []) as any}
      cashEntries={(cashEntries ?? []) as any}
      expenses={(expenses ?? []) as any}
    />
  );
}
