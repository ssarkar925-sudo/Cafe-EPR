import type { SupabaseClient } from "@supabase/supabase-js";
import { checkWhatsAppHealth } from "@/lib/whatsapp-health";
import { diagnoseApplication, type SelfHealingFinding } from "@/lib/ai/self-healing";

export type CommandCenterCheck = {
  module: string;
  status: "healthy" | "attention" | "unknown";
  summary: string;
  evidence?: Record<string, unknown>;
};

export type CommandCenterAction = {
  action: "repair_whatsapp" | "investigate";
  title: string;
  reason: string;
  requiresApproval: boolean;
  payload?: Record<string, unknown>;
};

export type CommandCenterResult = {
  task: string;
  plan: string[];
  checks: CommandCenterCheck[];
  anomalies: SelfHealingFinding[];
  actions: CommandCenterAction[];
  approvalRequired: boolean;
  completedAt: string;
};

function n(value: unknown) {
  const valueNumber = Number(value);
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function wantsAllModules(task: string) {
  return /\b(all|everything|full|complete|overall|system|health|audit|anomal(?:y|ies)|check|scan|command\s*center)\b/i.test(task);
}

function wantsBusiness(task: string) {
  return wantsAllModules(task) || /\b(profit|loss|p&l|revenue|expense|business|sales|report)\b/i.test(task);
}

function wantsInventory(task: string) {
  return wantsAllModules(task) || /\b(stock|inventory|reorder|catalog|product)\b/i.test(task);
}

function wantsCustomers(task: string) {
  return wantsAllModules(task) || /\b(customer|customers|due|dues|receivable|khata|owe)\b/i.test(task);
}

function wantsTransactions(task: string) {
  return wantsAllModules(task) || /\b(transaction|transactions|aeps|dmt|upi|recharge|money|settlement)\b/i.test(task);
}

function wantsWhatsApp(task: string) {
  return wantsAllModules(task) || /\b(whatsapp|gateway|message|messaging)\b/i.test(task);
}

function wantsAudit(task: string) {
  return wantsAllModules(task) || /\b(audit|integrity|anomal(?:y|ies)|error|problem|bug|issue|broken)\b/i.test(task);
}

export async function runCommandCenter({
  supabase,
  task,
  prepareRepair = false,
}: {
  supabase: SupabaseClient<any, any, any>;
  task: string;
  prepareRepair?: boolean;
}): Promise<CommandCenterResult> {
  const normalizedTask = task.trim().slice(0, 4000);
  const plan: string[] = [
    "Interpret the requested outcome and select the relevant Cafe-EPR modules.",
    "Run independent read-only checks in parallel where possible.",
    "Compare live results against integrity/health rules and separate facts from hypotheses.",
    "Prepare only supported actions; require owner approval before any consequential change.",
    "After an approved action, verify the same condition again before reporting success.",
  ];

  const checks: CommandCenterCheck[] = [];
  const jobs: Promise<void>[] = [];

  if (wantsBusiness(normalizedTask)) jobs.push((async () => {
    const { data, error } = await supabase.rpc("get_ai_current_month_pnl", (() => {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
      const year = parts.find((p) => p.type === "year")?.value || "1970";
      const month = parts.find((p) => p.type === "month")?.value || "01";
      const start = `${year}-${month}-01`;
      const next = new Date(`${start}T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      const end = new Date(next.getTime() - 86400000).toISOString().slice(0, 10);
      return { p_from: start, p_to: end };
    })());
    if (error) checks.push({ module: "Finance", status: "unknown", summary: `P&L check failed: ${error.message}` });
    else checks.push({ module: "Finance", status: n((data as any)?.net_profit) < 0 ? "attention" : "healthy", summary: `Current-month net operating profit is ₹${n((data as any)?.net_profit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`, evidence: { revenue: n((data as any)?.revenue), expenses: n((data as any)?.expenses), netProfit: n((data as any)?.net_profit) } });
  })());

  if (wantsInventory(normalizedTask)) jobs.push((async () => {
    const { data, error } = await supabase.from("products").select("id,name,stock_qty,reorder_level,sale_price").eq("is_active", true).limit(500);
    if (error) checks.push({ module: "Inventory", status: "unknown", summary: `Inventory check failed: ${error.message}` });
    else {
      const rows = data ?? [];
      const low = rows.filter((p: any) => n(p.stock_qty) <= n(p.reorder_level));
      const negative = rows.filter((p: any) => n(p.stock_qty) < 0);
      checks.push({ module: "Inventory", status: negative.length || low.length ? "attention" : "healthy", summary: negative.length ? `${negative.length} product(s) have negative stock; ${low.length} are at/below reorder level.` : low.length ? `${low.length} product(s) are at/below reorder level.` : "Active product stock is above reorder thresholds.", evidence: { activeProducts: rows.length, lowStock: low.length, negativeStock: negative.length } });
    }
  })());

  if (wantsCustomers(normalizedTask)) jobs.push((async () => {
    const { data, error } = await supabase.from("customers").select("id,balance").gt("balance", 0).limit(1000);
    if (error) checks.push({ module: "Receivables", status: "unknown", summary: `Customer dues check failed: ${error.message}` });
    else checks.push({ module: "Receivables", status: (data ?? []).length ? "attention" : "healthy", summary: (data ?? []).length ? `${data!.length} customer account(s) have outstanding balances.` : "No outstanding customer balances found.", evidence: { accounts: (data ?? []).length, total: (data ?? []).reduce((sum: number, row: any) => sum + n(row.balance), 0) } });
  })());

  if (wantsTransactions(normalizedTask)) jobs.push((async () => {
    const { data, error } = await supabase.from("transactions").select("status,created_at,total_amount").order("created_at", { ascending: false }).limit(50);
    if (error) checks.push({ module: "Transactions", status: "unknown", summary: `Transaction check failed: ${error.message}` });
    else {
      const rows = data ?? [];
      const pending = rows.filter((t: any) => /pending|processing/i.test(String(t.status || "")));
      checks.push({ module: "Transactions", status: pending.length ? "attention" : "healthy", summary: pending.length ? `${pending.length} recent transaction(s) are still pending/processing.` : "No recent pending/processing transaction anomaly found.", evidence: { inspected: rows.length, pending: pending.length } });
    }
  })());

  if (wantsWhatsApp(normalizedTask)) jobs.push((async () => {
    const health = await checkWhatsAppHealth();
    checks.push({ module: "WhatsApp", status: health.connected ? "healthy" : health.status === "unknown" ? "unknown" : "attention", summary: health.connected ? "WhatsApp provider health check is connected." : `WhatsApp is ${health.status}: ${health.error || "no additional provider detail"}.`, evidence: { provider: health.provider, status: health.status, connected: health.connected, code: health.code || null } });
  })());

  if (wantsAudit(normalizedTask)) jobs.push((async () => {
    const { data, error } = await supabase.from("audit_runs").select("id,audit_score,status,total_findings,critical_count,created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) checks.push({ module: "Self-audit", status: "unknown", summary: `Self-audit check failed: ${error.message}` });
    else if (!data) checks.push({ module: "Self-audit", status: "unknown", summary: "No self-audit run is recorded yet." });
    else checks.push({ module: "Self-audit", status: n((data as any).critical_count) > 0 ? "attention" : "healthy", summary: `${n((data as any).critical_count)} critical finding(s), ${n((data as any).total_findings)} total finding(s) in the latest audit.`, evidence: data as any });
  })());

  await Promise.all(jobs);

  const diagnosis = await diagnoseApplication(supabase);
  const actions: CommandCenterAction[] = [];
  const repairable = diagnosis.findings.find((finding) => finding.autoFixable && finding.repairKind === "meta_phone_number_id");
  if (repairable) {
    actions.push({
      action: "repair_whatsapp",
      title: "Repair Meta WhatsApp phone-number binding",
      reason: `${repairable.title}: ${repairable.evidence}`,
      requiresApproval: true,
      payload: { repair_kind: "meta_phone_number_id", finding_id: repairable.id },
    });
  }
  for (const finding of diagnosis.findings.filter((item) => !item.autoFixable)) {
    actions.push({ action: "investigate", title: `Investigate ${finding.title}`, reason: finding.recommendation, requiresApproval: false });
  }

  return {
    task: normalizedTask,
    plan,
    checks,
    anomalies: diagnosis.findings,
    actions,
    approvalRequired: Boolean(prepareRepair && repairable),
    completedAt: new Date().toISOString(),
  };
}
