/**
 * Universal Multi-Provider AI Engine for CafeERP
 * Supports: Google Gemini, OpenAI, Anthropic Claude, Groq, and OpenRouter.
 */

export type AIProviderId = "gemini" | "openai" | "anthropic" | "groq" | "openrouter";

export interface AIProviderConfig {
  provider: AIProviderId;
  model: string;
  apiKey: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  fallbackEnabled?: boolean;
}

export interface UniversalToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface UniversalToolCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

export interface UniversalCompletionResult {
  text: string;
  toolCalls: UniversalToolCall[];
  raw?: unknown;
  model: string;
  provider: AIProviderId;
}

export const PROVIDER_CATALOG: Record<
  AIProviderId,
  {
    name: string;
    description: string;
    defaultModel: string;
    models: { id: string; name: string; tag?: string }[];
    badge: string;
    icon: string;
  }
> = {
  gemini: {
    name: "Google Gemini",
    description: "High speed, ultra-large context, deep multimodal reasoning, and native tool execution.",
    defaultModel: "gemini-3.8-flash",
    models: [
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", tag: "Current Stable • Fast • Agentic" },
      { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash", tag: "Current Stable • Speed" },
      { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", tag: "Current Stable • Fast" },
      { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", tag: "Current Stable • Agentic" },
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", tag: "Current Preview • Deep Reasoning" },
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite", tag: "Current Stable • Cost Efficient" },
    ],
    badge: "Google Cloud",
    icon: "✨",
  },
  openai: {
    name: "OpenAI",
    description: "State-of-the-art enterprise intelligence, deep complex reasoning, and precise structured outputs.",
    defaultModel: "gpt-4o",
    models: [
      { id: "gpt-4o", name: "GPT-4o (Omni)", tag: "Premier Flagship" },
      { id: "o1", name: "o1 (High Reasoning)", tag: "Deep Problem Solving" },
      { id: "o3-mini", name: "o3-mini", tag: "Next-Gen STEM & Math" },
      { id: "gpt-5-luna", name: "GPT-5.6 / Luna", tag: "Next-Gen Frontier" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", tag: "Fast & Economical" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", tag: "Legacy Enterprise" },
    ],
    badge: "OpenAI",
    icon: "🧠",
  },
  anthropic: {
    name: "Anthropic Claude",
    description: "Nuanced enterprise instruction-following, superior coding, hybrid reasoning, and business analysis.",
    defaultModel: "claude-3-7-sonnet-20250219",
    models: [
      { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet", tag: "Hybrid Reasoning (Latest)" },
      { id: "claude-3-5-sonnet-latest", name: "Claude 3.5 Sonnet", tag: "Best Intelligence" },
      { id: "claude-3-opus-latest", name: "Claude 3 Opus", tag: "Complex Analysis" },
      { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku", tag: "High Speed" },
    ],
    badge: "Anthropic",
    icon: "⚡",
  },
  groq: {
    name: "Groq LPU",
    description: "Ultra-low latency (<500ms) hardware-accelerated inference for instant counter billing and POS.",
    defaultModel: "llama-3.3-70b-versatile",
    models: [
      { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 (Llama 70B)", tag: "Reasoning LPU" },
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile", tag: "Flagship Speed" },
      { id: "qwen-2.5-32b", name: "Qwen 2.5 32B", tag: "Multilingual LPU" },
      { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", tag: "High Context" },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant", tag: "Sub-Second" },
    ],
    badge: "Groq Cloud",
    icon: "🚀",
  },
  openrouter: {
    name: "OpenRouter",
    description: "Universal unified gateway to the world's most powerful frontier, open-source, and specialized models.",
    defaultModel: "anthropic/claude-3.7-sonnet",
    models: [
      { id: "anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet (Hybrid Reasoning)", tag: "Latest Frontier" },
      { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", tag: "Top Intelligence" },
      { id: "openai/gpt-4o", name: "GPT-4o (OpenRouter)", tag: "Premier OpenAI" },
      { id: "openai/gpt-5-luna", name: "GPT-5.6 Luna / 5.4", tag: "Next-Gen Luna Series" },
      { id: "deepseek/deepseek-r1", name: "DeepSeek R1 (Full 671B)", tag: "Open Frontier Reasoning" },
      { id: "deepseek/deepseek-chat", name: "DeepSeek V3", tag: "Top-Tier Value" },
      { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", tag: "Open Weights" },
      { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash (OpenRouter)", tag: "High Throughput" },
    ],
    badge: "OpenRouter",
    icon: "🌐",
  },
};

const TRANSIENT_PROVIDER_STATUSES = new Set([429, 502, 503, 504]);

function getProviderRetryDelay(response: Response): number | null {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) return 400;

  const seconds = Number(retryAfter);
  const requestedDelay = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(retryAfter) - Date.now();
  return Number.isFinite(requestedDelay) && requestedDelay >= 0 && requestedDelay <= 1500
    ? requestedDelay
    : null;
}

async function postProviderJson(endpoint: string, init: RequestInit, provider: string): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        ...init,
        signal: AbortSignal.timeout(35_000),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new Error(`${provider} request timed out. Please try again.`);
      }
      throw error;
    }

    const responseBody = await response.text().catch(() => "");
    let data: any = null;
    if (responseBody.trim()) {
      try {
        data = JSON.parse(responseBody);
      } catch {
        if (response.ok) {
          throw new Error(`${provider} returned an invalid response (HTTP ${response.status}). Please try again.`);
        }
      }
    }

    if (response.ok) {
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error(`${provider} returned an empty response (HTTP ${response.status}). Please try again.`);
      }
      return data;
    }

    const transient = TRANSIENT_PROVIDER_STATUSES.has(response.status);
    if (transient && attempt === 0) {
      const retryDelay = getProviderRetryDelay(response);
      if (retryDelay !== null) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }
    }

    const providerMessage =
      typeof data?.error?.message === "string"
        ? data.error.message
        : typeof data?.message === "string"
          ? data.message
          : null;
    if (transient) {
      throw new Error(providerMessage || `${provider} is temporarily unavailable (HTTP ${response.status}). Please try again shortly.`);
    }
    throw new Error(providerMessage || `${provider} call failed (HTTP ${response.status}).`);
  }

  throw new Error(`${provider} request failed after a transient retry.`);
}

export function normalizeGeminiModel(model?: string | null): string {
  const requested = String(model || "").trim();
  const deprecated = new Set([
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash-lite-001",
  ]);
  return !requested || deprecated.has(requested) ? "gemini-3.8-flash" : requested;
}

/**
 * Executes a round of completion with tool-calling across any configured provider.
 */
export async function executeUniversalModelCall({
  config,
  systemInstruction,
  contents,
  tools,
}: {
  config: AIProviderConfig;
  systemInstruction: string;
  contents: { role: "user" | "model" | "assistant"; parts: any[] }[];
  tools: UniversalToolDeclaration[];
}): Promise<UniversalCompletionResult> {
  const provider = config.provider || "gemini";
  const rawModel = config.model || PROVIDER_CATALOG[provider]?.defaultModel || "gemini-3.8-flash";
  const model = provider === "gemini" ? normalizeGeminiModel(rawModel) : rawModel;

  switch (provider) {
    case "gemini":
      return callGeminiProvider(config.apiKey, model, systemInstruction, contents, tools, config.baseUrl);
    case "openai":
    case "groq":
    case "openrouter":
      return callOpenAICompatibleProvider(provider, config.apiKey, model, systemInstruction, contents, tools, config.baseUrl);
    case "anthropic":
      return callAnthropicProvider(config.apiKey, model, systemInstruction, contents, tools, config.baseUrl);
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

/**
 * 1. Google Gemini Native Implementation
 */
async function callGeminiProvider(
  apiKey: string,
  model: string,
  systemInstruction: string,
  contents: { role: string; parts: any[] }[],
  tools: UniversalToolDeclaration[],
  baseUrl?: string
): Promise<UniversalCompletionResult> {
  const url = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(model)}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const geminiContents = contents.map((c) => ({
    role: c.role === "assistant" ? "model" : c.role,
    parts: c.parts,
  }));

  const payload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: geminiContents,
    tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
    generationConfig: { maxOutputTokens: 2048, temperature: 0.2 },
  };

  const data = await postProviderJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(payload),
  }, "Gemini");

  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const text = parts.map((p: any) => p.text).filter(Boolean).join("\n").trim();
  const toolCalls: UniversalToolCall[] = parts
    .filter((p: any) => p.functionCall?.name)
    .map((p: any) => ({
      name: p.functionCall.name,
      args: p.functionCall.args || {},
      id: p.functionCall.id,
    }));

  if (!text && toolCalls.length === 0) {
    const finishReason = candidate?.finishReason ? ` (finish reason: ${candidate.finishReason})` : "";
    throw new Error(`Gemini returned no response content${finishReason}. Check the selected model and Gemini API configuration.`);
  }

  return { text, toolCalls, raw: data, model, provider: "gemini" };
}

