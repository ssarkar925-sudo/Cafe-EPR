import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { CAFE_AI_SYSTEM_INSTRUCTIONS, DEFAULT_AGENT_PERMISSIONS } from "@/lib/ai/agent-policy";

export const dynamic = "force-dynamic";

const LIVE_REPORT_PATTERN = /(?:profit(?:\s*(?:and|&|\/)\s*loss)?|p&l|p\/l|net\s+profit|revenue|expenses?|business\s+report|monthly\s+report|this\s+month|current\s+month|cost)/i;

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
  return { start, endExclusive, label: `${year}-${month}` };
}

async function buildCurrentMonthPnl(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { start, endExclusive, label } = getMonthRange();
  const [invoicesResult, returnsResult, expensesResult, quickSalesResult, transactionsResult] = await Promise.all([
    supabase.from("invoices").select("invoice_date,total,status").gte("invoice_date", start).lt("invoice_date", endExclusive).neq("status", "cancelled").limit(5000),
    supabase.from("returns").select("return_date,subtotal,status").gte("return_date", start).lt("return_date", endExclusive).eq("status", "completed").limit(5000),
    supabase.from("expenses").select("expense_date,amount,status").gte("expense_date", start).lt("expense_date", endExclusive).eq("status", "active").limit(5000),
    supabase.from("quick_sales").select("sale_date,amount,cost,status").gte("sale_date", start).lt("sale_date", endExclusive).eq("status", "active").limit(5000),
    supabase.from("transactions").select("transaction_date,service_type,service_fee,portal_commission,status").gte("transaction_date", start).lt("transaction_date", endExclusive).eq("status", "success").limit(5000),
  ]);

  const firstError = [invoicesResult, returnsResult, expensesResult, quickSalesResult, transactionsResult].find((result) => result.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const invoices = invoicesResult.data ?? [];
  const returns = returnsResult.data ?? [];
  const expenses = expensesResult.data ?? [];
  const quickSales = quickSalesResult.data ?? [];
  const transactions = transactionsResult.data ?? [];

  const sales = invoices.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const returnsTotal = returns.reduce((sum, row) => sum + Number(row.subtotal || 0), 0);
  const quickRevenue = quickSales.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const quickCost = quickSales.reduce((sum, row) => sum + Number(row.cost || 0), 0);
  const serviceIncome = transactions.reduce((sum, row) => {
    const fee = Number(row.service_fee || 0);
    const commission = Number(row.portal_commission || 0);
    return sum + (row.service_type === "dmt" ? fee - commission : fee + commission);
  }, 0);
  const expensesTotal = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const grossSales = sales + quickRevenue;
  const grossProfit = sales - returnsTotal + quickRevenue - quickCost + serviceIncome;
  const net = grossProfit - expensesTotal;
  const margin = grossSales > 0 ? (net / grossSales) * 100 : 0;

  return {
    month: label,
    start,
    endExclusive,
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
      invoices: invoices.length,
      returns: returns.length,
      expenses: expenses.length,
      quickSales: quickSales.length,
      serviceTransactions: transactions.length,
    },
  };
}

function formatInr(value: number) {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (LIVE_REPORT_PATTERN.test(message)) {
    if (!hasRole(role, ["admin", "manager"])) {
      return NextResponse.json({ error: "Live financial reports are restricted to Admin and Manager access." }, { status: 403 });
    }

    try {
      const pnl = await buildCurrentMonthPnl(supabase);
      const report = [
        `Current-month Profit & Loss (${pnl.start} to ${pnl.endExclusive}, end date exclusive)`,
        "",
        `POS / Invoice Sales Revenue: ${formatInr(pnl.sales)}`,
        `POS Quick Sales Revenue: ${formatInr(pnl.quickRevenue)}`,
        `Less: Sales Returns & Refunds: -${formatInr(pnl.returnsTotal)}`,
        `Less: POS Inventory COGS: -${formatInr(pnl.quickCost)}`,
        `Service Fees & Commission Income: ${formatInr(pnl.serviceIncome)}`,
        `Gross Operating Profit: ${formatInr(pnl.grossProfit)}`,
        `Less: Operating Expenses: -${formatInr(pnl.expensesTotal)}`,
        `NET OPERATING PROFIT: ${formatInr(pnl.net)}`,
        `Net Margin: ${pnl.margin.toFixed(2)}%`,
        "",
        `Records included: ${pnl.counts.invoices} invoices, ${pnl.counts.quickSales} quick sales, ${pnl.counts.returns} returns, ${pnl.counts.expenses} expenses, ${pnl.counts.serviceTransactions} service transactions.`,
        "These figures are read directly from the current Café-EPR database for the current month; no values are guessed.",
      ].join("\n");

      return NextResponse.json({ message: report, mode: "live-business-report", canExecute: false, approvalRequired: false, data: pnl });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Live financial data could not be read";
      return NextResponse.json({ error: `Live financial data could not be read: ${messageText}` }, { status: 502 });
    }
  }

  // Cafe AI Agent uses Gemini independently from the existing Chat AI.
  // Do not use or modify the Chat AI/OpenAI configuration here.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Cafe AI Agent is not connected yet. Add GEMINI_API_KEY to the server environment." }, { status: 503 });

  const { data: memories } = await supabase.from("ai_memories").select("category,memory_key,memory_value,confidence").eq("user_id", auth.user.id).eq("active", true).order("updated_at", { ascending: false }).limit(100);
  const memoryContext = (memories || []).map((m) => `- [${m.category}] ${m.memory_key}: ${JSON.stringify(m.memory_value)} (confidence ${m.confidence})`).join("\n") || "No owner memory has been stored yet.";
  const requestedModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const models = Array.from(new Set([requestedModel, "gemini-3.7-flash", "gemini-3.6-flash"]));
  const systemInstruction = `${CAFE_AI_SYSTEM_INSTRUCTIONS}\n\nOwner memory (treat explicit instructions as durable preferences/workflows, but never as authorization to bypass permission gates):\n${memoryContext}\n\nCurrent application permission profile:\n${JSON.stringify(DEFAULT_AGENT_PERMISSIONS)}\n\nNo write tool is exposed by this endpoint. You can answer, reason, ask questions, and propose safe actions. Never claim that a database write occurred. If the owner teaches a new durable preference or workflow, identify it as something that can be saved through the memory API.`;

  let data: any = null;
  let lastError = "Gemini request failed";
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
    lastError = data?.error?.message || lastError;
  }

  if (!data?.candidates?.[0]?.content?.parts) return NextResponse.json({ error: lastError }, { status: 502 });
  const outputText = data.candidates[0].content.parts.map((part: any) => part?.text).filter(Boolean).join("\n");
  return NextResponse.json({ message: outputText || "I understood the request, but I could not produce a response.", mode: "owner-controlled", canExecute: false, approvalRequired: true });
}
