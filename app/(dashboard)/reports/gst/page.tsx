import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRole, hasRole } from "@/lib/authz";
import { redirect } from "next/navigation";
import GstReportClient from "@/components/reports/gst-client";
import PurchaseGstReconciliationCard from "@/components/reports/purchase-gst-reconciliation-card";

export const dynamic = "force-dynamic";

export default async function GstReportPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; period?: string }>;
}) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const { start, end, period } = await searchParams;
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
  const defaultStart = `${fyStartYear}-04-01`;
  const defaultEnd = `${fyStartYear + 1}-03-31`;
  const startDate = start || defaultStart;
  const endDate = end || defaultEnd;

  const supabase = createAdminClient();
  const [{ data: reportData, error }, { data: purchaseGstReconciliation, error: purchaseGstError }, { data: settings }] = await Promise.all([
    supabase.rpc("get_gst_report", { p_start_date: startDate, p_end_date: endDate }),
    supabase.rpc("get_gst_purchase_return_reconciliation", { p_from: startDate, p_to: endDate }),
    supabase.from("settings").select("*").single(),
  ]);

  return (
    <div className="space-y-6">
      <GstReportClient
        initialData={reportData || {}}
        startDate={startDate}
        endDate={endDate}
        period={period || "fy"}
        settings={settings || {}}
        error={error?.message || null}
      />
      <PurchaseGstReconciliationCard data={purchaseGstReconciliation} />
      {purchaseGstError && (
        <p className="text-xs text-rose-600 dark:text-rose-400">Purchase GST reconciliation unavailable: {purchaseGstError.message}</p>
      )}
    </div>
  );
}
