import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { CAFE_AI_SYSTEM_INSTRUCTIONS, DEFAULT_AGENT_PERMISSIONS } from "@/lib/ai/agent-policy";

export const dynamic = "force-dynamic";

function sum(rows: any[], field: string) {
  return rows.reduce((total, row) => total + (Number(row?.[field]) || 0), 0);
}

function buildBusinessSnapshot(input: {
  invoices: any[];
  transactions: any[];
  customers: any[];
  products: any[];
  expenses: any[];
  audit: any;
}) {
  const { invoices, transactions, customers, products, expenses, audit } = input;
  const outstanding = sum(customers, "balance");
  const lowStock = products.filter((p) => Number(p?.stock_quantity) <= Number(p?.min_stock_alert ?? 0));
  const unpaidInvoices = invoices.filter((i) => {
    const status = String(i?.status || "").toLowerCase();
    return !["paid", "cancelled", "canceled"].includes(status) && Number(i?.total_amount || 0) > Number(i?.paid_amount || 0);
  });

  return {
    generated_at: new Date().toISOString(),
    invoices: {
      count: invoices.length,
      gross_total: sum(invoices, "total_amount"),
      collected_total: sum(invoices, "paid_amount"),
      unpaid_count: unpaidInvoices.length,
      unpaid_amount: unpaidInvoices.reduce((n, i) => n + Math.max(0, (Number(i?.total_amount) || 0) - (Number(i?.paid_amount) || 0)), 0),
    },
    service_transactions: {
      count: transactions.length,
      volume: sum(transactions, "total_amount"),
      net_earnings: sum(transactions, "net_earnings"),
      failed_or_noncompleted_count: transactions.filter((t) => !["success", "completed"].includes(String(t?.status || "").toLowerCase())).length,
    },
    customers: {
      count: customers.length,
      total_outstanding_balance: outstanding,
      credit_accounts: customers.filter((c) => Number(c?.balance) > 0).length,
    },
    inventory: {
      product_count: products.length,
      low_stock_count: lowStock.length,
      negative_stock_count: products.filter((p) => Number(p?.stock_quantity) < 0).length,
      low_stock_items: lowStock.slice(0, 20).map((p) => ({ name: p?.name, stock: Number(p?.stock_quantity) || 0, minimum: Number(p?.min_stock_alert) || 0 })),
    },
    expenses: {
      count: expenses.length,
      total: sum(expenses, "amount"),
    },
    application_guardian: audit
      ? { status: audit.status, score: audit.audit_score, findings: audit.total_findings || 0, critical_findings: audit.critical_count || 0 }
      : { status: "NO_AUDIT_DATA" },
  };
}

export async function POST(request: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Cafe AI is not connected yet. Add OPENAI_API_KEY to the server environment." }, { status: 503 });

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [memoryResult, invoicesResult, transactionsResult, customersResult, productsResult, expensesResult, auditResult] = await Promise.all([
      supabase.from("ai_memories").select("category,memory_key,memory_value,confidence").eq("user_id", auth.user.id).eq("active", true).order("updated_at", { ascending: false }).limit(100),
      supabase.from("invoices").select("total_amount,paid_amount,status").limit(1000),
      supabase.from("transactions").select("total_amount,net_earnings,status").limit(1000),
      supabase.from("customers").select("name,balance,credit_limit").limit(1000),
      supabase.from("products").select("name,stock_quantity,min_stock_alert").limit(500),
      supabase.from("expenses").select("amount").limit(500),
      supabase.from("audit_runs").select("status,audit_score,total_findings,critical_count").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const memoryContext = (memoryResult.data || []).map((m) => `- [${m.category}] ${m.memory_key}: ${JSON.stringify(m.memory_value)} (confidence ${m.confidence})`).join("\n") || "No owner memory has been stored yet.";
    const businessSnapshot = buildBusinessSnapshot({
      invoices: invoicesResult.data || [],
      transactions: transactionsResult.data || [],
      customers: customersResult.data || [],
      products: productsResult.data || [],
      expenses: expensesResult.data || [],
      audit: auditResult.data,
    });

    const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        reasoning: { effort: "low" },
        instructions: `${CAFE_AI_SYSTEM_INSTRUCTIONS}\n\nOwner memory (treat explicit instructions as durable preferences/workflows, but never as authorization to bypass permission gates):\n${memoryContext}\n\nVerified live Cafe-EPR business snapshot (use this for current business state; do not invent figures):\n${JSON.stringify(businessSnapshot, null, 2)}\n\nCurrent application permission profile:\n${JSON.stringify(DEFAULT_AGENT_PERMISSIONS)}\n\nYou are the operational Cafe-EPR AI agent. Use the live snapshot to answer business questions, identify risks and opportunities, and make practical recommendations. Clearly label estimates or hypotheses. The snapshot is a bounded sample, not necessarily the complete ledger. Never claim a write, payment, transaction, invoice, deletion, or configuration change occurred unless a dedicated execution tool actually confirms it. This endpoint exposes no write tool. Consequential actions remain approval-gated.`,
        input: message,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ error: data?.error?.message || "OpenAI request failed" }, { status: 502 });
    const outputText = typeof data?.output_text === "string"
      ? data.output_text
      : Array.isArray(data?.output)
        ? data.output.flatMap((item: any) => item?.content || []).map((part: any) => part?.text).filter(Boolean).join("\n")
        : "";

    return NextResponse.json({
      message: outputText || "I understood the request, but I could not produce a response.",
      mode: "owner-controlled",
      canExecute: false,
      approvalRequired: true,
      liveContextIncluded: true,
      contextGeneratedAt: businessSnapshot.generated_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Cafe AI request failed" }, { status: 500 });
  }
}
