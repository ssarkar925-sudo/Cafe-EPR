import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRole, hasRole } from "@/lib/authz";
import { redirect } from "next/navigation";
import GstReportClient from "@/components/reports/gst-client";

export const dynamic = "force-dynamic";

export default async function GstReportPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; period?: string }>;
}) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) {
    redirect("/dashboard");
  }

  const { start, end, period } = await searchParams;
  const today = new Date();
  
  // Default to current Indian FY (e.g. 2026-04-01 to 2027-03-31)
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0 = Jan, 3 = Apr
  const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
  const defaultStart = `${fyStartYear}-04-01`;
  const defaultEnd = `${fyStartYear + 1}-03-31`;

  const startDate = start || defaultStart;
  const endDate = end || defaultEnd;

  const supabase = createAdminClient();

  const { data: reportData, error } = await supabase.rpc("get_gst_report", {
    p_start_date: startDate,
    p_end_date: endDate,
  });

  const { data: settings } = await supabase.from("settings").select("*").single();

  return (
    <GstReportClient
      initialData={reportData || {}}
      startDate={startDate}
      endDate={endDate}
      period={period || "fy"}
      settings={settings || {}}
      error={error?.message || null}
    />
  );
}

