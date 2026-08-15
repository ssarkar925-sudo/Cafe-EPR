import { createClient } from "@/lib/supabase/server";
import InvoicesClient from "@/components/invoices/invoices-client";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, invoice_date, total, paid, due, status, customers(name)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  return <InvoicesClient initialInvoices={(invoices ?? []) as any} />;
}
