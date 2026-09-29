import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRole, hasRole } from "@/lib/authz";
import { PROVIDER_CATALOG, normalizeGeminiModel, type AIProviderId } from "@/lib/ai/multi-provider-engine";

export const dynamic = "force-dynamic";

interface StoredAIConfig {
  active_provider?: AIProviderId;
  model_name?: string;
  endpoint_url?: string;
  fallback_enabled?: boolean;
  keys?: Record<string, string>;
  updated_at?: string;
}

function maskApiKey(key?: string | null): string {
  if (!key || key.length < 6) return "";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

export async function GET() {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let db: any = null;
    try {
      db = createAdminClient();
    } catch {}
    const userClient = await createClient();
    const client = db || userClient;

    let activeProvider: AIProviderId = "gemini";
    let activeModel = PROVIDER_CATALOG.gemini.defaultModel;
    let endpointUrl = "";
    let fallbackEnabled = true;
    let updatedAt: string | null = null;
    const providerKeys: Record<string, string> = {};

    // 1. Try reading from ai_provider_configs table
    try {
      const { data: tableData, error: tableError } = await client
        .from("ai_provider_configs")
        .select("*")
        .eq("id", "default")
        .maybeSingle();

      if (!tableError && tableData) {
        activeProvider = (tableData.active_provider as AIProviderId) || activeProvider;
        activeModel = tableData.model_name || PROVIDER_CATALOG[activeProvider]?.defaultModel || activeModel;
        if (activeProvider === "gemini") activeModel = normalizeGeminiModel(activeModel);
        endpointUrl = tableData.endpoint_url || "";
        fallbackEnabled = tableData.fallback_enabled ?? true;
        updatedAt = tableData.updated_at || null;
        if (tableData.api_key) {
          providerKeys[activeProvider] = tableData.api_key;
        }
      }
    } catch {
      // Table may not exist yet in schema cache
    }

    // 2. Read from settings.ai_config JSONB column (universal resilient store)
    try {
      const { data: settingsData } = await client
        .from("settings")
        .select("ai_config")
        .limit(1)
        .maybeSingle();

      const aiConfig = (settingsData?.ai_config || {}) as StoredAIConfig;
      if (aiConfig.active_provider) activeProvider = aiConfig.active_provider;
      if (aiConfig.model_name) activeModel = aiConfig.model_name;
      if (activeProvider === "gemini") activeModel = normalizeGeminiModel(activeModel);
      if (aiConfig.endpoint_url !== undefined) endpointUrl = aiConfig.endpoint_url;
      if (aiConfig.fallback_enabled !== undefined) fallbackEnabled = aiConfig.fallback_enabled;
      if (aiConfig.updated_at) updatedAt = aiConfig.updated_at;

      if (aiConfig.keys && typeof aiConfig.keys === "object") {
        for (const [p, k] of Object.entries(aiConfig.keys)) {
          if (k && !providerKeys[p]) {
            providerKeys[p] = k;
          }
        }
      }
    } catch {
      // Fallback cleanly
    }

    // Environment key fallbacks
    if (!providerKeys.gemini && process.env.GEMINI_API_KEY) providerKeys.gemini = process.env.GEMINI_API_KEY;
    if (!providerKeys.openai && process.env.OPENAI_API_KEY) providerKeys.openai = process.env.OPENAI_API_KEY;
    if (!providerKeys.anthropic && process.env.ANTHROPIC_API_KEY) providerKeys.anthropic = process.env.ANTHROPIC_API_KEY;
    if (!providerKeys.groq && process.env.GROQ_API_KEY) providerKeys.groq = process.env.GROQ_API_KEY;
    if (!providerKeys.openrouter && process.env.OPENROUTER_API_KEY) providerKeys.openrouter = process.env.OPENROUTER_API_KEY;

    // Build masked representations for safe UI display
    const maskedKeys: Record<string, string> = {};
    for (const p of Object.keys(PROVIDER_CATALOG)) {
      maskedKeys[p] = maskApiKey(providerKeys[p]);
    }

    const currentKey = providerKeys[activeProvider] || "";
    const hasKey = Boolean(currentKey && currentKey.length > 5);
    const maskedKey = maskApiKey(currentKey);

    return NextResponse.json({
      provider: activeProvider,
      model: activeModel,
      hasKey,
      maskedKey,
      maskedKeys,
      endpointUrl,
      temperature: 0.2,
      fallbackEnabled,
      updatedAt,
      providers: PROVIDER_CATALOG,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load AI provider config" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const provider: AIProviderId = body?.provider || "gemini";
    let model = (body?.model || PROVIDER_CATALOG[provider]?.defaultModel || PROVIDER_CATALOG.gemini.defaultModel).trim();
    if (provider === "gemini") model = normalizeGeminiModel(model);
    const newApiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
    const endpointUrl = typeof body?.endpointUrl === "string" ? body.endpointUrl.trim() : "";
    const fallbackEnabled = body?.fallbackEnabled !== false;

    if (!PROVIDER_CATALOG[provider]) {
      return NextResponse.json({ error: "Invalid provider specified" }, { status: 400 });
    }

    let db: any = null;
    try {
      db = createAdminClient();
    } catch {}
    const userClient = await createClient();
    const client = db || userClient;

    // Load existing keys map from settings.ai_config
    let existingKeys: Record<string, string> = {};
    try {
      const { data: stRow } = await client.from("settings").select("ai_config").limit(1).maybeSingle();
      if (stRow?.ai_config?.keys && typeof stRow.ai_config.keys === "object") {
        existingKeys = { ...stRow.ai_config.keys };
      }
    } catch {}

    // Determine final key for this provider
    let finalKeyForProvider = newApiKey;
    if (!finalKeyForProvider) {
      finalKeyForProvider = existingKeys[provider] || "";
      if (!finalKeyForProvider) {
        // Check ai_provider_configs table
        try {
          const { data: existingTable } = await client
            .from("ai_provider_configs")
            .select("api_key")
            .eq("id", "default")
            .maybeSingle();
          if (existingTable?.api_key) finalKeyForProvider = existingTable.api_key;
        } catch {}
      }
    }

    if (finalKeyForProvider) {
      existingKeys[provider] = finalKeyForProvider;
    }

    const now = new Date().toISOString();
    const updatedAiConfig: StoredAIConfig = {
      active_provider: provider,
      model_name: model,
      endpoint_url: endpointUrl,
      fallback_enabled: fallbackEnabled,
      keys: existingKeys,
      updated_at: now,
    };

    // 1. Persist to settings table (universal, guaranteed schema cache hit)
    let savedInSettings = false;
    try {
      const { error: setErr } = await client
        .from("settings")
        .update({
          ai_config: updatedAiConfig,
          updated_at: now,
        })
        .eq("id", 1);
      if (!setErr) savedInSettings = true;
    } catch {}

    if (!savedInSettings) {
      try {
        await userClient
          .from("settings")
          .update({
            ai_config: updatedAiConfig,
            updated_at: now,
          })
          .eq("id", 1);
      } catch {}
    }

    // 2. Also try persisting to ai_provider_configs table if available
    try {
      await client.from("ai_provider_configs").upsert({
        id: "default",
        active_provider: provider,
        model_name: model,
        api_key: finalKeyForProvider || null,
        endpoint_url: endpointUrl || null,
        fallback_enabled: fallbackEnabled,
        updated_at: now,
      });
    } catch {
      // Table may not yet exist, settings backup is authoritative
    }

    // Build maskedKeys
    const maskedKeys: Record<string, string> = {};
    for (const p of Object.keys(PROVIDER_CATALOG)) {
      maskedKeys[p] = maskApiKey(existingKeys[p]);
    }

    return NextResponse.json({
      success: true,
      provider,
      model,
      hasKey: Boolean(finalKeyForProvider && finalKeyForProvider.length > 5),
      maskedKey: maskApiKey(finalKeyForProvider),
      maskedKeys,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update AI provider config" },
      { status: 500 }
    );
  }
}
