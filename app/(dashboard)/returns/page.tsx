import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { redirect } from "next/navigation";
import ReturnsClient from "@/components/returns/returns-client";
import ReturnsHub from "@/components/returns/returns-hub";

export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();
  const { data: returns } = await supabase
    .from("returns")
    .select("id, return_number, return_date, reason, subtotal, refund, refund_method, status, created_at, invoice_id, invoices(invoice_number, total, paid, due, returned, refunded, customers(name, phone))")
    .order("created_at", { ascending: false })
    .limit(300);

  const rows = (returns ?? []) as any[];
  return (
    <div className="space-y-10">
      <ReturnsHub returns={rows} />
      <div className="border-t border-slate-200 pt-8 dark:border-white/10">
        <ReturnsClient initialReturns={rows} />
      </div>
    </div>
  );
}
