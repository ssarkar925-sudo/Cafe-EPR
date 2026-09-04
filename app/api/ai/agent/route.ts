import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { CAFE_AI_SYSTEM_INSTRUCTIONS, DEFAULT_AGENT_PERMISSIONS } from "@/lib/ai/agent-policy";

export const dynamic = "force-dynamic";

const LIVE_REPORT_PATTERN = /(?:profit(?:\s*(?:and|&|\/)\s*loss)?|p&l|p\/l|net\s+profit|revenue|expenses?|business\s+report|monthly\s+report|this\s+month|current\s+month|cost)/i;
const STOCK_ALERT_PATTERN = /(?:low\s+stock|out\s+of\s+stock|reorder|inventory\s+alert|stock\s+level)/i;
const DUES_PATTERN = /(?:customer\s+due|khata\s+due|who\s+owes|unpaid\s+balance|receivables)/i;
const WA_PATTERN = /(?:whatsapp\s+(?:status|gateway|outbox)|is\s+whatsapp\s+connected)/i;

const MAX_MESSAGE_LENGTH = 16_000;

function getIndiaDateParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: values.year, month: values.month };
}

function getMonthRange() {
  const { year, month } = getIndiaDateParts();
  const start = `${year}-${month}-01`;
  const nextMonthDate = new Date(`${start}T00:00:00Z`);
  nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);
  const endExclusive = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const endInclusiveDate = new Date(`${endExclusive}T00:00:00Z`);
  endInclusiveDate.setUTCDate(endInclusiveDate.getUTCDate() - 1);
  const endInclusive = `${endInclusiveDate.getUTCFullYear()}-${String(endInclusiveDate.getUTCMonth() + 1).padStart(2, "0")}-${String(endInclusiveDate.getUTCDate()).padStart(2, "0")}`;
  return { start, endExclusive, endInclusive, label: `${year}-${month}` };
}

async function buildCurrentMonthPnl(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { start, endExclusive, endInclusive, label } = getMonthRange();

  const { data, error } = await supabase.rpc("get_ai_current_month_pnl", {
    p_from: start,
    p_to: endInclusive,
  });

  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("P&L function returned no data");

  const row = data as Record<string, any>;
  const sales = Number(row.revenue || 0);
  const returnsTotal = Number(row.returns || 0);
  const quickRevenue = 0;
  const quickCost = Number(row.quick_sale_cost || 0);
  const serviceIncome = Number(row.commission || 0);
  const expensesTotal = Number(row.expenses || 0);
  const grossSales = Math.max(0, sales + quickRevenue);
  const grossProfit = Number(row.gross_profit || 0);
  const net = Number(row.net_profit || 0);
  const margin = Number(row.net_margin_percent ?? 0);

  return {
    month: label,
    start,
    endExclusive,
    endInclusive,
    sales,
    returnsTotal,
    quickRevenue,
    quickCost,
    serviceIncome,
    expensesTotal,
    grossSales,
    grossProfit,
    net,
    margin,
    counts: {
      invoices: Number(row.invoices_count || 0),
      returns: 0,
      expenses: 0,
      quickSales: 0,
      serviceTransactions: 0,
    },
    warning: row.warning_message || null,
    unverifiedCostCount: Number(row.unverified_cost_count || 0),
  };
}

