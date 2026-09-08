import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { CAFE_AI_SYSTEM_INSTRUCTIONS, DEFAULT_AGENT_PERMISSIONS } from "@/lib/ai/agent-policy";
import { runIntelligentAgent, type AgentHistoryItem } from "@/lib/ai/agent-runtime";

export const dynamic = "force-dynamic";

const LIVE_REPORT_PATTERN = /(?:profit(?:\s*(?:and|&|\/)\s*loss)?|p&l|p\/l|net\s+profit|revenue|expenses?|business\s+report|monthly\s+report|this\s+month|current\s+month|net\s+margin|gross\s+margin)/i;
const STOCK_ALERT_PATTERN = /(?:low\s+stock|out\s+of\s+stock|reorder|inventory\s+alert|stock\s+level)/i;
const DUES_PATTERN = /(?:customer\s+due|khata\s+due|who\s+owes|unpaid\s+balance|receivables)/i;
const MAX_MESSAGE_LENGTH = 16_000;
const MAX_HISTORY_ITEMS = 10;

function formatInr(value: number) {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getIndiaDateParts() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function getMonthRange() {
  const { year, month } = getIndiaDateParts();
  const start = `${year}-${month}-01`;
  const next = new Date(`${start}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const exclusive = next.toISOString().slice(0, 10);
  const end = new Date(`${exclusive}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return { start, end: end.toISOString().slice(0, 10) };
}

async function buildCurrentMonthPnl(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { start, end } = getMonthRange();
  const { data, error } = await supabase.rpc("get_ai_current_month_pnl", { p_from: start, p_to: end });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("P&L function returned no data");
  const row = data as Record<string, any>;
  return {
    start,
    end,
    sales: Number(row.revenue || 0),
    returns: Number(row.returns || 0),
    quickCost: Number(row.quick_sale_cost || 0),
    serviceIncome: Number(row.commission || 0),
    expenses: Number(row.expenses || 0),
    grossProfit: Number(row.gross_profit || 0),
    net: Number(row.net_profit || 0),
    margin: Number(row.net_margin_percent ?? 0),
    invoices: Number(row.invoices_count || 0),
    unverifiedCostCount: Number(row.unverified_cost_count || 0),
    warning: row.warning_message || null,
  };
}

function normalizeHistory(value: unknown): AgentHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is AgentHistoryItem => !!item && typeof item === "object" && ((item as any).role === "user" || (item as any).role === "assistant") && typeof (item as any).content === "string")
    .map((item) => ({ role: item.role, content: item.content.trim().slice(0, 4000) }))
    .filter((item) => item.content)
    .slice(-MAX_HISTORY_ITEMS);
}