/**
 * 2. OpenAI / Groq / OpenRouter Implementation (OpenAI-compatible chat completions)
 */
async function callOpenAICompatibleProvider(
  provider: "openai" | "groq" | "openrouter",
  apiKey: string,
  model: string,
  systemInstruction: string,
  contents: { role: string; parts: any[] }[],
  tools: UniversalToolDeclaration[],
  customBaseUrl?: string
): Promise<UniversalCompletionResult> {
  let endpoint = "https://api.openai.com/v1/chat/completions";
  if (provider === "groq") endpoint = "https://api.groq.com/openai/v1/chat/completions";
  if (provider === "openrouter") endpoint = "https://openrouter.ai/api/v1/chat/completions";
  if (customBaseUrl) endpoint = `${customBaseUrl.replace(/\/$/, "")}/chat/completions`;

  // Translate contents to OpenAI messages array
  const messages: any[] = [{ role: "system", content: systemInstruction }];

  for (const c of contents) {
    const role = c.role === "model" ? "assistant" : c.role === "system" ? "system" : "user";
    // Check if there are tool responses
    const functionResponsePart = c.parts.find((p) => p.functionResponse);
    if (functionResponsePart) {
      messages.push({
        role: "tool",
        tool_call_id: functionResponsePart.functionResponse.id || functionResponsePart.functionResponse.name,
        name: functionResponsePart.functionResponse.name,
        content: JSON.stringify(functionResponsePart.functionResponse.response),
      });
      continue;
    }

    const textPart = c.parts.map((p) => p.text).filter(Boolean).join("\n");
    const funcCallPart = c.parts.find((p) => p.functionCall);

    if (funcCallPart) {
      messages.push({
        role: "assistant",
        content: textPart || null,
        tool_calls: [
          {
            id: funcCallPart.functionCall.id || funcCallPart.functionCall.name,
            type: "function",
            function: {
              name: funcCallPart.functionCall.name,
              arguments: JSON.stringify(funcCallPart.functionCall.args || {}),
            },
          },
        ],
      });
    } else {
      messages.push({ role, content: textPart || "" });
    }
  }

  const openAiTools = tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://cafeerp.ssarkar925.workers.dev";
    headers["X-Title"] = "CafeERP AI";
  }

  const data = await postProviderJson(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      tools: openAiTools.length > 0 ? openAiTools : undefined,
      temperature: 0.2,
      max_tokens: 2048,
    }),
  }, provider);

  const choice = data?.choices?.[0]?.message;
  const text = choice?.content || "";
  const toolCalls: UniversalToolCall[] = (choice?.tool_calls || []).map((tc: any) => {
    let parsedArgs = {};
    try {
      parsedArgs = JSON.parse(tc.function?.arguments || "{}");
    } catch {}
    return {
      name: tc.function?.name,
      args: parsedArgs,
      id: tc.id,
    };
  });

  return { text, toolCalls, raw: data, model, provider };
}

