import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import IncomeReportClient from "@/components/reports/income-report-client";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string }>;

export default async function IncomeReportPage({ searchParams }: { searchParams: SearchParams }) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : today;
  const to = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : today;
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("transaction_number, service_type, amount, service_fee, portal_charge, portal_commission, status, transaction_date, created_at")
    .eq("status", "success")
    .gte("transaction_date", from)
    .lte("transaction_date", to)
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true });

  return <IncomeReportClient rows={(data ?? []) as any} from={from} to={to} />;
}
