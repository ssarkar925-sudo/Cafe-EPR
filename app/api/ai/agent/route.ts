import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { CAFE_AI_SYSTEM_INSTRUCTIONS, DEFAULT_AGENT_PERMISSIONS } from "@/lib/ai/agent-policy";
import { runIntelligentAgent, type AgentHistoryItem } from "@/lib/ai/agent-runtime";
import { normalizeGeminiModel } from "@/lib/ai/multi-provider-engine";
import { buildSaiLanguageContext, SAI_RESPONSE_RULES } from "@/lib/sai/cognition/language";

export const dynamic = "force-dynamic";

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
    const surface = body?.surface === "sai" ? "sai" : "legacy";
    if (message.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ error: "Message is too long" }, { status: 413 });

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });


    // All queries go to the real LLM with tools — no regex shortcuts.
    // The LLM calls get_business_snapshot, search_catalog, search_customer, etc. to reason over live data.

    // Load dynamic AI provider configuration from database (Gemini, OpenAI, Claude, Groq, OpenRouter)
    let activeProvider: any = "gemini";
    let activeModel = "gemini-3.8-flash";
    let apiKey = "";
    let endpointUrl = "";

    // 1. Try reading from settings.ai_config (authoritative resilient store)
    try {
      const { data: stData } = await supabase
        .from("settings")
        .select("ai_config")
        .limit(1)
        .maybeSingle();

      if (stData?.ai_config) {
        const conf = stData.ai_config;
        if (conf.active_provider) activeProvider = conf.active_provider;
        if (conf.model_name) activeModel = conf.model_name;
        if (conf.endpoint_url) endpointUrl = conf.endpoint_url;
        if (conf.keys?.[activeProvider]) apiKey = conf.keys[activeProvider];
      }
    } catch {
      // Fallback
    }

    // 2. Also check ai_provider_configs table if key is still missing
    if (!apiKey) {
      try {
        const { data: provConfig } = await supabase
          .from("ai_provider_configs")
          .select("active_provider, model_name, api_key, endpoint_url")
          .eq("id", "default")
          .maybeSingle();

        if (provConfig) {
          if (!activeProvider || activeProvider === "gemini") activeProvider = provConfig.active_provider || "gemini";
          if (!activeModel || activeModel === "gemini-2.5-pro") activeModel = provConfig.model_name || "gemini-2.5-pro";
          if (provConfig.api_key && provConfig.api_key.trim().length > 5) {
            apiKey = provConfig.api_key.trim();
          }
          if (!endpointUrl) endpointUrl = provConfig.endpoint_url || "";
        }
      } catch {
        // Fallback cleanly to env variables
      }
    }

    // Fallbacks if database key is empty
    if (!apiKey) {
      if (activeProvider === "openai") apiKey = process.env.OPENAI_API_KEY || "";
      else if (activeProvider === "anthropic") apiKey = process.env.ANTHROPIC_API_KEY || "";
      else if (activeProvider === "groq") apiKey = process.env.GROQ_API_KEY || "";
      else if (activeProvider === "openrouter") apiKey = process.env.OPENROUTER_API_KEY || "";
      else apiKey = process.env.GEMINI_API_KEY || "";
    }

    const [{ data: memories }, { data: workflows }, { data: dbHistory }] = await Promise.all([
      supabase.from("ai_memories").select("category,memory_key,memory_value,confidence").eq("user_id", auth.user.id).eq("active", true).order("updated_at", { ascending: false }).limit(100),
      supabase.from("ai_workflow_versions").select("workflow_key,name,instruction").eq("user_id", auth.user.id).eq("status", "active").limit(25),
      // Cross-session memory: load last 12 conversation turns from DB
      supabase.from("ai_conversations").select("role,content,created_at").eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(12).then(r => ({ data: (r.data || []).reverse() })),
    ]);

    const memoryContext = (memories || []).map((m: any) => `- [${m.category}] ${m.memory_key}: ${JSON.stringify(m.memory_value)}`).join("\n") || "No owner memory has been stored yet.";
    const workflowContext = (workflows || []).map((w: any) => `- [Workflow ${w.workflow_key}] ${w.name}: ${w.instruction}`).join("\n") || "No learned workflows active.";

    // Merge DB history with in-tab history — DB provides cross-session context, in-tab is current session
    const inTabHistory = normalizeHistory(body?.history);
    const dbTurns: AgentHistoryItem[] = (dbHistory || []).map((r: any) => ({ role: r.role as "user" | "assistant", content: String(r.content) }));
    // Prefer in-tab history for recency; use DB turns only if in-tab is short (new session)
    const mergedHistory = inTabHistory.length >= 4 ? inTabHistory : [...dbTurns.slice(-8), ...inTabHistory].slice(-MAX_HISTORY_ITEMS);

    if (activeProvider === "gemini") activeModel = normalizeGeminiModel(activeModel);
    const { language, instruction: languageInstruction } = buildSaiLanguageContext(message);
    const fallbackMessage = surface !== "sai"
      ? undefined
      : language === "bn"
        ? "SAI প্রস্তুত, স্যার। আমি আপনার CafeERP ব্যবসায়িক সহকারী। এই স্ক্রিন, আপনার দোকান, গ্রাহক, লেনদেন বা এখন কী নজরে রাখা দরকার—যেকোনো কিছু জিজ্ঞাসা করুন।"
        : language === "hi"
          ? "SAI तैयार है, Sir। मैं आपकी CafeERP बिज़नेस असिस्टेंट हूँ। इस स्क्रीन, आपकी दुकान, ग्राहकों, लेन-देन या अभी किस चीज़ पर ध्यान देना है—कुछ भी पूछिए।"
          : "SAI is ready, Sir. I’m your CafeERP business assistant. Ask me about this screen, your shop, customers, transactions, or what needs attention.";

    const systemInstruction = `${CAFE_AI_SYSTEM_INSTRUCTIONS}\n\n${SAI_RESPONSE_RULES}\n\n${languageInstruction}\n\nSurface: ${surface}. On the SAI surface, never use legacy “Cafe AI Agent” wording or imply that the user is talking to a separate legacy assistant.\n\nOwner learned memory:\n${memoryContext}\n\nLearned shop workflows:\n${workflowContext}\n\nCurrent application permission profile:\n${JSON.stringify(DEFAULT_AGENT_PERMISSIONS)}\n\nCritical operational rules:\n1. ALWAYS use your tools before answering questions about sales, profit, stock, customers, or money. Never answer these from your own knowledge.\n2. When the user teaches a rule, preference, price, or fact, ALWAYS call save_memory immediately.\n3. For sales or billing requests, prepare the sale with prepare_sale and submit for owner approval.\n4. Never claim a financial record was created or modified unless confirmed by a tool.\n5. You have cross-session memory — refer to past conversations naturally when relevant.`;

    const result = await runIntelligentAgent({
      apiKey,
      provider: activeProvider,
      model: activeModel,
      baseUrl: endpointUrl || undefined,
      message,
      history: mergedHistory,
      systemInstruction,
      supabase,
      userId: auth.user.id,
      language,
      fallbackMessage,
    });

    // Save this turn to DB for future cross-session recall (fire-and-forget, don't block response)
    Promise.all([
      supabase.from("ai_conversations").insert({ user_id: auth.user.id, role: "user", content: message.slice(0, 4000) }),
      supabase.from("ai_conversations").insert({ user_id: auth.user.id, role: "assistant", content: result.message.slice(0, 4000) }),
    ]).catch(() => { /* Non-critical — don't fail the response */ });

    return NextResponse.json({
      message: result.message,
      mode: "agentic",
      canExecute: false,
      approvalRequired: Boolean((result as any).approval),
      approval: (result as any).approval || null,
      toolsUsed: result.usedTools,
      rounds: result.rounds,
      finishReason: result.finishReason,
    });
  } catch (error) {
    console.error("Cafe AI agent failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cafe AI Agent failed" }, { status: 502 });
  }
}
