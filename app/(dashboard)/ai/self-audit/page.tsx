import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import FinancialIntegrityDashboard from "@/components/ai/financial-integrity-dashboard";

export const dynamic = "force-dynamic";

export default async function SelfAuditPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) {
    redirect("/dashboard");
  }

  const supabase = await createClient();

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
  const fyStart = `${fyStartYear}-04-01`;
  const fyEnd = `${fyStartYear + 1}-03-31`;

  const [
    latestRunRes,
    allRunsRes,
    poolResult,
    gstResult,
    taxPrepResult,
    { data: invoices },
    { data: customers },
    { data: products },
    { data: expenses },
    { data: transactions },
    { data: dayCloses },
    { data: settings },
  ] = await Promise.all([
    supabase.from("audit_runs").select("*, audit_findings(*)").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("audit_runs").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.rpc("get_pool_balances"),
    supabase.rpc("get_gst_report", { p_start_date: fyStart, p_end_date: fyEnd }),
    supabase.rpc("get_tax_preparation_report", { p_start_date: fyStart, p_end_date: fyEnd }),
    supabase.from("invoices").select("id, invoice_number, total, status, invoice_date, customer_gstin, place_of_supply, b2b_or_b2c").limit(500),
    supabase.from("customers").select("id, name, balance, phone, gstin").limit(500),
    supabase.from("products").select("id, name, stock_qty, cost_price, sale_price, hsn_code, gst_rate").limit(500),
    supabase.from("expenses").select("id, amount, status, category, expense_date").limit(500),
    supabase.from("transactions").select("id, service_type, total_amount, service_fee, portal_commission, status").limit(500),
    supabase.from("day_closes").select("*").order("close_date", { ascending: false }).limit(30),
    supabase.from("settings").select("*").single(),
  ]);

  return (
    <FinancialIntegrityDashboard
      initialLatestRun={(latestRunRes?.data ?? null) as any}
      initialAuditHistory={(allRunsRes?.data ?? []) as any}
      initialPoolBalances={(poolResult?.data ?? {}) as any}
      initialGstReport={(gstResult?.data ?? {}) as any}
      initialTaxPrepReport={(taxPrepResult?.data ?? {}) as any}
      initialInvoices={(invoices ?? []) as any}
      initialCustomers={(customers ?? []) as any}
      initialProducts={(products ?? []) as any}
      initialExpenses={(expenses ?? []) as any}
      initialTransactions={(transactions ?? []) as any}
      initialDayCloses={(dayCloses ?? []) as any}
      settings={(settings ?? {}) as any}
    />
  );
}
