import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { executeUniversalModelCall, normalizeGeminiModel, type AIProviderId, type UniversalToolDeclaration } from "@/lib/ai/multi-provider-engine";
import { detectSaiLanguage, saiLanguageInstruction, SAI_RESPONSE_RULES } from "./language";
import { loadSaiWorldState } from "@/lib/sai/core/world-state";
import { runSaiInstruction } from "./runtime";
import { createSaiTraceId, recordSaiTrace } from "@/lib/sai/core/trace";
import { listSaiCapabilityDescriptors } from "@/lib/sai/core/capabilities";
import type { SaiActor, SaiLanguage } from "@/lib/sai/core/types";

type ChatHistoryItem = { role: "user" | "assistant"; content: string };
type ProviderConfig = { provider: AIProviderId; model: string; apiKey: string; endpointUrl?: string };

const MAX_HISTORY = 10;
const MAX_MESSAGE_LENGTH = 8000;

const SAI_QUERY_TOOL: UniversalToolDeclaration = {
  name: "sai_query_erp",
  description: "Query live CafeERP business data through SAI Core. Use this for current customers, Khata, invoices, AEPS transactions, AEPS configuration, Portal Watcher, inventory, sales, or other live data. Read-only observation bridge.",
  parameters: {
    type: "object",
    properties: {
      instruction: { type: "string", description: "Precise live ERP question to investigate. Preserve important names and identifiers." },
    },
    required: ["instruction"],
  },
};

