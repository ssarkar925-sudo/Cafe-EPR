import { createAdminClient } from "@/lib/supabase/admin";

export type MonitorSeverity = "info" | "attention" | "critical";
export type MonitorSource = "application" | "business" | "transaction" | "security" | "customer" | "inventory" | "system";

type MonitorEvent = {
  severity: MonitorSeverity;
  source: MonitorSource;
  title: string;
  details: Record<string, unknown>;
};

function n(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dayStart(daysAgo = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

function inRange(value: unknown, start: Date, end: Date): boolean {
  const d = new Date(String(value));
  return !Number.isNaN(d.getTime()) && d >= start && d < end;
}

export async function runBusinessMonitorScan() {
  const db = createAdminClient();
  const today = dayStart(0);
  const current7 = dayStart(7);
  const previous7 = dayStart(14);

  const [
    invoicesRes,
    transactionsRes,
    productsRes,
    customersRes,
    settlementsRes,
    auditFindingsRes,
    cashEntriesRes,
  ] = await Promise.all([
    db.from("invoices").select("id,invoice_date,total,paid,due,status,created_at").limit(2000),
    db.from("transactions").select("id,service_type,amount,commission,status,transaction_date,created_at").limit(3000),
    db.from("products").select("id,name,stock_qty,reorder_level,is_active").eq("is_active", true).limit(1000),
    db.from("customers").select("id,name,balance,credit_limit,is_active,created_at").eq("is_active", true).limit(2000),
    db.from("settlements").select("id,amount,status,settlement_date,from_pool,to_pool,reference").order("created_at", { ascending: false }).limit(1000),
    db.from("audit_findings").select("id,severity,status,resolution_status,description,created_at").in("severity", ["HIGH", "CRITICAL"]).order("created_at", { ascending: false }).limit(200),
    db.from("cash_entries").select("id,method,direction,amount,entry_date,created_at").limit(3000),
  ]);

  const invoices = invoicesRes.data || [];
  const transactions = transactionsRes.data || [];
  const products = productsRes.data || [];
  const customers = customersRes.data || [];
  const settlements = settlementsRes.data || [];
  const auditFindings = auditFindingsRes.data || [];
  const cashEntries = cashEntriesRes.data || [];

  const events: MonitorEvent[] = [];

  const activeInvoice = (row: any) => String(row.status || "").toLowerCase() !== "cancelled";
  const currentRevenue = invoices.filter((r) => activeInvoice(r) && inRange(r.invoice_date || r.created_at, current7, today)).reduce((s, r) => s + n(r.total), 0);
  const previousRevenue = invoices.filter((r) => activeInvoice(r) && inRange(r.invoice_date || r.created_at, previous7, current7)).reduce((s, r) => s + n(r.total), 0);
  if (previousRevenue > 0 && currentRevenue < previousRevenue * 0.65) {
    const dropPct = Math.round((1 - currentRevenue / previousRevenue) * 100);
    events.push({
      severity: dropPct >= 50 ? "critical" : "attention",
      source: "business",
      title: `Revenue dropped ${dropPct}% versus the previous 7 days`,
      details: { current7Revenue: currentRevenue, previous7Revenue: previousRevenue, dropPercent: dropPct },
    });
  }

  const recentTxns = transactions.filter((r) => inRange(r.transaction_date || r.created_at, current7, today));
  const failedTxns = recentTxns.filter((r) => ["failed", "reversed"].includes(String(r.status || "").toLowerCase()));
  const failedRate = recentTxns.length ? failedTxns.length / recentTxns.length : 0;
  if (failedTxns.length >= 5 && failedRate >= 0.1) {
    events.push({
      severity: failedRate >= 0.25 ? "critical" : "attention",
      source: "transaction",
      title: "Transaction failure/reversal rate is elevated",
      details: { recentTransactions: recentTxns.length, failedOrReversed: failedTxns.length, failureRatePercent: Math.round(failedRate * 100) },
    });
  }

  const lowStock = products.filter((p) => n(p.stock_qty) <= n(p.reorder_level) && n(p.reorder_level) > 0);
  if (lowStock.length > 0) {
    events.push({
      severity: lowStock.length >= 5 ? "attention" : "info",
      source: "inventory",
      title: `${lowStock.length} active product(s) are at or below reorder level`,
      details: { count: lowStock.length, products: lowStock.slice(0, 15).map((p) => ({ name: p.name, stock: n(p.stock_qty), reorderLevel: n(p.reorder_level) })) },
    });
  }

  const overdueCustomers = customers.filter((c) => n(c.balance) > 0);
  const overdueTotal = overdueCustomers.reduce((s, c) => s + n(c.balance), 0);
  if (overdueCustomers.length > 0 && overdueTotal > 0) {
    events.push({
      severity: overdueTotal >= 25000 ? "attention" : "info",
      source: "customer",
      title: `${overdueCustomers.length} customer account(s) currently carry a positive balance`,
      details: { customerCount: overdueCustomers.length, totalOutstanding: overdueTotal, topBalances: overdueCustomers.sort((a, b) => n(b.balance) - n(a.balance)).slice(0, 10).map((c) => ({ name: c.name, balance: n(c.balance) })) },
    });
  }

  const failedSettlements = settlements.filter((s) => ["failed", "reversed", "cancelled"].includes(String(s.status || "").toLowerCase()));
  if (failedSettlements.length > 0) {
    events.push({
      severity: "attention",
      source: "transaction",
      title: `${failedSettlements.length} settlement(s) need review`,
      details: { count: failedSettlements.length, recent: failedSettlements.slice(0, 10).map((s) => ({ amount: n(s.amount), status: s.status, from: s.from_pool, to: s.to_pool, reference: s.reference })) },
    });
  }

  const openHighFindings = auditFindings.filter((f) => String(f.resolution_status || "OPEN") !== "RESOLVED" && String(f.status || "").toUpperCase() !== "PASS");
  const criticalFindings = openHighFindings.filter((f) => String(f.severity || "").toUpperCase() === "CRITICAL");
  if (criticalFindings.length > 0) {
    events.push({
      severity: "critical",
      source: "security",
      title: `${criticalFindings.length} critical audit finding(s) remain open`,
      details: { count: criticalFindings.length, findings: criticalFindings.slice(0, 8).map((f) => ({ description: f.description, status: f.status, resolutionStatus: f.resolution_status })) },
    });
  } else if (openHighFindings.length > 0) {
    events.push({
      severity: "attention",
      source: "security",
      title: `${openHighFindings.length} high-severity audit finding(s) remain open`,
      details: { count: openHighFindings.length, findings: openHighFindings.slice(0, 8).map((f) => ({ severity: f.severity, description: f.description, status: f.status })) },
    });
  }

  const recentCash = cashEntries.filter((r) => inRange(r.entry_date || r.created_at, current7, today));
  const cashIn = recentCash.filter((r) => r.direction === "in").reduce((s, r) => s + n(r.amount), 0);
  const cashOut = recentCash.filter((r) => r.direction === "out").reduce((s, r) => s + n(r.amount), 0);
  if (cashOut > cashIn * 1.5 && cashOut - cashIn >= 5000) {
    events.push({
      severity: "attention",
      source: "business",
      title: "Cash outflow materially exceeds cash inflow this week",
      details: { cashIn, cashOut, netCashMovement: cashIn - cashOut },
    });
  }

  const inserted: any[] = [];
  for (const event of events) {
    const { data: existing } = await db
      .from("ai_monitor_events")
      .select("id")
      .eq("source", event.source)
      .eq("title", event.title)
      .in("status", ["open", "acknowledged"])
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { data } = await db.from("ai_monitor_events").insert({
        severity: event.severity,
        source: event.source,
        title: event.title,
        details: event.details,
        status: "open",
      }).select("id,severity,source,title,details,status,detected_at").single();
      if (data) inserted.push(data);
    }
  }

  let aiRecommendations: string[] = [];
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    const summary = {
      current7Revenue,
      previous7Revenue,
      recentTransactions: recentTxns.length,
      failedOrReversed: failedTxns.length,
      lowStockCount: lowStock.length,
      outstandingCustomers: overdueCustomers.length,
      outstandingTotal: overdueTotal,
      failedSettlements: failedSettlements.length,
      openHighAuditFindings: openHighFindings.length,
      criticalAuditFindings: criticalFindings.length,
      cashIn,
      cashOut,
    };
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
          reasoning: { effort: "low" },
          instructions: "You are a cautious small-business operations advisor. Analyze only the supplied aggregated metrics. Return exactly 3 concise, practical business opportunities or actions, one per line, with no markdown bullets. Never invent facts, prices, customers, or causes. Never recommend unauthorized financial transactions.",
          input: JSON.stringify(summary),
        }),
      });
      const data = await response.json().catch(() => ({}));
      const text = typeof data?.output_text === "string" ? data.output_text : "";
      aiRecommendations = text.split(/\n+/).map((line: string) => line.replace(/^[-*•]\s*/, "").trim()).filter(Boolean).slice(0, 3);
    } catch {
      aiRecommendations = [];
    }
  }

  if (aiRecommendations.length) {
    const insightTitle = "AI business growth recommendations are available";
    const { data: existingInsight } = await db
      .from("ai_monitor_events")
      .select("id")
      .eq("source", "business")
      .eq("title", insightTitle)
      .in("status", ["open", "acknowledged"])
      .limit(1)
      .maybeSingle();
    if (!existingInsight) {
      const { data } = await db.from("ai_monitor_events").insert({
        severity: "info",
        source: "business",
        title: insightTitle,
        details: { recommendations: aiRecommendations },
        status: "open",
      }).select("id,severity,source,title,details,status,detected_at").single();
      if (data) inserted.push(data);
    }
  }

  const { data: openEvents } = await db
    .from("ai_monitor_events")
    .select("id,severity,source,title,details,status,detected_at")
    .in("status", ["open", "acknowledged"])
    .order("detected_at", { ascending: false })
    .limit(100);

  return {
    scannedAt: new Date().toISOString(),
    created: inserted,
    events: openEvents || [],
    metrics: {
      current7Revenue,
      previous7Revenue,
      recentTransactions: recentTxns.length,
      failedOrReversed: failedTxns.length,
      lowStockCount: lowStock.length,
      outstandingTotal: overdueTotal,
      openHighAuditFindings: openHighFindings.length,
      criticalAuditFindings: criticalFindings.length,
      cashIn,
      cashOut,
    },
  };
}
