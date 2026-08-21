import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import ReportsClient from "@/components/reports/reports-client";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: invoices }, { data: items }, { data: payments }, { data: dues }, { data: expenses }, { data: returns }, { data: transactions }, { data: instruments }, { data: cashEntries }, { data: quickSales }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, total, paid, due, status, customers(name)")
        .order("invoice_date", { ascending: false })
        .limit(1000),
      supabase
        .from("invoice_items")
        .select("qty, amount, invoices(invoice_date), products(name), services(name)")
        .limit(1000),
      supabase
        .from("payments")
        .select("method, amount, received_at, invoices(invoice_number), payment_instruments(name, type)")
        .order("received_at", { ascending: false })
        .limit(1000),
      supabase
        .from("customers")
        .select("id, name, balance")
        .gt("balance", 0)
        .order("balance", { ascending: false })
        .limit(20),
      supabase
        .from("expenses")
        .select("id, expense_date, category, amount, note, status")
        .order("expense_date", { ascending: false })
        .limit(500),
      supabase
        .from("returns")
        .select("id, return_number, return_date, subtotal, refund, status, invoices(invoice_number, status)")
        .order("return_date", { ascending: false })
        .limit(500),
      supabase
        .from("transactions")
        .select("id, transaction_number, service_type, direction, transaction_date, customer_mobile, reference, amount, service_fee, portal_commission, status")
        .order("transaction_date", { ascending: false })
        .limit(500),
      supabase
        .from("payment_instruments")
        .select("id, name, type, is_active")
        .order("type")
        .order("name"),
      supabase
        .from("cash_entries")
        .select("id, entry_date, method, direction, amount, description, payment_instruments(name, type)")
        .order("entry_date", { ascending: false })
        .limit(1000),
      supabase
        .from("quick_sales")
        .select("id, sale_number, sale_date, item_name, amount, cost, change_due, payments, status, customers(name), products(name), services(name)")
        .order("sale_date", { ascending: false })
        .limit(1000),
    ]);

  return (
    <ReportsClient
      invoices={(invoices ?? []) as any}
      items={(items ?? []) as any}
      payments={(payments ?? []) as any}
      dues={(dues ?? []) as any}
      expenses={(expenses ?? []) as any}
      returns={(returns ?? []) as any}
      transactions={(transactions ?? []) as any}
      instruments={(instruments ?? []) as any}
      cashEntries={(cashEntries ?? []) as any}
      quickSales={(quickSales ?? []) as any}
    />
  );
}