function formatInr(value: number) {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 32_768) return NextResponse.json({ error: "Request is too large" }, { status: 413 });

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });
  if (message.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ error: "Message is too long" }, { status: 413 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Live Stock Alert Intent
  if (STOCK_ALERT_PATTERN.test(message)) {
    try {
      const { data: products } = await supabase
        .from("products")
        .select("id,name,stock_qty,reorder_level,unit")
        .eq("is_active", true);

      const lowStock = (products || []).filter((p) => Number(p.stock_qty || 0) <= Number(p.reorder_level || 0));
      if (lowStock.length === 0) {
        return NextResponse.json({
          message: "✓ All catalog products are currently healthy and well above reorder thresholds.",
          mode: "inventory-report",
          canExecute: false,
          approvalRequired: false,
        });
      }

      const list = lowStock
        .map((p) => `- ${p.name}: Stock ${p.stock_qty} ${p.unit || "units"} (Reorder Level: ${p.reorder_level})`)
        .join("\n");

      return NextResponse.json({
        message: `⚠️ Inventory Alert: ${lowStock.length} item(s) need reordering:\n\n${list}`,
        mode: "inventory-report",
        canExecute: false,
        approvalRequired: false,
      });
    } catch (err) {}
  }

  // 2. Customer Dues / Khata Intent
  if (DUES_PATTERN.test(message)) {
    try {
      const { data: customers } = await supabase
        .from("customers")
        .select("id,name,phone,balance")
        .gt("balance", 0)
        .order("balance", { ascending: false });

      if (!customers || customers.length === 0) {
        return NextResponse.json({
          message: "✓ All customer accounts are fully settled. No Khata receivables pending.",
          mode: "dues-report",
          canExecute: false,
          approvalRequired: false,
        });
      }

      const totalDues = customers.reduce((sum, c) => sum + Number(c.balance || 0), 0);
      const list = customers
        .slice(0, 10)
        .map((c) => `- ${c.name} (${c.phone || "No phone"}): ${formatInr(Number(c.balance))}`)
        .join("\n");

      return NextResponse.json({
        message: `📋 Customer Khata Dues (${customers.length} account(s) owing ${formatInr(totalDues)} total):\n\n${list}\n\nUse the Customers module to send 1-click WhatsApp payment reminders with your UPI QR code.`,
        mode: "dues-report",
        canExecute: false,
        approvalRequired: false,
      });
    } catch (err) {}
  }

  // 3. Live P&L Report Intent
  if (LIVE_REPORT_PATTERN.test(message)) {
    if (!hasRole(role, ["admin", "manager"])) {
      return NextResponse.json({ error: "Live financial reports are restricted to Admin and Manager access." }, { status: 403 });
    }

    try {
      const pnl = await buildCurrentMonthPnl(supabase);
      const report = [
        `Current-month Profit & Loss (${pnl.start} to ${pnl.endInclusive}, inclusive)`,
        "",
        `Recognized POS / Invoice Sales Revenue: ${formatInr(pnl.sales)}`,
        `Sales Returns & Refunds: -${formatInr(pnl.returnsTotal)}`,
        `Quick Sale Counter Cost: -${formatInr(pnl.quickCost)}`,
        `Service Fees & Commission Income: ${formatInr(pnl.serviceIncome)}`,
        `Gross Operating Profit: ${formatInr(pnl.grossProfit)}`,
        `Operating Expenses: -${formatInr(pnl.expensesTotal)}`,
        `NET OPERATING PROFIT: ${formatInr(pnl.net)}`,
        `Net Margin: ${pnl.margin.toFixed(2)}%`,
        pnl.warning ? `Warning: ${pnl.warning}` : "",
        "",
        `Invoices counted: ${pnl.counts.invoices}.`,
        pnl.unverifiedCostCount > 0 ? `Unverified direct-cost records: ${pnl.unverifiedCostCount}.` : "COGS direct-cost snapshots are verified by the accounting function.",
        "These figures are read from the canonical Café-EPR P&L database function for the current month; no values are guessed.",
      ].filter(Boolean).join("\n");

      return NextResponse.json({ message: report, mode: "live-business-report", canExecute: false, approvalRequired: false, data: pnl });
    } catch (error) {
      console.error("AI agent live financial report failed", error);
      return NextResponse.json({ error: "Live financial data could not be read" }, { status: 502 });
    }
  }

  // Fallthrough to Gemini API for reasoning and general Q&A
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Cafe AI Agent is not connected yet. Add GEMINI_API_KEY to the server environment." }, { status: 503 });

  const { data: memories } = await supabase.from("ai_memories").select("category,memory_key,memory_value,confidence").eq("user_id", auth.user.id).eq("active", true).order("updated_at", { ascending: false }).limit(100);
  const memoryContext = (memories || []).map((m) => `- [${m.category}] ${m.memory_key}: ${JSON.stringify(m.memory_value)} (confidence ${m.confidence})`).join("\n") || "No owner memory has been stored yet.";
  
  const requestedModel = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const models = Array.from(new Set([requestedModel, "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"]));
  const systemInstruction = `${CAFE_AI_SYSTEM_INSTRUCTIONS}\n\nOwner memory (treat explicit instructions as durable preferences/workflows, but never as authorization to bypass permission gates):\n${memoryContext}\n\nCurrent application permission profile:\n${JSON.stringify(DEFAULT_AGENT_PERMISSIONS)}\n\nNo write tool is exposed by this endpoint. You can answer, reason, ask questions, and propose safe actions. Never claim that a database write occurred. If the owner teaches a new durable preference or workflow, identify it as something that can be saved through the memory API.`;

  let data: any = null;
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: message }] }],
      }),
    });
    data = await response.json().catch(() => ({}));
    if (response.ok) break;
  }

  if (!data?.candidates?.[0]?.content?.parts) {
    console.error("AI agent Gemini request failed");
    return NextResponse.json({ error: "Cafe AI Agent could not complete the request" }, { status: 502 });
  }
  const outputText = data.candidates[0].content.parts.map((part: any) => part?.text).filter(Boolean).join("\n");
  return NextResponse.json({ message: outputText || "I understood the request, but I could not produce a response.", mode: "owner-controlled", canExecute: false, approvalRequired: true });
}
