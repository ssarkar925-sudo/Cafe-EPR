import { createClient } from "@/lib/supabase/server";
import InvoicesClient from "@/components/invoices/invoices-client";
import InvoicesOpsStrip from "@/components/invoices/invoices-ops-strip";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { data: invoices } = await supabase.from("invoices").select("id, invoice_number, invoice_date, total, paid, due, returned, refunded, status, created_at, customers(name, phone)").order("created_at", { ascending: false }).limit(500);
  const { data: quickSales } = await supabase.from("quick_sales").select("id, sale_number, sale_date, amount, cost, tendered, change_due, payments, status, created_at, customers(name, phone), products(name), services(name), item_name").order("created_at", { ascending: false }).limit(500);
  const rows = (invoices ?? []) as any[];
  return <div data-page="invoices" className="invoices-page"><InvoicesOpsStrip invoices={rows} /><InvoicesClient initialInvoices={rows} initialQuickSales={(quickSales ?? []) as any} /></div>;
}
