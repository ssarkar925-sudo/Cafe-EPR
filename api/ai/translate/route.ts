import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

type TranslateBody = {
  text?: unknown;
  targetLanguage?: unknown;
  sourceLanguage?: unknown;
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  bn: "Bengali",
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as TranslateBody | null;
  const text = cleanText(body?.text);
  const targetLanguage = cleanText(body?.targetLanguage).toLowerCase();
  const sourceLanguage = cleanText(body?.sourceLanguage).toLowerCase() || "auto";

  if (!text) return NextResponse.json({ error: "Text is required" }, { status: 400 });
  if (!LANGUAGE_NAMES[targetLanguage]) {
    return NextResponse.json({ error: "Unsupported target language" }, { status: 400 });
  }

  // English is the canonical language used by the Cafe AI Agent tools.
  // Keep translation in a dedicated server-side module so API keys never reach the browser.
  if (sourceLanguage === targetLanguage) {
    return NextResponse.json({ translatedText: text, sourceLanguage, targetLanguage });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Translation is not connected yet. Add GEMINI_API_KEY to the server environment." }, { status: 503 });
  }

  const targetName = LANGUAGE_NAMES[targetLanguage];
  const sourceName = sourceLanguage === "auto" ? "the detected source language" : (LANGUAGE_NAMES[sourceLanguage] || sourceLanguage);
  const requestedModel = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const models = Array.from(new Set([requestedModel, "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"]));

  const systemInstruction = [
    "You are the translation layer for Cafe-EPR's AI Agent.",
    "Translate user-facing text only; do not answer, explain, summarize, or change intent.",
    `Translate from ${sourceName} to ${targetName}.`,
    "Preserve names, product names, quantities, currency amounts, invoice numbers, IDs, URLs, punctuation, and line breaks exactly whenever possible.",
    "For mixed-language input, preserve technical/business terms that are already natural in English while translating the surrounding sentence.",
    "Return only the translated text. Do not wrap it in quotes, markdown, or commentary.",
  ].join("\n");

  let data: any = null;
  let lastError = "Gemini translation request failed";

  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: { temperature: 0.1 },
        }),
      },
    );

    data = await response.json().catch(() => ({}));
    if (response.ok) break;
    lastError = data?.error?.message || lastError;
  }

  const translatedText = data?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part?.text)
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!translatedText) return NextResponse.json({ error: lastError }, { status: 502 });

  return NextResponse.json({ translatedText, sourceLanguage, targetLanguage });
}
