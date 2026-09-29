import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

const LIVE_MODEL = "models/gemini-3.5-transcribe-live";
const TRANSCRIPTION_VOCABULARY = [
  "CafeERP", "SAI", "AEPS", "DMT", "UPI", "BBPS", "CSC DigiPay",
  "Spice Money", "RRN", "UTR", "Khata", "commission", "portal",
];

type GeminiSettings = {
  active_provider?: string;
  keys?: Record<string, unknown>;
};

async function resolveGeminiApiKey(supabase: Awaited<ReturnType<typeof createClient>>) {
  let activeProvider = "";
  let settingsProviderConfigured = false;
  let geminiKey = "";

  try {
    const { data } = await supabase.from("settings").select("ai_config").limit(1).maybeSingle();
    const config = data?.ai_config as GeminiSettings | null;
    if (config && typeof config === "object") {
      if (typeof config.active_provider === "string") {
        activeProvider = config.active_provider;
        settingsProviderConfigured = true;
      }
      const configuredKey = config.keys?.gemini;
      if (typeof configuredKey === "string") geminiKey = configuredKey.trim();
    }
  } catch {
    // Continue to legacy configuration and environment fallback.
  }

  if (!settingsProviderConfigured || !geminiKey) {
    try {
      const { data } = await supabase
        .from("ai_provider_configs")
        .select("active_provider,api_key")
        .eq("id", "default")
        .maybeSingle();
      if (data) {
        if (!settingsProviderConfigured && typeof data.active_provider === "string") {
          activeProvider = data.active_provider;
        }
        if (!geminiKey && data.active_provider === "gemini" && typeof data.api_key === "string") {
          geminiKey = data.api_key.trim();
        }
      }
    } catch {
      // Use the server environment fallback.
    }
  }

  if (!activeProvider) activeProvider = "gemini";
  if (activeProvider !== "gemini") {
    return { apiKey: "", error: "Select Gemini in CafeERP AI settings to use live voice transcription." };
  }

  if (!geminiKey) geminiKey = process.env.GEMINI_API_KEY || "";
  return geminiKey
    ? { apiKey: geminiKey, error: "" }
    : { apiKey: "", error: "Gemini API key is not configured in CafeERP AI settings." };
}

export async function POST() {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { apiKey, error: configError } = await resolveGeminiApiKey(supabase);
    if (!apiKey) return NextResponse.json({ error: configError }, { status: 503 });

    const now = Date.now();
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + 5 * 60_000).toISOString(),
        newSessionExpireTime: new Date(now + 60_000).toISOString(),
        liveConnectConstraints: {
          model: LIVE_MODEL,
          config: {
            generationConfig: { responseModalities: ["TEXT"] },
            inputAudioTranscription: {
              languageCodes: [],
              mode: "SMART",
              customVocabulary: TRANSCRIPTION_VOCABULARY,
            },
          },
        },
      }),
      signal: AbortSignal.timeout(12_000),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("SAI Gemini Live token request failed", { status: response.status, error: data?.error?.message });
      return NextResponse.json(
        { error: data?.error?.message || `Gemini live transcription setup failed (HTTP ${response.status}).` },
        { status: response.status >= 400 && response.status < 500 ? 502 : 503 },
      );
    }

    const token = typeof data?.name === "string" ? data.name : "";
    if (!token) {
      console.error("SAI Gemini Live token response did not include a token name");
      return NextResponse.json({ error: "Gemini did not return a live session token." }, { status: 502 });
    }

    return NextResponse.json({ token, model: LIVE_MODEL }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("SAI Gemini Live token setup failed", error);
    return NextResponse.json({ error: "Gemini live transcription could not be initialized." }, { status: 503 });
  }
}
