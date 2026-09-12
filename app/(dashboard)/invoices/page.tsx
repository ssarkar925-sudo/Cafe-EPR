import { createClient } from "@/lib/supabase/server";
import UnifiedInvoicesClient from "@/components/invoices/unified-invoices-client";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const supabase = await createClient();
  const [{ data: invoices }, { data: quickSales }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, total, paid, due, returned, refunded, status, created_at, customers(name, phone)")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("quick_sales")
      .select("id, sale_number, sale_date, amount, cost, tendered, change_due, payments, status, created_at, customers(name, phone), products(name), services(name), item_name")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  return (
    <div data-page="invoices" className="invoices-page">
      <UnifiedInvoicesClient
        initialInvoices={(invoices ?? []) as any[]}
        initialQuickSales={(quickSales ?? []) as any[]}
      />
    </div>
  );
}