/**
 * 3. Anthropic Claude Implementation
 */
async function callAnthropicProvider(
  apiKey: string,
  model: string,
  systemInstruction: string,
  contents: { role: string; parts: any[] }[],
  tools: UniversalToolDeclaration[],
  customBaseUrl?: string
): Promise<UniversalCompletionResult> {
  const endpoint = customBaseUrl
    ? `${customBaseUrl.replace(/\/$/, "")}/messages`
    : "https://api.anthropic.com/v1/messages";

  const anthropicMessages: any[] = [];
  for (const c of contents) {
    const role = c.role === "model" || c.role === "assistant" ? "assistant" : "user";
    const textPart = c.parts.map((p) => p.text).filter(Boolean).join("\n");
    if (textPart) anthropicMessages.push({ role, content: textPart });
  }

  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  const data = await postProviderJson(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: systemInstruction,
      messages: anthropicMessages,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      max_tokens: 2048,
    }),
  }, "Anthropic");

  const textBlocks = (data?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  const toolCalls: UniversalToolCall[] = (data?.content || [])
    .filter((b: any) => b.type === "tool_use")
    .map((b: any) => ({
      name: b.name,
      args: b.input || {},
      id: b.id,
    }));

  return { text: textBlocks, toolCalls, raw: data, model, provider: "anthropic" };
}
