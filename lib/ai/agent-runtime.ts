import type { SupabaseClient } from "@supabase/supabase-js";
import { checkWhatsAppHealth } from "@/lib/whatsapp-health";

const MAX_TOOL_ROUNDS = 4;
const MAX_HISTORY = 10;

export type AgentHistoryItem = { role: "user" | "assistant"; content: string };
type ToolContext = { supabase: SupabaseClient<any, any, any>; userId: string };
type ToolCall = { name: string; args: Record<string, unknown>; id?: string };
type GeminiPart = { text?: string; functionCall?: { name: string; args?: Record<string, unknown>; id?: string }; functionResponse?: { name: string; response: Record<string, unknown>; id?: string } };

const TOOL_DECLARATIONS = [
  { name: "get_business_snapshot", description: "Read the current Cafe-EPR business snapshot: current-month P&L, customer receivables, low stock, and latest self-audit status. Use this before making claims about live business state.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { name: "search_catalog", description: "Search active products and services by name. Use this when the owner asks about an item, price, stock, GST, HSN/SAC, or what can be sold.", parameters: { type: "object", properties: { query: { type: "string", description: "Product or service name to search for" } }, required: ["query"], additionalProperties: false } },
  { name: "search_customer", description: "Search active customers by name or phone and return current balance and basic account details. Do not invent a customer match.", parameters: { type: "object", properties: { query: { type: "string", description: "Customer name or phone" } }, required: ["query"], additionalProperties: false } },
  { name: "get_recent_transactions", description: "Read recent completed or pending Cafe-EPR service transactions. Useful for transaction status, recent activity, and operational questions.", parameters: { type: "object", properties: { limit: { type: "integer", description: "Number of recent transactions, maximum 25" } }, additionalProperties: false } },
  { name: "get_audit_status", description: "Read the latest Cafe-EPR self-audit run and its findings. Use for integrity, discrepancy, anomaly, or audit questions.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { name: "get_whatsapp_status", description: "Perform a live WhatsApp provider health check. Use for WhatsApp connection, gateway, error, disconnect, or reconnect questions.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { name: "get_learning_workflows", description: "Read the owner's active or recently drafted learned AI workflows so the agent can follow known procedures without guessing.", parameters: { type: "object", properties: {}, additionalProperties: false } },
];

function indiaDate(): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function monthRange() { const end = indiaDate(); const start = `${end.slice(0, 7)}-01`; const next = new Date(`${start}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1); return { start, end: new Date(next.getTime() - 86400000).toISOString().slice(0, 10) }; }
function safeNumber(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function money(value: unknown) { return `₹${safeNumber(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function escapeIlike(value: string) { return value.replace(/[\\%_]/g, ""); }

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
      const pnl = pnlRes.data && typeof pnlRes.data === "object" ? pnlRes.data as Record<string, unknown> : {};
      const customers = customersRes.data ?? [];
      const lowStock = (productsRes.data ?? []).filter((p: any) => safeNumber(p.stock_qty) <= safeNumber(p.reorder_level));
      return { asOf: end, period: { start, end }, financials: { revenue: money(pnl.revenue), returns: money(pnl.returns), grossProfit: money(pnl.gross_profit), expenses: money(pnl.expenses), netProfit: money(pnl.net_profit), netMarginPct: safeNumber(pnl.net_margin_percent), unverifiedCostCount: safeNumber(pnl.unverified_cost_count), warning: pnl.warning_message || null }, receivables: { totalTop10: money(customers.reduce((sum: number, c: any) => sum + safeNumber(c.balance), 0)), topCustomers: customers.map((c: any) => ({ name: c.name, phone: c.phone || null, balance: safeNumber(c.balance) })) }, inventory: { lowStockCount: lowStock.length, lowStock: lowStock.slice(0, 20).map((p: any) => ({ name: p.name, stock: safeNumber(p.stock_qty), reorderLevel: safeNumber(p.reorder_level), unit: p.unit || "units", salePrice: safeNumber(p.sale_price) })) }, audit: auditRes.data ? { score: safeNumber((auditRes.data as any).audit_score), status: (auditRes.data as any).status, findings: safeNumber((auditRes.data as any).total_findings), critical: safeNumber((auditRes.data as any).critical_count), topFinding: (auditRes.data as any).audit_findings?.[0]?.description || null } : null, errors };
    }
    case "search_catalog": {
      const query = String(call.args.query || "").trim(); if (!query) return { matches: [] }; const safe = escapeIlike(query);
      const [products, services] = await Promise.all([supabase.from("products").select("id,name,sale_price,cost_price,stock_qty,reorder_level,unit,gst_rate,hsn_code").eq("is_active", true).ilike("name", `%${safe}%`).limit(20), supabase.from("services").select("id,name,sale_price,cost_price,gst_rate,sac_code").eq("is_active", true).ilike("name", `%${safe}%`).limit(20)]);
      return { query, matches: [...(products.data ?? []).map((p: any) => ({ kind: "product", id: p.id, name: p.name, salePrice: safeNumber(p.sale_price), stock: safeNumber(p.stock_qty), reorderLevel: safeNumber(p.reorder_level), unit: p.unit || "units", gstRate: safeNumber(p.gst_rate), hsnSac: p.hsn_code || null, costPrice: p.cost_price == null ? null : safeNumber(p.cost_price) })), ...(services.data ?? []).map((s: any) => ({ kind: "service", id: s.id, name: s.name, salePrice: safeNumber(s.sale_price), gstRate: safeNumber(s.gst_rate), hsnSac: s.sac_code || null, costPrice: s.cost_price == null ? null : safeNumber(s.cost_price) }))], errors: [products.error?.message, services.error?.message].filter(Boolean) };
    }
    case "search_customer": {
      const query = String(call.args.query || "").trim(); if (!query) return { matches: [] }; const safe = escapeIlike(query); const { data, error } = await supabase.from("customers").select("id,name,phone,balance,gstin,state_code,is_active").eq("is_active", true).or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`).limit(20); if (error) return { matches: [], error: error.message }; return { query, matches: (data ?? []).map((c: any) => ({ id: c.id, name: c.name, phone: c.phone || null, balance: safeNumber(c.balance), gstin: c.gstin || null, stateCode: c.state_code || null })) };
    }
    case "get_recent_transactions": {
      const limit = Math.min(25, Math.max(1, Math.floor(safeNumber(call.args.limit || 10)))); const { data, error } = await supabase.from("transactions").select("id,service_type,total_amount,service_fee,portal_commission,status,created_at").order("created_at", { ascending: false }).limit(limit); if (error) return { transactions: [], error: error.message }; return { transactions: (data ?? []).map((t: any) => ({ id: t.id, serviceType: t.service_type, amount: safeNumber(t.total_amount), fee: safeNumber(t.service_fee), commission: safeNumber(t.portal_commission), status: t.status, createdAt: t.created_at })) };
    }
    case "get_audit_status": {
      const { data, error } = await supabase.from("audit_runs").select("id,audit_score,status,total_findings,critical_count,created_at,audit_findings(description,severity,field_name)").order("created_at", { ascending: false }).limit(1).maybeSingle(); if (error) return { error: error.message }; if (!data) return { status: "NO_AUDIT_RUN", message: "No self-audit run is recorded yet." }; return { audit: { id: (data as any).id, score: safeNumber((data as any).audit_score), status: (data as any).status, findings: safeNumber((data as any).total_findings), critical: safeNumber((data as any).critical_count), createdAt: (data as any).created_at, details: ((data as any).audit_findings ?? []).slice(0, 15) } };
    }
    case "get_whatsapp_status": { const health = await checkWhatsAppHealth(); return { provider: health.provider, configured: health.configured, connected: health.connected, status: health.status, error: health.error || null, code: health.code || null, details: health.details || {} }; }
    case "get_learning_workflows": { const { data, error } = await supabase.from("ai_workflow_versions").select("workflow_key,name,version,risk,status,confidence,instruction,evidence,updated_at").eq("user_id", userId).in("status", ["active", "draft"]).order("updated_at", { ascending: false }).limit(50); if (error) return { workflows: [], error: error.message }; return { workflows: data ?? [] }; }
    default: return { error: `Unknown tool: ${call.name}` };
  }
}

function normalizeHistory(history: AgentHistoryItem[] | undefined): AgentHistoryItem[] { return (Array.isArray(history) ? history : []).filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string").map((item) => ({ role: item.role, content: item.content.trim().slice(0, 4000) })).filter((item) => item.content).slice(-MAX_HISTORY); }
function getModelCandidates() { const configured = (process.env.GEMINI_MODEL || "").trim(); const deprecated = new Set(["gemini-2.0-flash", "gemini-2.0-flash-001", "gemini-1.5-flash", "gemini-1.5-pro"]); const defaults = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"]; return Array.from(new Set([configured, ...defaults].filter((model) => model && !deprecated.has(model)))); }
async function callGemini(apiKey: string, model: string, body: Record<string, unknown>) { const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) }); const data = await response.json().catch(() => ({})); return { ok: response.ok, data, error: data?.error?.message || `${model}: ${response.status} ${response.statusText}` }; }

export async function runIntelligentAgent({ apiKey, message, history, systemInstruction, supabase, userId }: { apiKey: string; message: string; history?: AgentHistoryItem[]; systemInstruction: string; supabase: SupabaseClient<any, any, any>; userId: string; }) {
  const safeHistory = normalizeHistory(history).filter((item) => item.content !== message.trim());
  const contents: any[] = safeHistory.map((item) => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] }));
  contents.push({ role: "user", parts: [{ text: message }] });
  const tools = [{ functionDeclarations: TOOL_DECLARATIONS }];
  const baseBody = { systemInstruction: { parts: [{ text: `${systemInstruction}\n\nYou are an agent, not just a chatbot. Prefer verified Cafe-EPR tools for live facts. Use the minimum tools necessary. You may call multiple independent tools in one turn. Never expose hidden chain-of-thought; give a concise evidence/reasoning summary instead. If a tool returns an error or no data, say that clearly. Never invent missing values.\n\nCurrent India date: ${indiaDate()}.` }] }, tools, generationConfig: { maxOutputTokens: 1800 } };
  let lastError = "Cafe AI request failed"; const usedTools: string[] = []; let finalData: any = null;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    let result: { ok: boolean; data: any; error: string } | null = null;
    for (const model of getModelCandidates()) { try { result = await callGemini(apiKey, model, { ...baseBody, contents }); if (result.ok) break; lastError = result.error; } catch (error) { lastError = error instanceof Error ? error.message : lastError; } }
    if (!result?.ok) throw new Error(lastError);
    finalData = result.data;
    const parts: GeminiPart[] = finalData?.candidates?.[0]?.content?.parts || [];
    const calls: ToolCall[] = parts.filter((p) => p.functionCall?.name).map((p) => ({ name: p.functionCall!.name, args: p.functionCall!.args || {}, id: p.functionCall!.id }));
    if (!calls.length) { const text = parts.map((p) => p.text).filter(Boolean).join("\n").trim(); return { message: text || "I understood the request, but I could not produce a response.", usedTools, rounds: round + 1, finishReason: finalData?.candidates?.[0]?.finishReason || null }; }
    contents.push({ role: "model", parts });
    const toolResponses = await Promise.all(calls.map(async (call) => { usedTools.push(call.name); try { return { functionResponse: { name: call.name, call_id: call.id, response: await executeTool(call, { supabase, userId }) } }; } catch (error) { return { functionResponse: { name: call.name, call_id: call.id, response: { error: error instanceof Error ? error.message : "Tool failed" } } }; } }));
    contents.push({ role: "user", parts: toolResponses });
  }
  const fallback = finalData?.candidates?.[0]?.content?.parts?.map((p: GeminiPart) => p.text).filter(Boolean).join("\n").trim();
  return { message: fallback || "I could not complete the requested analysis within the safe tool limit.", usedTools, rounds: MAX_TOOL_ROUNDS, finishReason: finalData?.candidates?.[0]?.finishReason || null };
}
