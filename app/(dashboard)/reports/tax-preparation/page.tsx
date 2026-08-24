import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import TaxPreparationClient from "@/components/reports/tax-preparation-client";

export const dynamic = "force-dynamic";

export default async function TaxPreparationPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  // Current Indian Financial Year (Apr 1 to Mar 31)
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-indexed: 0 = Jan, 3 = Apr
  const currentYear = now.getFullYear();
  const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
  const initialStartDate = `${fyStartYear}-04-01`;
  const initialEndDate = `${fyStartYear + 1}-03-31`;

  // Fetch initial tax report via canonical RPC
  const { data: initialReport, error: rpcError } = await supabase.rpc("get_tax_preparation_report", {
    p_start_date: initialStartDate,
    p_end_date: initialEndDate,
  });

  if (rpcError) {
    console.error("Tax Preparation RPC Error:", rpcError);
  }

  // Fetch raw supporting registers for audit drill-down
  const [
    { data: rawInvoices },
    { data: rawQuickSales },
    { data: rawExpenses },
    { data: rawTransactions },
    { data: rawCustomers },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, total, paid, due, status, customers(name)")
      .gte("invoice_date", initialStartDate)
      .lte("invoice_date", initialEndDate)
      .order("invoice_date", { ascending: false }),
    supabase
      .from("cash_entries")
      .select("id, entry_date, method, direction, amount, description, ref_type, ref_id")
      .gte("entry_date", initialStartDate)
      .lte("entry_date", initialEndDate)
      .eq("ref_type", "quick_sale")
      .order("entry_date", { ascending: false }),
    supabase
      .from("expenses")
      .select("id, expense_date, category, amount, note, status, created_at")
      .gte("expense_date", initialStartDate)
      .lte("expense_date", initialEndDate)
      .order("expense_date", { ascending: false }),
    supabase
      .from("transactions")
      .select("id, transaction_number, service_type, direction, transaction_date, amount, service_fee, portal_commission, status, customer_mobile, reference")
      .gte("transaction_date", initialStartDate)
      .lte("transaction_date", initialEndDate)
      .order("transaction_date", { ascending: false }),
    supabase
      .from("customers")
      .select("id, name, phone, balance")
      .gt("balance", 0)
      .order("balance", { ascending: false }),
  ]);

  return (
    <TaxPreparationClient
      initialStartDate={initialStartDate}
      initialEndDate={initialEndDate}
      initialReport={initialReport}
      rawInvoices={rawInvoices || []}
      rawQuickSales={rawQuickSales || []}
      rawExpenses={rawExpenses || []}
      rawTransactions={rawTransactions || []}
      rawCustomers={rawCustomers || []}
    />
  );
}

