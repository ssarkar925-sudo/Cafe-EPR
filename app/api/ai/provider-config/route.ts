import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { PROVIDER_CATALOG, type AIProviderId } from "@/lib/ai/multi-provider-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ai_provider_configs")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    if (error && !error.message.includes("does not exist")) {
      console.warn("Failed to fetch ai_provider_configs:", error);
    }

    const provider: AIProviderId = (data?.active_provider as AIProviderId) || "gemini";
    const model = data?.model_name || PROVIDER_CATALOG[provider]?.defaultModel || "gemini-2.5-flash";
    const rawKey = data?.api_key || "";
    const hasKey = Boolean(rawKey && rawKey.length > 5);
    const maskedKey = hasKey
      ? `${rawKey.slice(0, 4)}••••••••${rawKey.slice(-4)}`
      : "";

    return NextResponse.json({
      provider,
      model,
      hasKey,
      maskedKey,
      endpointUrl: data?.endpoint_url || "",
      temperature: data?.temperature ?? 0.2,
      fallbackEnabled: data?.fallback_enabled ?? true,
      updatedAt: data?.updated_at || null,
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
    const model = (body?.model || PROVIDER_CATALOG[provider]?.defaultModel || "gemini-2.5-flash").trim();
    const newApiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
    const endpointUrl = typeof body?.endpointUrl === "string" ? body.endpointUrl.trim() : "";
    const fallbackEnabled = body?.fallbackEnabled !== false;

    if (!PROVIDER_CATALOG[provider]) {
      return NextResponse.json({ error: "Invalid provider specified" }, { status: 400 });
    }

    const supabase = await createClient();

    // Check if key is being updated or kept
    let finalKey = newApiKey;
    if (!finalKey) {
      const { data: existing } = await supabase
        .from("ai_provider_configs")
        .select("api_key")
        .eq("id", "default")
        .maybeSingle();
      finalKey = existing?.api_key || "";
    }

    const { error } = await supabase.from("ai_provider_configs").upsert({
      id: "default",
      active_provider: provider,
      model_name: model,
      api_key: finalKey || null,
      endpoint_url: endpointUrl || null,
      fallback_enabled: fallbackEnabled,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      // If table does not exist yet, fallback to saving in settings
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      provider,
      model,
      hasKey: Boolean(finalKey && finalKey.length > 5),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update AI provider config" },
      { status: 500 }
    );
  }
}
