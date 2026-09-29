import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import {
  executeUniversalModelCall,
  PROVIDER_CATALOG,
  type AIProviderId,
  normalizeGeminiModel,
} from "@/lib/ai/multi-provider-engine";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const provider: AIProviderId = body?.provider || "gemini";
    let model = (body?.model || PROVIDER_CATALOG[provider]?.defaultModel || "").trim();
    if (provider === "gemini") model = normalizeGeminiModel(model);
    let apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
    const endpointUrl = typeof body?.endpointUrl === "string" ? body.endpointUrl.trim() : "";

    // If apiKey is not provided in test payload, load saved key for this provider
    if (!apiKey) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const { createClient } = await import("@/lib/supabase/server");
        let db: any = null;
        try { db = createAdminClient(); } catch {}
        const userClient = await createClient();
        const client = db || userClient;

        // Check settings.ai_config
        const { data: stRow } = await client.from("settings").select("ai_config").limit(1).maybeSingle();
        if (stRow?.ai_config?.keys?.[provider]) {
          apiKey = stRow.ai_config.keys[provider];
        }

        // Check ai_provider_configs table
        if (!apiKey) {
          const { data: provRow } = await client.from("ai_provider_configs").select("api_key, active_provider").eq("id", "default").maybeSingle();
          if (provRow?.active_provider === provider && provRow?.api_key) {
            apiKey = provRow.api_key;
          }
        }
      } catch {}

      // Fallback to process.env
      if (!apiKey) {
        if (provider === "openai") apiKey = process.env.OPENAI_API_KEY || "";
        else if (provider === "anthropic") apiKey = process.env.ANTHROPIC_API_KEY || "";
        else if (provider === "groq") apiKey = process.env.GROQ_API_KEY || "";
        else if (provider === "openrouter") apiKey = process.env.OPENROUTER_API_KEY || "";
        else if (provider === "gemini") apiKey = process.env.GEMINI_API_KEY || "";
      }
    }

    if (!apiKey) {
      return NextResponse.json({ error: `No active API Key found for ${PROVIDER_CATALOG[provider]?.name || provider}. Please enter an API key above.` }, { status: 400 });
    }

    // Ping test prompt
    const result = await executeUniversalModelCall({
      config: {
        provider,
        model,
        apiKey,
        baseUrl: endpointUrl || undefined,
      },
      systemInstruction: "You are a test agent verifying backend connectivity. Respond with 'PONG' and the model name.",
      contents: [{ role: "user", parts: [{ text: "PING" }] }],
      tools: [],
    });

    const latencyMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      provider,
      model,
      reply: result.text.slice(0, 100),
      latencyMs,
    });
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Provider test failed",
        latencyMs,
      },
      { status: 400 }
    );
  }
}
