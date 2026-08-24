import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { assembleVerifiedContext, generateAdvisorAnswer } from "@/lib/ai/advisor-engine";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { question = "What is my current profit?", period = "fy_ytd", customStartDate, customEndDate } = body;

    const supabase = await createClient();

    // Determine date boundaries
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;

    let startDate = `${fyStartYear}-04-01`;
    let endDate = `${fyStartYear + 1}-03-31`;
    let periodLabel = "FY 2026-27 YTD";

    if (period === "today") {
      const d = today.toISOString().slice(0, 10);
      startDate = d;
      endDate = d;
      periodLabel = "Today";
    } else if (period === "this_month") {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      endDate = today.toISOString().slice(0, 10);
      periodLabel = "This Month";
    } else if (customStartDate && customEndDate) {
      startDate = customStartDate;
      endDate = customEndDate;
      periodLabel = `${customStartDate} to ${customEndDate}`;
    }

    // Query Canonical Database Functions & Tables
    const [
      taxReportRes,
      poolBalancesRes,
      latestAuditRunRes,
      { data: customers },
      { data: expenses },
      { data: transactions },
    ] = await Promise.all([
      supabase.rpc("get_tax_preparation_report", { p_start_date: startDate, p_end_date: endDate }),
      supabase.rpc("get_pool_balances"),
      supabase.from("audit_runs").select("*, audit_findings(*)").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("customers").select("id, name, phone, balance, gstin").order("balance", { ascending: false }).limit(100),
      supabase.from("expenses").select("id, amount, status, category, expense_date, note").gte("expense_date", startDate).lte("expense_date", endDate).limit(500),
      supabase.from("transactions").select("id, service_type, total_amount, service_fee, portal_commission, status, created_at").gte("created_at", startDate).lte("created_at", `${endDate}T23:59:59`).limit(500),
    ]);

    const selfAudit = latestAuditRunRes?.data ? {
      audit_score: latestAuditRunRes.data.audit_score,
      status: latestAuditRunRes.data.status,
      active_anomalies_count: latestAuditRunRes.data.total_findings || 0,
      critical_anomalies_count: latestAuditRunRes.data.critical_count || 0,
      top_finding: latestAuditRunRes.data.audit_findings?.[0]?.description,
    } : {
      audit_score: 100,
      status: "PASS",
      active_anomalies_count: 0,
      critical_anomalies_count: 0,
    };

    const context = assembleVerifiedContext({
      periodLabel,
      startDate,
      endDate,
      taxReport: taxReportRes?.data ?? {},
      selfAuditReport: selfAudit,
      poolBalances: poolBalancesRes?.data ?? {},
      customers: customers ?? [],
      expenses: expenses ?? [],
      transactions: transactions ?? [],
    });

    const response = generateAdvisorAnswer(question, context);

    return NextResponse.json({
      success: true,
      response,
      context,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to process advisor query" }, { status: 500 });
  }
}

