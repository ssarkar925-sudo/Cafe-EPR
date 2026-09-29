import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

type ProviderConfig = {
  provider: "gemini" | "openai";
  apiKey: string;
};

async function resolveAiConfig(supabase: Awaited<ReturnType<typeof createClient>>): Promise<ProviderConfig> {
  let activeProvider = "gemini";
  let geminiKey = "";
  let openAiKey = "";

  try {
    const { data } = await supabase
      .from("settings")
      .select("ai_config")
      .limit(1)
      .maybeSingle();

    const config = data?.ai_config;
    if (config && typeof config === "object") {
      if (typeof config.active_provider === "string") activeProvider = config.active_provider;
      const keys = config.keys;
      if (keys && typeof keys === "object") {
        if (typeof keys.gemini === "string") geminiKey = keys.gemini.trim();
        if (typeof keys.openai === "string") openAiKey = keys.openai.trim();
      }
    }
  } catch {
    // Continue to fallback sources.
  }

  if (!geminiKey || !openAiKey) {
    try {
      const { data } = await supabase
        .from("ai_provider_configs")
        .select("active_provider,api_key")
        .eq("id", "default")
        .maybeSingle();

      if (data) {
        if (typeof data.active_provider === "string" && !activeProvider) {
          activeProvider = data.active_provider;
        }
        const legacyKey = typeof data.api_key === "string" ? data.api_key.trim() : "";
        if (legacyKey) {
          if (data.active_provider === "openai" && !openAiKey) openAiKey = legacyKey;
          else if (data.active_provider === "gemini" && !geminiKey) geminiKey = legacyKey;
        }
      }
    } catch {
      // Environment fallbacks below.
    }
  }

  if (!geminiKey) geminiKey = process.env.GEMINI_API_KEY || "";
  if (!openAiKey) openAiKey = process.env.OPENAI_API_KEY || "";

  if (activeProvider === "openai" && openAiKey) {
    return { provider: "openai", apiKey: openAiKey };
  }
  if (geminiKey) {
    return { provider: "gemini", apiKey: geminiKey };
  }
  if (openAiKey) {
    return { provider: "openai", apiKey: openAiKey };
  }

  return { provider: "gemini", apiKey: "" };
}

async function transcribeWithGemini(audio: ArrayBuffer, mimeType: string, apiKey: string): Promise<string> {
  const uploadStart = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(audio.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file: {
        display_name: `sai-voice-${crypto.randomUUID()}`,
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!uploadStart.ok) {
    const data = await uploadStart.json().catch(() => null);
    throw new Error(data?.error?.message || `Gemini audio upload start failed (HTTP ${uploadStart.status})`);
  }

  const uploadUrl =
    uploadStart.headers.get("x-goog-upload-url") ||
    uploadStart.headers.get("X-Goog-Upload-URL");

  if (!uploadUrl) {
    throw new Error("Gemini audio upload did not return an upload URL.");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(audio.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: audio,
    signal: AbortSignal.timeout(30_000),
  });

  const fileData = await uploadResponse.json().catch(() => null);
  if (!uploadResponse.ok) {
    throw new Error(fileData?.error?.message || `Gemini audio upload failed (HTTP ${uploadResponse.status})`);
  }

  const fileUri = String(fileData?.file?.uri || "");
  const fileName = String(fileData?.file?.name || "");
  const storedMimeType = String(fileData?.file?.mimeType || mimeType);

  if (!fileUri) throw new Error("Gemini did not return an uploaded audio URI.");

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          model: "gemini-3.5-transcribe",
          input: [
            {
              type: "audio",
              uri: fileUri,
              mime_type: storedMimeType,
            },
          ],
          generation_config: {
            transcription_config: {
              language_codes: [],
              mode: "smart",
              custom_vocabulary: [
                "CafeERP",
                "SAI",
                "AEPS",
                "DMT",
                "UPI",
                "BBPS",
                "CSC DigiPay",
                "Spice Money",
                "RRN",
                "UTR",
                "Khata",
                "commission",
                "portal",
              ],
            },
          },
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error?.message || `Gemini transcription failed (HTTP ${response.status})`);
    }

    const transcript = String(data?.output_text || "").trim() ||
      (Array.isArray(data?.outputs)
        ? data.outputs
            .filter((item: any) => item?.type === "text")
            .map((item: any) => String(item?.text || ""))
            .join(" ")
            .trim()
        : "");

    if (!transcript) throw new Error("No speech was detected in the recording.");
    return transcript.slice(0, 16_000);
  } finally {
    if (fileName) {
      void fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}`, {
        method: "DELETE",
        headers: { "x-goog-api-key": apiKey },
      }).catch(() => undefined);
    }
  }
}


async function transcribeWithOpenAI(
  audio: ArrayBuffer,
  mimeType: string,
  apiKey: string,
): Promise<string> {
  const form = new FormData();
  const extension = mimeType.includes("webm")
    ? "webm"
    : mimeType.includes("ogg")
      ? "ogg"
      : mimeType.includes("mp4")
        ? "mp4"
        : mimeType.includes("m4a")
          ? "m4a"
          : mimeType.includes("wav")
            ? "wav"
            : "audio";
  form.append("file", new Blob([audio], { type: mimeType }), `sai-voice.${extension}`);
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("response_format", "json");

  const endpoint = "https://api.openai.com/v1/audio/transcriptions";

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
        ? await transcribeWithOpenAI(audio, mimeType, config.apiKey)
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
