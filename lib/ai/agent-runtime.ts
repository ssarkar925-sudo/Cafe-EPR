import type { SupabaseClient } from "@supabase/supabase-js";
import { checkWhatsAppHealth } from "@/lib/whatsapp-health";
import { calculateGstInvoice } from "@/lib/gst";

const MAX_TOOL_ROUNDS = 4;
const MAX_HISTORY = 10;

export type AgentHistoryItem = { role: "user" | "assistant"; content: string };
type ToolContext = { supabase: SupabaseClient<any, any, any>; userId: string };
type ToolCall = { name: string; args: Record<string, unknown>; id?: string };
type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
};

const TOOL_DECLARATIONS = [
  {
    name: "get_business_snapshot",
    description: "Read the current Cafe-EPR business snapshot: current-month P&L, customer receivables, low stock, and latest self-audit status. Use this before making claims about live business state.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "search_catalog",
    description: "Search active products and services by name. Use this when the owner asks about an item, price, stock, GST, HSN/SAC, or what can be sold.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Product or service name to search for" } },
      required: ["query"],
    },
  },
  {
    name: "search_customer",
    description: "Search active customers by name or phone and return current balance and basic account details. Do not invent a customer match.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Customer name or phone" } },
      required: ["query"],
    },
  },
  {
    name: "get_customer_ledger",
    description: "Retrieve comprehensive customer Khata details, outstanding balance, phone number, and recent transactions for collection or credit management.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Customer name, phone, or ID" } },
      required: ["query"],
    },
  },
  {
    name: "get_recent_transactions",
    description: "Read recent completed or pending Cafe-EPR service transactions. Useful for transaction status, recent activity, and operational questions.",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", description: "Number of recent transactions, maximum 25" } },
    },
  },
  {
    name: "get_audit_status",
    description: "Read the latest Cafe-EPR self-audit run and its findings. Use for integrity, discrepancy, anomaly, or audit questions.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_whatsapp_status",
    description: "Perform a live WhatsApp provider health check. Use for WhatsApp connection, gateway, error, disconnect, or reconnect questions.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_learning_workflows",
    description: "Read the owner's active or recently drafted learned AI workflows so the agent can follow known procedures without guessing.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "save_memory",
    description: "Store a permanent operational rule, customer habit, pricing detail, or shop instruction into AI memory so the agent always remembers it in future interactions. Use when the user teaches a rule, expresses a preference, or asks to remember something.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", description: "Category: 'instruction', 'preference', 'pricing', 'customer_habit', or 'fact'" },
        memory_key: { type: "string", description: "Short descriptive identifier, e.g. 'xerox_page_price' or 'rahul_regular_order'" },
        memory_value: { type: "string", description: "The full fact or instruction to remember" },
      },
      required: ["category", "memory_key", "memory_value"],
    },
  },
  {
    name: "forget_memory",
    description: "Deactivate or remove a learned memory key that is no longer valid or when the user asks to forget something.",
    parameters: {
      type: "object",
      properties: { memory_key: { type: "string", description: "The key of the memory to forget" } },
      required: ["memory_key"],
    },
  },
  {
    name: "learn_workflow",
    description: "Save a custom multi-step workflow, automation, or custom shortcut rule for the shop.",
    parameters: {
      type: "object",
      properties: {
        workflow_key: { type: "string", description: "Unique slug, e.g. 'daily_closing_routine'" },
        name: { type: "string", description: "Human-readable workflow title" },
        instruction: { type: "string", description: "Step-by-step instructions for the workflow" },
        risk: { type: "string", description: "'low', 'medium', or 'high'" },
      },
      required: ["workflow_key", "name", "instruction"],
    },
  },
  {
    name: "prepare_quick_sale",
    description: "Prepare an itemized quick sale for owner approval. Resolves products, checks stock, applies GST, and creates an approval record with 1-click confirmation.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { query: { type: "string" }, qty: { type: "number" } },
            required: ["query", "qty"],
          },
          description: "List of item names and quantities",
        },
        payment_method: { type: "string", description: "'cash', 'upi', 'card', 'credit', or 'other'" },
        customer_query: { type: "string", description: "Optional customer name or phone" },
      },
      required: ["items"],
    },
  },
];

function indiaDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function monthRange() {
  const end = indiaDate();
  const start = `${end.slice(0, 7)}-01`;
  const next = new Date(`${start}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { start, end: new Date(next.getTime() - 86400000).toISOString().slice(0, 10) };
}

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value: unknown) {
  return `₹${safeNumber(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeIlike(value: string) {
  return value.replace(/[\\%_]/g, "");
}

function clean(value: string) {
  return value.toLowerCase().replace(/[^a-zA-Z0-9\s]+/g, " ").trim();
}

async function executeTool(call: ToolCall, ctx: ToolContext): Promise<Record<string, unknown>> {
  const { supabase, userId } = ctx;
  switch (call.name) {
    case "get_business_snapshot": {
      const { start, end } = monthRange();
      const [pnlRes, customersRes, productsRes, auditRes] = await Promise.all([
        supabase.rpc("get_ai_current_month_pnl", { p_from: start, p_to: end }),
        supabase.from("customers").select("id,name,phone,balance").gt("balance", 0).order("balance", { ascending: false }).limit(10),
        supabase.from("products").select("id,name,stock_qty,reorder_level,unit,sale_price").eq("is_active", true).order("name").limit(500),
        supabase.from("audit_runs").select("id,audit_score,status,total_findings,critical_count,created_at,audit_findings(description,severity)").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const errors = [pnlRes.error?.message, customersRes.error?.message, productsRes.error?.message, auditRes.error?.message].filter(Boolean);
      if (pnlRes.error) return { error: pnlRes.error.message, period: { start, end } };
      const pnl = pnlRes.data && typeof pnlRes.data === "object" ? (pnlRes.data as Record<string, unknown>) : {};
      const customers = customersRes.data ?? [];
      const lowStock = (productsRes.data ?? []).filter((p: any) => safeNumber(p.stock_qty) <= safeNumber(p.reorder_level));
      return {
        asOf: end,
        period: { start, end },
        financials: {
          revenue: money(pnl.revenue),
          returns: money(pnl.returns),
          grossProfit: money(pnl.gross_profit),
          expenses: money(pnl.expenses),
          netProfit: money(pnl.net_profit),
          netMarginPct: safeNumber(pnl.net_margin_percent),
          unverifiedCostCount: safeNumber(pnl.unverified_cost_count),
          warning: pnl.warning_message || null,
        },
        receivables: {
          totalTop10: money(customers.reduce((sum: number, c: any) => sum + safeNumber(c.balance), 0)),
          topCustomers: customers.map((c: any) => ({ name: c.name, phone: c.phone || null, balance: safeNumber(c.balance) })),
        },
        inventory: {
          lowStockCount: lowStock.length,
          lowStock: lowStock.slice(0, 20).map((p: any) => ({
            name: p.name,
            stock: safeNumber(p.stock_qty),
            reorderLevel: safeNumber(p.reorder_level),
            unit: p.unit || "units",
            salePrice: safeNumber(p.sale_price),
          })),
        },
        audit: auditRes.data
          ? {
              score: safeNumber((auditRes.data as any).audit_score),
              status: (auditRes.data as any).status,
              findings: safeNumber((auditRes.data as any).total_findings),
              critical: safeNumber((auditRes.data as any).critical_count),
              topFinding: (auditRes.data as any).audit_findings?.[0]?.description || null,
            }
          : null,
        errors,
      };
    }

    case "search_catalog": {
      const query = String(call.args.query || "").trim();
      if (!query) return { matches: [] };
      const safe = escapeIlike(query);
      const [products, services] = await Promise.all([
        supabase.from("products").select("id,name,sale_price,cost_price,stock_qty,reorder_level,unit,gst_rate,hsn_code").eq("is_active", true).ilike("name", `%${safe}%`).limit(20),
        supabase.from("services").select("id,name,sale_price,cost_price,gst_rate,sac_code").eq("is_active", true).ilike("name", `%${safe}%`).limit(20),
      ]);
      return {
        query,
        matches: [
          ...(products.data ?? []).map((p: any) => ({
            kind: "product",
            id: p.id,
            name: p.name,
            salePrice: safeNumber(p.sale_price),
            stock: safeNumber(p.stock_qty),
            reorderLevel: safeNumber(p.reorder_level),
            unit: p.unit || "units",
            gstRate: safeNumber(p.gst_rate),
            hsnSac: p.hsn_code || null,
            costPrice: p.cost_price == null ? null : safeNumber(p.cost_price),
          })),
          ...(services.data ?? []).map((s: any) => ({
            kind: "service",
            id: s.id,
            name: s.name,
            salePrice: safeNumber(s.sale_price),
            gstRate: safeNumber(s.gst_rate),
            hsnSac: s.sac_code || null,
            costPrice: s.cost_price == null ? null : safeNumber(s.cost_price),
          })),
        ],
        errors: [products.error?.message, services.error?.message].filter(Boolean),
      };
    }

    case "search_customer": {
      const query = String(call.args.query || "").trim();
      if (!query) return { matches: [] };
      const safe = escapeIlike(query);
      const { data, error } = await supabase
        .from("customers")
        .select("id,name,phone,balance,gstin,state_code,is_active")
        .eq("is_active", true)
        .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
        .limit(20);
      if (error) return { matches: [], error: error.message };
      return {
        query,
        matches: (data ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          phone: c.phone || null,
          balance: safeNumber(c.balance),
          gstin: c.gstin || null,
          stateCode: c.state_code || null,
        })),
      };
    }

    case "get_customer_ledger": {
      const query = String(call.args.query || "").trim();
      if (!query) return { error: "Customer query is required." };
      const safe = escapeIlike(query);
      const { data: customers } = await supabase
        .from("customers")
        .select("id,name,phone,balance,gstin,state_code,credit_limit,created_at")
        .eq("is_active", true)
        .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
        .limit(5);
      if (!customers || customers.length === 0) return { found: false, message: `No customer matching '${query}' was found.` };
      const customer = customers[0];
      const { data: sales } = await supabase
        .from("sales")
        .select("id,invoice_number,total_amount,payment_status,invoice_date")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(10);
      return {
        found: true,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          currentBalanceDue: safeNumber(customer.balance),
          creditLimit: safeNumber(customer.credit_limit),
          gstin: customer.gstin,
        },
        recentInvoices: sales || [],
      };
    }

    case "get_recent_transactions": {
      const limit = Math.min(25, Math.max(1, Math.floor(safeNumber(call.args.limit || 10))));
      const { data, error } = await supabase
        .from("transactions")
        .select("id,service_type,total_amount,service_fee,portal_commission,status,created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return { transactions: [], error: error.message };
      return {
        transactions: (data ?? []).map((t: any) => ({
          id: t.id,
          serviceType: t.service_type,
          amount: safeNumber(t.total_amount),
          fee: safeNumber(t.service_fee),
          commission: safeNumber(t.portal_commission),
          status: t.status,
          createdAt: t.created_at,
        })),
      };
    }

    case "get_audit_status": {
      const { data, error } = await supabase
        .from("audit_runs")
        .select("id,audit_score,status,total_findings,critical_count,created_at,audit_findings(description,severity,field_name)")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { status: "NO_AUDIT_RUN", message: "No self-audit run is recorded yet." };
      return {
        audit: {
          id: (data as any).id,
          score: safeNumber((data as any).audit_score),
          status: (data as any).status,
          findings: safeNumber((data as any).total_findings),
          critical: safeNumber((data as any).critical_count),
          createdAt: (data as any).created_at,
          details: ((data as any).audit_findings ?? []).slice(0, 15),
        },
      };
    }

    case "get_whatsapp_status": {
      const health = await checkWhatsAppHealth();
      return {
        provider: health.provider,
        configured: health.configured,
        connected: health.connected,
        status: health.status,
        error: health.error || null,
        code: health.code || null,
        details: health.details || {},
      };
    }

    case "get_learning_workflows": {
      const { data, error } = await supabase
        .from("ai_workflow_versions")
        .select("workflow_key,name,version,risk,status,confidence,instruction,evidence,updated_at")
        .eq("user_id", userId)
        .in("status", ["active", "draft"])
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) return { workflows: [], error: error.message };
      return { workflows: data ?? [] };
    }

    case "save_memory": {
      const category = typeof call.args.category === "string" ? call.args.category.trim() : "instruction";
      const key = typeof call.args.memory_key === "string" ? call.args.memory_key.trim().toLowerCase().replace(/\s+/g, "_") : "";
      const value = typeof call.args.memory_value === "string" ? call.args.memory_value.trim() : "";
      if (!key || !value) return { error: "Both memory_key and memory_value are required." };

      const { data, error } = await supabase
        .from("ai_memories")
        .upsert(
          {
            user_id: userId,
            category,
            memory_key: key,
            memory_value: value,
            source: "agent_learned",
            confidence: 1,
            active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,category,memory_key" }
        )
        .select()
        .single();

      if (error) return { error: error.message };
      return {
        learned: true,
        memoryKey: key,
        category,
        storedValue: value,
        message: `✓ Saved rule '${key}' into AI memory. I will remember and follow this instruction permanently.`,
      };
    }

    case "forget_memory": {
      const key = typeof call.args.memory_key === "string" ? call.args.memory_key.trim() : "";
      if (!key) return { error: "memory_key is required." };
      const safe = escapeIlike(key);
      const { error } = await supabase
        .from("ai_memories")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .ilike("memory_key", `%${safe}%`);
      if (error) return { error: error.message };
      return { forgotten: true, key, message: `✓ Removed memory matching '${key}'.` };
    }

    case "learn_workflow": {
      const workflowKey = typeof call.args.workflow_key === "string" ? call.args.workflow_key.trim() : "";
      const name = typeof call.args.name === "string" ? call.args.name.trim() : "";
      const instruction = typeof call.args.instruction === "string" ? call.args.instruction.trim() : "";
      const risk = typeof call.args.risk === "string" && ["low", "medium", "high"].includes(call.args.risk) ? call.args.risk : "low";

      if (!workflowKey || !name || !instruction) return { error: "workflow_key, name, and instruction are required." };

      const { data: latest } = await supabase
        .from("ai_workflow_versions")
        .select("id, version")
        .eq("user_id", userId)
        .eq("workflow_key", workflowKey)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      const version = Number(latest?.version ?? 0) + 1;
      const { data, error } = await supabase
        .from("ai_workflow_versions")
        .insert({
          user_id: userId,
          workflow_key: workflowKey,
          version,
          name,
          risk,
          status: "active",
          confidence: 0.95,
          instruction,
          evidence: { learned_via: "interactive_agent", timestamp: new Date().toISOString() },
          selector_map: {},
          supersedes_id: latest?.id ?? null,
        })
        .select()
        .single();

      if (error) return { error: error.message };
      return {
        learnedWorkflow: true,
        workflowKey,
        version,
        name,
        message: `✓ Saved active workflow '${name}' (v${version}).`,
      };
    }

    case "prepare_quick_sale": {
      const rawItems = Array.isArray(call.args.items) ? call.args.items : [];
      if (!rawItems.length) return { error: "No items provided for sale." };

      const [{ data: products }, { data: services }] = await Promise.all([
        supabase.from("products").select("id,name,sale_price,cost_price,stock_qty,hsn_code,gst_rate").eq("is_active", true),
        supabase.from("services").select("id,name,sale_price,cost_price,sac_code,gst_rate").eq("is_active", true),
      ]);

      const catalog = [
        ...(products ?? []).map((p: any) => ({ ...p, kind: "product" as const })),
        ...(services ?? []).map((s: any) => ({ ...s, kind: "service" as const })),
      ];

      const resolved: any[] = [];
      const missing: string[] = [];

      for (const item of rawItems) {
        const queryStr = clean(String(item.query || item.name || ""));
        const qty = Math.max(1, Math.floor(safeNumber(item.qty || 1)));
        if (!queryStr) continue;

        const exact = catalog.filter((x) => clean(String(x.name)) === queryStr);
        const partial = catalog.filter((x) => clean(String(x.name)).includes(queryStr) || queryStr.includes(clean(String(x.name))));
        const match = exact.length > 0 ? exact[0] : partial.length > 0 ? partial[0] : null;

        if (!match) {
          missing.push(item.query || item.name || "unknown");
          continue;
        }

        if (match.kind === "product" && Number(match.stock_qty) < qty) {
          return { error: `Insufficient stock for ${match.name}: only ${match.stock_qty} available.` };
        }

        resolved.push({
          id: match.id,
          kind: match.kind,
          name: match.name,
          qty,
          rate: Number(match.sale_price),
          cost_price: Number(match.cost_price ?? 0),
          gst_rate: Number(match.gst_rate ?? 0),
          hsn_sac: match.kind === "product" ? match.hsn_code ?? null : match.sac_code ?? null,
        });
      }

      if (missing.length > 0) {
        return { error: `The following items could not be found in catalog: ${missing.join(", ")}` };
      }
      if (resolved.length === 0) {
        return { error: "No valid items resolved." };
      }

      let customer: any = null;
      const custQuery = typeof call.args.customer_query === "string" ? call.args.customer_query.trim() : "";
      if (custQuery) {
        const safe = escapeIlike(custQuery);
        const { data: custs } = await supabase.from("customers").select("id,name,phone,state_code,gstin,balance").eq("is_active", true).ilike("name", `%${safe}%`).limit(1);
        if (custs && custs.length > 0) customer = custs[0];
      }

      const method = typeof call.args.payment_method === "string" && ["cash", "upi", "card", "credit"].includes(call.args.payment_method.toLowerCase())
        ? call.args.payment_method.toLowerCase()
        : "cash";

      const gst = calculateGstInvoice({
        lines: resolved.map((x) => ({
          qty: x.qty,
          rate: x.rate,
          gstRate: x.gst_rate,
          hsnSac: x.hsn_sac,
          taxTreatment: x.gst_rate > 0 ? "taxable" : "non_gst",
        })),
        invoiceLumpSumDiscount: 0,
        supplierStateCode: "19",
        customerStateCode: customer?.state_code ?? null,
        customerGstin: customer?.gstin ?? null,
      });

      const total = gst.invoiceTotal;
      const { data: instruments } = await supabase.from("payment_instruments").select("id,name,type").eq("is_active", true).eq("type", method).order("name").limit(1);
      const instrumentId = instruments?.[0]?.id ?? null;
      const payment = [{ method, amount: total, instrument_id: instrumentId }];

      const { data: approval, error: appError } = await supabase
        .from("ai_action_approvals")
        .insert({
          requested_by: userId,
          action: "create_sale",
          status: "pending",
          request_payload: {
            source: "cafe-ai-agent-tool",
            customer_id: customer?.id ?? null,
            customer_name: customer?.name ?? null,
            customer_state_code: customer?.state_code ?? null,
            customer_gstin: customer?.gstin ?? null,
            payment,
            items: resolved,
            expected_total: total,
          },
        })
        .select("id, action, status, request_payload, created_at, expires_at")
        .single();

      if (appError) return { error: `Failed to create approval record: ${appError.message}` };

      return {
        approvalRequired: true,
        approvalId: approval.id,
        summary: {
          customer: customer?.name ?? "Walk-in Customer",
          paymentMethod: method,
          total: money(total),
          rawTotal: total,
          items: resolved.map((x) => ({ name: x.name, qty: x.qty, rate: money(x.rate), amount: money(x.qty * x.rate) })),
        },
        message: `Prepared quick sale for ${resolved.map((r) => `${r.qty}x ${r.name}`).join(", ")} (${money(total)} via ${method.toUpperCase()}). Waiting for 1-click owner approval.`,
      };
    }

    default:
      return { error: `Unknown tool: ${call.name}` };
  }
}

function normalizeHistory(history: AgentHistoryItem[] | undefined): AgentHistoryItem[] {
  return (Array.isArray(history) ? history : [])
    .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .map((item) => ({ role: item.role, content: item.content.trim().slice(0, 4000) }))
    .filter((item) => item.content)
    .slice(-MAX_HISTORY);
}

function getModelCandidates() {
  const configured = (process.env.GEMINI_MODEL || "").trim();
  const deprecated = new Set(["gemini-2.0-flash-001"]);
  const defaults = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-pro"];
  return Array.from(new Set([configured, ...defaults].filter((model) => model && !deprecated.has(model))));
}

async function callGemini(apiKey: string, model: string, body: Record<string, unknown>) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data, error: data?.error?.message || `${model}: ${response.status} ${response.statusText}` };
}

/**
 * High-performance, offline-capable Intelligent Heuristic Core.
 * Executes automatically when Gemini API is unavailable or rate-limited.
 */
export async function runIntelligentHeuristicAgent({
  message,
  supabase,
  userId,
}: {
  message: string;
  supabase: SupabaseClient<any, any, any>;
  userId: string;
}) {
  const text = message.trim();
  const lower = text.toLowerCase();

  // 1. Check for Memory Teaching / Learning Commands
  const learnMatch = text.match(/^(?:remember(?:\s+that)?|note\s+down|memorize|save\s+rule|keep\s+in\s+mind|teach)\s*:?\s*(.+)$/i);
  if (learnMatch) {
    const rawInstruction = learnMatch[1].trim();
    const parts = rawInstruction.split(/[:=\-–—]| is | gets | costs | should /i);
    const key = (parts[0] || rawInstruction.slice(0, 30)).trim().toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, "_");
    const value = rawInstruction;

    await executeTool(
      {
        name: "save_memory",
        args: { category: "instruction", memory_key: key, memory_value: value },
      },
      { supabase, userId }
    );

    return {
      message: `🧠 **Learned & Stored in AI Memory**\n\nI have committed this to memory under rule \`${key}\`:\n> "${value}"\n\nI will remember and apply this in all future operations.`,
      usedTools: ["save_memory"],
      rounds: 1,
      finishReason: "STOP",
    };
  }

  // 2. Check for Memory Forgetting Commands
  const forgetMatch = text.match(/^(?:forget(?:\s+about)?|delete\s+memory|remove\s+rule)\s*:?\s*(.+)$/i);
  if (forgetMatch) {
    const key = forgetMatch[1].trim();
    await executeTool({ name: "forget_memory", args: { memory_key: key } }, { supabase, userId });
    return {
      message: `✓ Forgotten: I have deactivated any learned rule matching "${key}".`,
      usedTools: ["forget_memory"],
      rounds: 1,
      finishReason: "STOP",
    };
  }

  // 3. Check for Quick Sale / Billing
  if (/\b(?:sell|bill|quick\s*sale|invoice\s*for|create\s*(?:a\s*)?sale)\b/i.test(lower)) {
    const paymentMethod = /\bupi\b/i.test(lower) ? "upi" : /\bcard\b/i.test(lower) ? "card" : /\bcredit|khata\b/i.test(lower) ? "credit" : "cash";
    const customerMatch = text.match(/(?:for|customer|to)\s+([A-Za-z\s]+?)(?:,|\.|\s+(?:cash|upi|card|pay)|$)/i);
    const customerQuery = customerMatch ? customerMatch[1].trim() : undefined;

    const itemMatches: { query: string; qty: number }[] = [];
    const itemRegex = /(\d+)\s+([a-zA-Z\s]+?)(?:and|\+|,|\.|$|cash|upi|card)/gi;
    let match;
    while ((match = itemRegex.exec(text)) !== null) {
      const qty = parseInt(match[1], 10);
      const query = match[2].trim();
      if (qty > 0 && query.length > 1 && !["for", "to", "customer", "and", "cash", "upi", "card"].includes(query.toLowerCase())) {
        itemMatches.push({ query, qty });
      }
    }

    if (itemMatches.length > 0) {
      const saleResult = await executeTool(
        {
          name: "prepare_quick_sale",
          args: { items: itemMatches, payment_method: paymentMethod, customer_query: customerQuery },
        },
        { supabase, userId }
      );

      if (saleResult.error) {
        return {
          message: `⚠️ Could not prepare sale: ${saleResult.error}`,
          usedTools: ["prepare_quick_sale"],
          rounds: 1,
          finishReason: "STOP",
        };
      }

      const summary = saleResult.summary as any;
      const itemList = (summary?.items || []).map((i: any) => `- ${i.qty}x ${i.name}: ${i.amount}`).join("\n");
      return {
        message: `⚡ **Quick Sale Prepared (Pending Approval)**\n\n**Customer**: ${summary?.customer}\n**Payment**: ${summary?.paymentMethod?.toUpperCase()}\n**Total**: ${summary?.total}\n\n**Items**:\n${itemList}\n\n*Click "Approve & Execute" below to finalize and generate the GST invoice.*`,
        usedTools: ["prepare_quick_sale"],
        rounds: 1,
        finishReason: "STOP",
        approval: { id: saleResult.approvalId, ...summary },
      };
    }
  }

  // 4. Check for Customer Ledger / Khata Dues
  if (/\b(?:khata|due|dues|receivable|who\s*owes|customer\s*balance)\b/i.test(lower)) {
    const custSearchMatch = text.match(/(?:due\s+for|dues\s+of|balance\s+of|ledger\s+of|customer)\s+([A-Za-z0-9\s]+)/i);
    if (custSearchMatch) {
      const q = custSearchMatch[1].trim();
      const ledger = await executeTool({ name: "get_customer_ledger", args: { query: q } }, { supabase, userId });
      if (ledger.found) {
        const c = (ledger as any).customer;
        return {
          message: `👤 **Customer Khata Details: ${c.name}**\n\n- **Phone**: ${c.phone || "Not recorded"}\n- **Current Balance Due**: ${money(c.currentBalanceDue)}\n- **Credit Limit**: ${money(c.creditLimit)}\n- **GSTIN**: ${c.gstin || "N/A"}`,
          usedTools: ["get_customer_ledger"],
          rounds: 1,
          finishReason: "STOP",
        };
      }
    }

    const { data: customers } = await supabase
      .from("customers")
      .select("id,name,phone,balance")
      .gt("balance", 0)
      .order("balance", { ascending: false })
      .limit(10);

    const list = (customers || []).map((c: any) => `- **${c.name}** (${c.phone || "No phone"}): ${money(c.balance)}`).join("\n");
    const total = (customers || []).reduce((acc: number, c: any) => acc + safeNumber(c.balance), 0);

    return {
      message: `📋 **Customer Khata Receivables Summary**\n\nTotal Outstanding (Top Accounts): **${money(total)}**\n\n${list || "✓ No pending dues."}`,
      usedTools: ["search_customer"],
      rounds: 1,
      finishReason: "STOP",
    };
  }

  // 5. Check for Low Stock / Inventory
  if (/\b(?:stock|inventory|reorder|out\s*of\s*stock|low\s*stock)\b/i.test(lower)) {
    const { data: products } = await supabase
      .from("products")
      .select("id,name,stock_qty,reorder_level,unit,sale_price")
      .eq("is_active", true)
      .order("name")
      .limit(500);

    const lowStock = (products || []).filter((p: any) => safeNumber(p.stock_qty) <= safeNumber(p.reorder_level));

    if (!lowStock.length) {
      return {
        message: "✓ All catalog products are currently healthy and above their reorder thresholds.",
        usedTools: ["search_catalog"],
        rounds: 1,
        finishReason: "STOP",
      };
    }

    const list = lowStock
      .slice(0, 15)
      .map((p: any) => `- **${p.name}**: ${p.stock_qty} ${p.unit || "units"} (Alert threshold: ${p.reorder_level}, Rate: ${money(p.sale_price)})`)
      .join("\n");

    return {
      message: `⚠️ **Inventory Alert: ${lowStock.length} Item(s) Need Reordering**\n\n${list}`,
      usedTools: ["search_catalog"],
      rounds: 1,
      finishReason: "STOP",
    };
  }

  // 6. Check for P&L / Financial Summary
  if (/\b(?:p&l|p\/l|profit|loss|revenue|financial|monthly\s*report|business\s*report)\b/i.test(lower)) {
    const snap = await executeTool({ name: "get_business_snapshot", args: {} }, { supabase, userId });
    const fin = (snap as any).financials;
    if (fin) {
      return {
        message: `📊 **Cafe-EPR Profit & Loss Statement (Current Month)**\n\n- **Gross Sales Revenue**: ${fin.revenue}\n- **Sales Returns/Refunds**: -${fin.returns}\n- **Gross Operating Profit**: ${fin.grossProfit}\n- **Operating Expenses**: -${fin.expenses}\n- **NET OPERATING PROFIT**: **${fin.netProfit}**\n- **Net Margin**: **${fin.netMarginPct.toFixed(2)}%**\n\n*Live accounting snapshot verified.*`,
        usedTools: ["get_business_snapshot"],
        rounds: 1,
        finishReason: "STOP",
      };
    }
  }

  // 7. Check for WhatsApp / Gateway Health
  if (/\b(?:whatsapp|gateway|message|messaging)\b/i.test(lower)) {
    const status = await executeTool({ name: "get_whatsapp_status", args: {} }, { supabase, userId });
    return {
      message: `💬 **WhatsApp Gateway Status**\n\n- **Provider**: ${(status as any).provider || "None"}\n- **Connected**: ${(status as any).connected ? "✓ Connected & Ready" : "⚠️ Disconnected"}\n- **Status**: ${(status as any).status}\n${(status as any).error ? `- **Error**: ${(status as any).error}` : ""}`,
      usedTools: ["get_whatsapp_status"],
      rounds: 1,
      finishReason: "STOP",
    };
  }

  // 8. Check for Recent Transactions
  if (/\b(?:recent\s*transactions?|latest\s*transactions?|recent\s*orders?)\b/i.test(lower)) {
    const res = await executeTool({ name: "get_recent_transactions", args: { limit: 8 } }, { supabase, userId });
    const txns = (res as any).transactions || [];
    const list = txns.map((t: any) => `- **${t.serviceType.toUpperCase()}**: ${money(t.amount)} · ${t.status} · ${new Date(t.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`).join("\n");
    return {
      message: `📄 **Recent Transactions**\n\n${list || "No recent transactions found."}`,
      usedTools: ["get_recent_transactions"],
      rounds: 1,
      finishReason: "STOP",
    };
  }

  // 9. Check Catalog Price / Stock Search
  if (/\b(?:price|rate|cost|how\s*much|do\s*we\s*have)\b/i.test(lower)) {
    const query = lower.replace(/\b(?:price|rate|cost|how\s*much|do\s*we\s*have|of|for|is|what|a)\b/gi, "").trim();
    if (query) {
      const cat = await executeTool({ name: "search_catalog", args: { query } }, { supabase, userId });
      const matches = (cat as any).matches || [];
      if (matches.length > 0) {
        const list = matches.slice(0, 6).map((m: any) => `- **${m.name}** (${m.kind}): ${money(m.salePrice)} ${m.stock !== undefined ? `· Stock: ${m.stock} ${m.unit || ""}` : ""} · GST: ${m.gstRate}%`).join("\n");
        return {
          message: `🔍 **Catalog Search Results for "${query}"**\n\n${list}`,
          usedTools: ["search_catalog"],
          rounds: 1,
          finishReason: "STOP",
        };
      }
    }
  }

  // 10. Check learned memories for any matching knowledge
  const { data: storedMemories } = await supabase
    .from("ai_memories")
    .select("memory_key,memory_value,category")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(50);

  const matchedMemory = (storedMemories || []).find((m: any) =>
    lower.includes(m.memory_key.replace(/_/g, " ")) ||
    (typeof m.memory_value === "string" && lower.includes(m.memory_value.toLowerCase().slice(0, 20)))
  );

  if (matchedMemory) {
    return {
      message: `🧠 **According to your saved AI memory** (\`${matchedMemory.memory_key}\`):\n\n> "${matchedMemory.memory_value}"`,
      usedTools: ["ai_memories"],
      rounds: 1,
      finishReason: "STOP",
    };
  }

  // Default Assistant Guidance Response
  return {
    message: `🤖 **Cafe AI Agent Ready**\n\nI am your shop assistant. Here is what I can do for you right now:\n\n- ⚡ **Quick Billing**: Say *"Sell 2 coffee and 1 sandwich UPI"* or *"Bill 5 xerox cash"* to prepare a 1-click GST invoice.\n- 🧠 **Self-Learning**: Say *"Remember that Xerox is 3 rupees per page"* or *"Remember Rahul gets 10% discount"* to teach me rules.\n- 📊 **Financials**: Ask *"Profit and loss this month"* or *"Today's sales report"*.\n- 👥 **Khata Dues**: Ask *"Who owes money?"* or *"Customer balance for Amit"*.\n- 📦 **Inventory**: Ask *"Check low stock items"* or *"What is the price of A4 paper?"*.\n- 💬 **WhatsApp & Health**: Ask *"Is WhatsApp connected?"* or *"Check system health"*.\n\nHow can I help your shop right now?`,
    usedTools: [],
    rounds: 1,
    finishReason: "STOP",
  };
}

export async function runIntelligentAgent({
  apiKey,
  message,
  history,
  systemInstruction,
  supabase,
  userId,
}: {
  apiKey: string;
  message: string;
  history?: AgentHistoryItem[];
  systemInstruction: string;
  supabase: SupabaseClient<any, any, any>;
  userId: string;
}) {
  if (!apiKey || apiKey.length < 15 || apiKey.includes("[SENSITIVE")) {
    return runIntelligentHeuristicAgent({ message, supabase, userId });
  }

  const safeHistory = normalizeHistory(history).filter((item) => item.content !== message.trim());
  const contents: any[] = safeHistory.map((item) => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: item.content }],
  }));
  contents.push({ role: "user", parts: [{ text: message }] });

  const tools = [{ functionDeclarations: TOOL_DECLARATIONS }];
  const baseBody = {
    systemInstruction: {
      parts: [
        {
          text: `${systemInstruction}\n\nYou are an agent, not just a chatbot. Prefer verified Cafe-EPR tools for live facts. Use the minimum tools necessary. You may call multiple independent tools in one turn. When the user teaches a rule or preference, ALWAYS call save_memory so you remember it permanently. If the user asks to prepare a sale or bill, call prepare_quick_sale. Give concise evidence/reasoning. If a tool returns an error, say that clearly. Never invent missing values.\n\nCurrent India date: ${indiaDate()}.`,
        },
      ],
    },
    tools,
    generationConfig: { maxOutputTokens: 1800 },
  };

  let lastError = "Cafe AI request failed";
  const usedTools: string[] = [];
  let finalData: any = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    let result: { ok: boolean; data: any; error: string } | null = null;
    for (const model of getModelCandidates()) {
      try {
        result = await callGemini(apiKey, model, { ...baseBody, contents });
        if (result.ok) break;
        lastError = result.error;
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
      }
    }

    if (!result?.ok) {
      console.warn("Gemini API call failed, engaging intelligent heuristic core:", lastError);
      return runIntelligentHeuristicAgent({ message, supabase, userId });
    }

    finalData = result.data;
    const parts: GeminiPart[] = finalData?.candidates?.[0]?.content?.parts || [];
    const calls: ToolCall[] = parts
      .filter((p) => p.functionCall?.name)
      .map((p) => ({ name: p.functionCall!.name, args: p.functionCall!.args || {}, id: p.functionCall!.id }));

    if (!calls.length) {
      const text = parts
        .map((p) => p.text)
        .filter(Boolean)
        .join("\n")
        .trim();
      return {
        message: text || "I understood the request, but I could not produce a response.",
        usedTools,
        rounds: round + 1,
        finishReason: finalData?.candidates?.[0]?.finishReason || null,
      };
    }

    contents.push({ role: "model", parts });
    const toolResponses = await Promise.all(
      calls.map(async (call) => {
        usedTools.push(call.name);
        try {
          return {
            functionResponse: {
              name: call.name,
              id: call.id,
              response: await executeTool(call, { supabase, userId }),
            },
          };
        } catch (error) {
          return {
            functionResponse: {
              name: call.name,
              id: call.id,
              response: { error: error instanceof Error ? error.message : "Tool failed" },
            },
          };
        }
      })
    );
    contents.push({ role: "user", parts: toolResponses });
  }

  const fallback = finalData?.candidates?.[0]?.content?.parts
    ?.map((p: GeminiPart) => p.text)
    .filter(Boolean)
    .join("\n")
    .trim();

  return {
    message: fallback || "I could not complete the requested analysis within the safe tool limit.",
    usedTools,
    rounds: MAX_TOOL_ROUNDS,
    finishReason: finalData?.candidates?.[0]?.finishReason || null,
  };
}
