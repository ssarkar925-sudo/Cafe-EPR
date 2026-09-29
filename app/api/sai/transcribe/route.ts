import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

type ProviderConfig = {
  provider: string;
  model: string;
  apiKey: string;
  endpointUrl: string;
};

async function resolveAiConfig(supabase: Awaited<ReturnType<typeof createClient>>): Promise<ProviderConfig> {
  let provider = "gemini";
  let model = "gemini-2.5-flash";
  let apiKey = "";
  let endpointUrl = "";

  try {
    const { data } = await supabase
      .from("settings")
      .select("ai_config")
      .limit(1)
      .maybeSingle();

    const config = data?.ai_config;
    if (config && typeof config === "object") {
      if (typeof config.active_provider === "string") provider = config.active_provider;
      if (typeof config.model_name === "string" && config.model_name.trim()) model = config.model_name;
      if (typeof config.endpoint_url === "string") endpointUrl = config.endpoint_url;
      const keys = config.keys;
      if (keys && typeof keys === "object" && typeof keys[provider] === "string") {
        apiKey = keys[provider].trim();
      }
    }
  } catch {
    // Continue to resilient fallback sources.
  }

  if (!apiKey) {
    try {
      const { data } = await supabase
        .from("ai_provider_configs")
        .select("active_provider,model_name,api_key,endpoint_url")
        .eq("id", "default")
        .maybeSingle();

      if (data) {
        if (typeof data.active_provider === "string") provider = data.active_provider;
        if (typeof data.model_name === "string" && data.model_name.trim()) model = data.model_name;
        if (typeof data.api_key === "string") apiKey = data.api_key.trim();
        if (typeof data.endpoint_url === "string" && data.endpoint_url.trim()) endpointUrl = data.endpoint_url;
      }
    } catch {
      // Fall through to environment variables.
    }
  }

  if (!apiKey) {
    if (provider === "openai") apiKey = process.env.OPENAI_API_KEY || "";
    else if (provider === "groq") apiKey = process.env.GROQ_API_KEY || "";
    else if (provider === "openrouter") apiKey = process.env.OPENROUTER_API_KEY || "";
    else if (provider === "anthropic") apiKey = process.env.ANTHROPIC_API_KEY || "";
    else apiKey = process.env.GEMINI_API_KEY || "";
  }

  // Gemini is the canonical fallback for voice transcription because it accepts
  // short WebM microphone recordings directly as audio input.
  if (!apiKey && provider !== "gemini") {
    try {
      const { data } = await supabase
        .from("settings")
        .select("ai_config")
        .limit(1)
        .maybeSingle();
      const keys = data?.ai_config?.keys;
      if (keys && typeof keys === "object" && typeof keys.gemini === "string") {
        apiKey = keys.gemini.trim();
        if (apiKey) {
          provider = "gemini";
          model = "gemini-2.5-flash";
          endpointUrl = "";
        }
      }
    } catch {
      // No alternate key.
    }
  }

  return { provider, model, apiKey, endpointUrl };
}

async function transcribeWithGemini(audio: ArrayBuffer, mimeType: string, apiKey: string): Promise<string> {
  const base64 = Buffer.from(audio).toString("base64");
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          {
            text:
              "Transcribe this microphone recording exactly as spoken. Return ONLY the transcript, with no explanation. Preserve Bengali, Hindi, English, and mixed-language speech; do not translate it. Keep business terms, numbers, names, and CafeERP/AEPS terms exactly when audible.",
          },
          {
            inlineData: {
              mimeType,
              data: base64,
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 512,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message || `Gemini transcription failed (HTTP ${response.status})`);
  }

  const transcript = data?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part?.text)
    ?.filter(Boolean)
    ?.join(" ")
    ?.trim();

  if (!transcript) throw new Error("No speech was detected in the recording.");
  return transcript.slice(0, 16_000);
}

async function transcribeWithOpenAI(
  audio: ArrayBuffer,
  mimeType: string,
  apiKey: string,
  endpointUrl?: string,
): Promise<string> {
  const form = new FormData();
  const extension = mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "mp4" : "audio";
  form.append("file", new Blob([audio], { type: mimeType }), `sai-voice.${extension}`);
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("response_format", "json");

  const endpoint = endpointUrl
    ? `${endpointUrl.replace(/\/$/, "")}/audio/transcriptions`
    : "https://api.openai.com/v1/audio/transcriptions";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI transcription failed (HTTP ${response.status})`);
  }

  const transcript = String(data?.text || "").trim();
  if (!transcript) throw new Error("No speech was detected in the recording.");
  return transcript.slice(0, 16_000);
}

export async function POST(request: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_AUDIO_BYTES + 32_768) {
      return NextResponse.json({ error: "Audio recording is too large" }, { status: 413 });
    }

    const form = await request.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Audio recording is required" }, { status: 400 });
    }
    if (!file.size) return NextResponse.json({ error: "Audio recording is empty" }, { status: 400 });
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Audio recording is too large" }, { status: 413 });
    }

    const mimeType = String(file.type || "audio/webm").split(";")[0].toLowerCase();
    if (!mimeType.startsWith("audio/")) {
      return NextResponse.json({ error: "Unsupported audio type" }, { status: 415 });
    }

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const config = await resolveAiConfig(supabase);
    if (!config.apiKey) {
      return NextResponse.json(
        { error: "Voice transcription is not configured. Add a Gemini or OpenAI API key in AI settings." },
        { status: 503 },
      );
    }

    const audio = await file.arrayBuffer();
    const transcript =
      config.provider === "openai"
        ? await transcribeWithOpenAI(audio, mimeType, config.apiKey, config.endpointUrl)
        : await transcribeWithGemini(audio, mimeType, config.apiKey);

    return NextResponse.json({
      transcript,
      provider: config.provider === "openai" ? "openai" : "gemini",
      source: "server-transcription",
    });
  } catch (error) {
    console.error("SAI voice transcription failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Voice transcription failed" },
      { status: 502 },
    );
  }
}
