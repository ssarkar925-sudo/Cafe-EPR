import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import ReportsClient from "@/components/reports/reports-client";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: invoices }, { data: items }, { data: payments }, { data: dues }, { data: expenses }, { data: returns }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, total, paid, due, status, customers(name)")
        .order("invoice_date", { ascending: false })
        .limit(1000),
      supabase
        .from("invoice_items")
        .select("qty, amount, products(name), services(name)")
        .limit(1000),
      supabase
        .from("payments")
        .select("method, amount, received_at, invoices(invoice_number)")
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
        .select("id, return_number, return_date, subtotal, refund, status, invoices(invoice_number)")
        .order("return_date", { ascending: false })
        .limit(500),
    ]);

  return (
    <ReportsClient
      invoices={(invoices ?? []) as any}
      items={(items ?? []) as any}
      payments={(payments ?? []) as any}
      dues={(dues ?? []) as any}
      expenses={(expenses ?? []) as any}
      returns={(returns ?? []) as any}
    />
  );
}