export async function POST(request: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 64_000) return NextResponse.json({ error: "Request is too large" }, { status: 413 });

    const body = await request.json().catch(() => null);
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });
    if (message.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ error: "Message is too long" }, { status: 413 });

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (STOCK_ALERT_PATTERN.test(message)) {
      const { data: products, error } = await supabase.from("products").select("id,name,stock_qty,reorder_level,unit").eq("is_active", true);
      if (!error) {
        const lowStock = (products || []).filter((p: any) => Number(p.stock_qty || 0) <= Number(p.reorder_level || 0));
        if (!lowStock.length) return NextResponse.json({ message: "✓ All active catalog products are above their reorder thresholds.", mode: "inventory-report", canExecute: false, approvalRequired: false });
        const list = lowStock.slice(0, 25).map((p: any) => `- ${p.name}: ${p.stock_qty} ${p.unit || "units"} (reorder at ${p.reorder_level})`).join("\n");
        return NextResponse.json({ message: `⚠️ ${lowStock.length} item(s) need attention:\n\n${list}`, mode: "inventory-report", canExecute: false, approvalRequired: false });
      }
    }

    if (DUES_PATTERN.test(message)) {
      const { data: customers, error } = await supabase.from("customers").select("id,name,phone,balance").gt("balance", 0).order("balance", { ascending: false }).limit(50);
      if (!error) {
        if (!customers?.length) return NextResponse.json({ message: "✓ No customer Khata receivables are currently outstanding.", mode: "dues-report", canExecute: false, approvalRequired: false });
        const total = customers.reduce((sum: number, c: any) => sum + Number(c.balance || 0), 0);
        const list = customers.slice(0, 10).map((c: any) => `- ${c.name} (${c.phone || "No phone"}): ${formatInr(Number(c.balance || 0))}`).join("\n");
        return NextResponse.json({ message: `📋 Customer Khata Dues: ${formatInr(total)} across ${customers.length} account(s) returned.\n\n${list}`, mode: "dues-report", canExecute: false, approvalRequired: false });
      }
    }

    if (LIVE_REPORT_PATTERN.test(message)) {
      if (!hasRole(role, ["admin", "manager"])) return NextResponse.json({ error: "Live financial reports are restricted to Admin and Manager access." }, { status: 403 });
      try {
        const pnl = await buildCurrentMonthPnl(supabase);
        const report = [
          `Current-month Profit & Loss (${pnl.start} to ${pnl.end}, inclusive)`,
          `Recognized POS / Invoice Sales Revenue: ${formatInr(pnl.sales)}`,
          `Sales Returns & Refunds: -${formatInr(pnl.returns)}`,
          `Quick Sale Counter Cost: -${formatInr(pnl.quickCost)}`,
          `Service Fees & Commission Income: ${formatInr(pnl.serviceIncome)}`,
          `Gross Operating Profit: ${formatInr(pnl.grossProfit)}`,
          `Operating Expenses: -${formatInr(pnl.expenses)}`,
          `NET OPERATING PROFIT: ${formatInr(pnl.net)}`,
          `Net Margin: ${pnl.margin.toFixed(2)}%`,
          pnl.warning ? `Warning: ${pnl.warning}` : "",
          `Invoices counted: ${pnl.invoices}.`,
          pnl.unverifiedCostCount > 0 ? `Unverified direct-cost records: ${pnl.unverifiedCostCount}.` : "COGS direct-cost snapshots are verified by the accounting function.",
        ].filter(Boolean).join("\n");
        return NextResponse.json({ message: report, mode: "live-business-report", canExecute: false, approvalRequired: false, data: pnl });
      } catch (error) {
        console.error("AI agent live financial report failed", error);
        return NextResponse.json({ error: "Live financial data could not be read" }, { status: 502 });
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Cafe AI Agent is not connected yet. Add GEMINI_API_KEY to the server environment." }, { status: 503 });

    const { data: memories } = await supabase.from("ai_memories").select("category,memory_key,memory_value,confidence").eq("user_id", auth.user.id).eq("active", true).order("updated_at", { ascending: false }).limit(100);
    const memoryContext = (memories || []).map((m: any) => `- [${m.category}] ${m.memory_key}: ${JSON.stringify(m.memory_value)} (confidence ${m.confidence})`).join("\n") || "No owner memory has been stored yet.";
    const systemInstruction = `${CAFE_AI_SYSTEM_INSTRUCTIONS}\n\nOwner memory:\n${memoryContext}\n\nCurrent application permission profile:\n${JSON.stringify(DEFAULT_AGENT_PERMISSIONS)}\n\nOperational rule: use live read-only tools whenever the question concerns current Cafe-EPR data. Do not claim a write, deletion, payment, transaction, invoice, or configuration change unless a dedicated approved execution endpoint has actually confirmed it. For consequential actions, prepare the action and request explicit owner approval rather than pretending it was executed. If the owner explicitly teaches a durable workflow, explain that it can be saved through the Learning Control Center.`;

    const result = await runIntelligentAgent({ apiKey, message, history: normalizeHistory(body?.history), systemInstruction, supabase, userId: auth.user.id });
    return NextResponse.json({ message: result.message, mode: "agentic", canExecute: false, approvalRequired: false, toolsUsed: result.usedTools, rounds: result.rounds, finishReason: result.finishReason });
  } catch (error) {
    console.error("Cafe AI agent failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cafe AI Agent failed" }, { status: 502 });
  }
}
