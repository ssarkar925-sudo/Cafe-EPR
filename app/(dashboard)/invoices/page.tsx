import { createClient } from "@/lib/supabase/server";
import UnifiedInvoicesClient from "@/components/invoices/unified-invoices-client";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, total, paid, due, returned, refunded, status, created_at, customers(name, phone)")
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <div data-page="invoices" className="invoices-page">
      <UnifiedInvoicesClient initialInvoices={(invoices ?? []) as any[]} />
    </div>
  );
}
