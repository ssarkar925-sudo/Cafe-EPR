import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import {
  executeUniversalModelCall,
  PROVIDER_CATALOG,
  type AIProviderId,
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
    const model = (body?.model || PROVIDER_CATALOG[provider]?.defaultModel || "").trim();
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
    const endpointUrl = typeof body?.endpointUrl === "string" ? body.endpointUrl.trim() : "";

    if (!apiKey) {
      return NextResponse.json({ error: "API Key is required to test connection" }, { status: 400 });
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