function normalizeHistory(history: unknown): ChatHistoryItem[] {
  return (Array.isArray(history) ? history : [])
    .filter((item): item is ChatHistoryItem => Boolean(item) && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .map((item) => ({ role: item.role, content: item.content.trim().slice(0, 4000) }))
    .filter((item) => item.content)
    .slice(-MAX_HISTORY);
}

async function resolveProviderConfig(supabase: Awaited<ReturnType<typeof createClient>>): Promise<ProviderConfig> {
  let provider: AIProviderId = "gemini";
  let model = "gemini-3.8-flash";
  let endpointUrl = "";
  const keys: Record<string, string> = {};

  try {
    const { data } = await supabase.from("settings").select("ai_config").limit(1).maybeSingle();
    const config = (data?.ai_config || {}) as { active_provider?: AIProviderId; model_name?: string; endpoint_url?: string; keys?: Record<string, string> };
    const validProviders = new Set<AIProviderId>(["gemini", "openai", "anthropic", "groq", "openrouter"]);
    if (config.active_provider && validProviders.has(config.active_provider)) provider = config.active_provider;
    if (config.model_name && typeof config.model_name === "string") model = config.model_name.trim();
    if (typeof config.endpoint_url === "string") endpointUrl = config.endpoint_url.trim();
    if (config.keys && typeof config.keys === "object") {
      for (const [name, key] of Object.entries(config.keys)) if (typeof key === "string" && key.trim()) keys[name] = key.trim();
    }
  } catch {}

  if (!keys.gemini && process.env.GEMINI_API_KEY) keys.gemini = process.env.GEMINI_API_KEY;
  if (!keys.openai && process.env.OPENAI_API_KEY) keys.openai = process.env.OPENAI_API_KEY;
  if (!keys.anthropic && process.env.ANTHROPIC_API_KEY) keys.anthropic = process.env.ANTHROPIC_API_KEY;
  if (!keys.groq && process.env.GROQ_API_KEY) keys.groq = process.env.GROQ_API_KEY;
  if (!keys.openrouter && process.env.OPENROUTER_API_KEY) keys.openrouter = process.env.OPENROUTER_API_KEY;
  if (provider === "gemini") model = normalizeGeminiModel(model);
  return { provider, model, apiKey: keys[provider] || "", endpointUrl };
}

function builtInAnswer(language: SaiLanguage, message: string): string | null {
  const value = message.trim();
  if (/^(who are you|what are you|tumi ke|তুমি কে|आप कौन|aap kaun|কে তুমি)$/i.test(value)) {
    if (language === "bn") return "আমি SAI — CafeERP-এর ব্যবসায়িক AI সহকারী। আমি আপনার বর্তমান স্ক্রিন, গ্রাহক, লেনদেন, AEPS, পোর্টাল এবং ব্যবসার ডেটা বুঝে তথ্য বের করতে এবং নিরাপদ কাজের পরিকল্পনা করতে পারি।";
    if (language === "hi") return "मैं SAI हूँ — CafeERP का बिज़नेस AI असिस्टेंट। मैं आपकी वर्तमान स्क्रीन, ग्राहक, लेन-देन, AEPS, पोर्टल और बिज़नेस डेटा को समझकर जानकारी निकालने और सुरक्षित काम की योजना बनाने में मदद करता हूँ।";
    return "I’m SAI — the CafeERP business AI assistant. I work with your current screen, customers, transactions, AEPS, portals, and business data, and I can investigate live information and prepare safe actions.";
  }
  if (/^(what can you do|how can you help|what do you do|কি করতে পারো|কি করতে পারেন|আপনি কী করতে পারেন|आप क्या कर सकते|क्या कर सकते हो)$/i.test(value)) {
    if (language === "bn") return "আমি গ্রাহক ও খাতা, AEPS লেনদেন, পোর্টাল ওয়াচার, ইনভেন্টরি, ব্যবসার বর্তমান অবস্থা এবং SAI-এর মনোযোগের বিষয়গুলো দেখাতে পারি। প্রয়োজন হলে অনুমোদন ও যাচাইসহ নিরাপদ কাজের পরিকল্পনাও তৈরি করি।";
    if (language === "hi") return "मैं ग्राहक और खाता, AEPS लेन-देन, पोर्टल वॉचर, इन्वेंटरी, बिज़नेस की वर्तमान स्थिति और SAI attention देख सकता हूँ। ज़रूरत होने पर approval और verification के साथ सुरक्षित action plan भी तैयार करता हूँ।";
    return "I can inspect customers and Khata, AEPS transactions, Portal Watcher activity, inventory, current business state, and SAI attention items. Consequential actions go through CafeERP approval and verification controls.";
  }
  return null;
}

function sanitizeCapabilities() {
  return listSaiCapabilityDescriptors().map((item) => ({ id: item.id, description: item.description, domain: item.domain, kind: item.kind, risk: item.risk, requiresApproval: item.requiresApproval, mutates: item.mutates, verificationRequired: item.verificationRequired }));
}

async function callSaiModel(config: ProviderConfig, systemInstruction: string, contents: { role: "user" | "model" | "assistant"; parts: any[] }[], actor: SaiActor, traceId: string) {
  if (!config.apiKey) throw new Error("SAI_MODEL_NOT_CONFIGURED: Configure an API key for the active provider in AI settings.");
  const model = config.provider === "gemini" ? normalizeGeminiModel(config.model) : config.model;
  const started = await recordSaiTrace({ traceId, actor, sequenceNo: 10, phase: "REASON", eventType: "chat.model.request", status: "started", operation: "sai_chat", message: "SAI model reasoning started", data: { provider: config.provider, model } });
  try {
    const result = await executeUniversalModelCall({ config: { provider: config.provider, model, apiKey: config.apiKey, baseUrl: config.endpointUrl || undefined }, systemInstruction, contents, tools: [SAI_QUERY_TOOL] });
    await recordSaiTrace({ traceId, actor, parentSpanId: started.spanId, sequenceNo: 11, phase: "REASON", eventType: "chat.model.response", status: "completed", operation: "sai_chat", message: "SAI model reasoning completed", data: { provider: result.provider, model: result.model, toolCallCount: result.toolCalls.length, responseLength: result.text.length } });
    return result;
  } catch (error) {
    await recordSaiTrace({ traceId, actor, parentSpanId: started.spanId, sequenceNo: 11, phase: "REASON", eventType: "chat.model.response", status: "failed", operation: "sai_chat", message: error instanceof Error ? error.message : "SAI model failed", data: { provider: config.provider, model } }).catch(() => undefined);
    throw error;
  }
}

export async function runSaiChat(input: { message: string; history?: unknown; route?: string; actor: SaiActor }) {
  const message = input.message.trim();
  if (!message) throw new Error("SAI_MESSAGE_REQUIRED");
  if (message.length > MAX_MESSAGE_LENGTH) throw new Error("SAI_MESSAGE_TOO_LONG");
  const actor = input.actor;
  const language = detectSaiLanguage(message);
  const traceId = createSaiTraceId("chat");
  await recordSaiTrace({ traceId, actor, sequenceNo: 0, phase: "OBSERVE", eventType: "chat.received", status: "started", operation: "sai_chat", message: "SAI chat turn received", data: { route: input.route || null, language, messageLength: message.length } });
  const supabase = await createClient();
  const world = await loadSaiWorldState(actor, input.route);
  const config = await resolveProviderConfig(supabase);

  const direct = builtInAnswer(language, message);
  if (direct) {
    await recordSaiTrace({ traceId, actor, sequenceNo: 90, phase: "REMEMBER", eventType: "chat.response", status: "completed", operation: "sai_chat", message: "SAI returned a deterministic identity/help response", data: { language, responseLength: direct.length } });
    return { message: direct, language, traceId, usedCapabilities: [], liveDataUsed: false };
  }

  const worldContext = { observedAt: world.observedAt, route: world.route || null, activeModule: world.activeModule || null, customer: world.customer || null, transaction: world.transaction || null, attention: world.attention.slice(0, 20), facts: world.facts };
  const systemPrompt = [
    "You are SAI, the first-party intelligence layer of CafeERP.",
    SAI_RESPONSE_RULES,
    saiLanguageInstruction(language),
    "CafeERP domain engines and authenticated database state are authoritative. Never invent live business values.",
    "When current ERP data is required, call sai_query_erp rather than guessing.",
    "sai_query_erp is read-only observation through the SAI Core. Its result is evidence-backed and may be incomplete.",
    "Never claim a write, payment, approval, configuration change, or completed action unless the verified SAI execution result says so.",
    "CURRENT WORLD STATE: " + JSON.stringify(worldContext),
    "REGISTERED CAPABILITIES: " + JSON.stringify(sanitizeCapabilities()),
  ].join("\n\n");

  const history = normalizeHistory(input.history);
  const contents: { role: "user" | "model" | "assistant"; parts: any[] }[] = history.map((item) => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] }));
  contents.push({ role: "user", parts: [{ text: message }] });

  const usedCapabilities: string[] = [];
  let liveDataUsed = false;
  let result = await callSaiModel(config, systemPrompt, contents, actor, traceId);

  if (result.toolCalls.length) {
    for (const toolCall of result.toolCalls.slice(0, 3)) {
      if (toolCall.name !== SAI_QUERY_TOOL.name) continue;
      const instruction = typeof toolCall.args?.instruction === "string" && toolCall.args.instruction.trim() ? toolCall.args.instruction.trim() : message;
      const execution = await runSaiInstruction({ instruction, actor, route: input.route });
      for (const resultItem of execution.results) if ((resultItem.evidenceIds || []).length) liveDataUsed = true;
      for (const step of execution.plan.steps) usedCapabilities.push(step.capability);
      contents.push({
        role: "user",
        parts: [{
          text:
            "LIVE SAI CORE OBSERVATION (authoritative; do not invent beyond it):\n" +
            JSON.stringify({
              plan: execution.plan,
              results: execution.results,
              blockedSteps: execution.blockedSteps,
              traceId: execution.traceId,
            }),
        }],
      });
    }
    result = await callSaiModel(config, systemPrompt, contents, actor, traceId);
  }

  const responseText = result.text.trim();
  if (!responseText) throw new Error("SAI_EMPTY_MODEL_RESPONSE: The active provider returned no usable answer.");
  await recordSaiTrace({ traceId, actor, sequenceNo: 90, phase: "REMEMBER", eventType: "chat.response", status: "completed", operation: "sai_chat", message: "SAI chat turn completed", data: { language, responseLength: responseText.length, usedCapabilities: [...new Set(usedCapabilities)], liveDataUsed } });
  return { message: responseText, language, traceId, usedCapabilities: [...new Set(usedCapabilities)], liveDataUsed };
}

export async function assertSaiChatActor(): Promise<SaiActor> {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) throw new Error("Unauthorized");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Unauthorized");
  return { userId: auth.user.id, businessId: auth.user.id, role: role as string };
}