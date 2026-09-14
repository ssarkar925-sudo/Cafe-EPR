import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

type TranslateBody = { text?: unknown; targetLanguage?: unknown; sourceLanguage?: unknown };

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  bn: "Bengali",
  mr: "Marathi",
  gu: "Gujarati",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ur: "Urdu",
};

const DEPRECATED_GEMINI_MODELS = new Set(["gemini-2.0-flash-001"]);
const DEFAULT_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

function getGeminiModels() {
  const configured = (process.env.GEMINI_MODEL || "").trim();
  const requested = configured && !DEPRECATED_GEMINI_MODELS.has(configured) ? configured : "gemini-2.5-flash";
  return Array.from(new Set([requested, ...DEFAULT_GEMINI_MODELS])).filter((model) => !DEPRECATED_GEMINI_MODELS.has(model));
}

function cleanText(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

/**
 * High-speed offline ERP dictionary for essential business terminology.
 * Ensures zero-downtime translation when offline or without external Gemini API keys.
 */
const OFFLINE_DICTIONARY: Record<string, { hi: string; bn: string }> = {
  "profit & loss": { hi: "लाभ और हानि", bn: "লাভ ও ক্ষতি" },
  "profit and loss": { hi: "लाभ और हानि", bn: "লাভ ও ক্ষতি" },
  "current-month profit & loss": { hi: "चालू माह का लाभ और हानि", bn: "চলতি মাসের লাভ ও ক্ষতি" },
  "net operating profit": { hi: "शुद्ध परिचालन लाभ", bn: "নিট অপারেটিং লাভ" },
  "gross operating profit": { hi: "सकल परिचालन लाभ", bn: "মোট অপারেটিং লাভ" },
  "operating expenses": { hi: "परिचालन व्यय (खर्च)", bn: "অপারেটিং খরচ" },
  "sales revenue": { hi: "बिक्री राजस्व", bn: "বিক্রি রাজস্ব" },
  "sales returns & refunds": { hi: "बिक्री वापसी और रिफंड", bn: "বিক্রি ফেরত এবং ফেরত" },
  "net margin": { hi: "शुद्ध मार्जिन", bn: "নিট মার্জিন" },
  "customer khata dues": { hi: "ग्राहक खाता बकाया", bn: "গ্রাহক খাতা বকেয়া" },
  "customer khata receivables summary": { hi: "ग्राहक खाता उधारी विवरण", bn: "গ্রাহক খাতা বকেয়া বিবরণ" },
  "total outstanding": { hi: "कुल बकाया", bn: "মোট বাকি" },
  "current balance due": { hi: "वर्तमान बकाया राशि", bn: "বর্তমান বাকি টাকা" },
  "credit limit": { hi: "क्रेडिट सीमा", bn: "ক্রেডিট লিমিট" },
  "no pending dues": { hi: "कोई बकाया नहीं है", bn: "কোনো বাকি টাকা নেই" },
  "quick sale prepared": { hi: "त्वरित बिक्री तैयार (अनुमोदन लंबित)", bn: "কুইক সেল প্রস্তুত (অনুমোদনের অপেক্ষায়)" },
  "waiting for 1-click owner approval": { hi: "मालिक के 1-क्लिक अनुमोदन की प्रतीक्षा है", bn: "মালিকের ১-ক্লিক অনুমোদনের অপেক্ষায়" },
  "all catalog products are currently healthy": { hi: "कैटलॉग के सभी उत्पाद वर्तमान में पर्याप्त स्टॉक में हैं।", bn: "ক্যাটালগের সমস্ত পণ্য বর্তমানে পর্যাপ্ত স্টকে রয়েছে।" },
  "low stock": { hi: "कम स्टॉक", bn: "কম স্টক" },
  "items need attention": { hi: "वस्तुओं पर ध्यान देने की आवश्यकता है", bn: "আইটেমগুলিতে নজর দেওয়া প্রয়োজন" },
  "whatsapp is connected": { hi: "व्हाट्सएप सफलतापूर्वक कनेक्टेड है", bn: "হোয়াটসঅ্যাপ সফলভাবে সংযুক্ত রয়েছে" },
  "learned & stored in ai memory": { hi: "एआई मेमोरी में सीख लिया और सहेज लिया", bn: "এআই মেমোরিতে শিখে সংরক্ষণ করা হয়েছে" },
  "customer": { hi: "ग्राहक", bn: "গ্রাহক" },
  "payment": { hi: "भुगतान", bn: "পরিশোধ / পেমেন্ট" },
  "total": { hi: "कुल", bn: "মোট" },
  "invoice": { hi: "चालान / बिल", bn: "चालান / বিল" },
  "cash": { hi: "नकद", bn: "নগদ" },
  "units": { hi: "इकाइयां", bn: "ইউনিট" },
  "approval was recorded": { hi: "अनुमोदन दर्ज किया गया", bn: "অনুমোদন রেকর্ড করা হয়েছে" },
  "action completed successfully": { hi: "कार्य सफलतापूर्वक पूरा हुआ", bn: "কাজটি সফলভাবে সম্পন্ন হয়েছে" },
};

function applyOfflineTranslation(text: string, targetLanguage: string): string {
  if (targetLanguage !== "hi" && targetLanguage !== "bn") return text;
  let translated = text;

  for (const [phrase, dict] of Object.entries(OFFLINE_DICTIONARY)) {
    const replacement = dict[targetLanguage as "hi" | "bn"];
    if (replacement) {
      const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      translated = translated.replace(regex, replacement);
    }
  }

  // Common header & marker adjustments
  if (targetLanguage === "hi") {
    translated = translated
      .replace(/\bCustomer\b/g, "ग्राहक")
      .replace(/\bPayment\b/g, "भुगतान")
      .replace(/\bTotal\b/g, "कुल")
      .replace(/\bItems\b/g, "सामान")
      .replace(/\bPhone\b/g, "फोन")
      .replace(/\bStatus\b/g, "स्थिति")
      .replace(/\bWarning\b/g, "चेतावनी")
      .replace(/\bAmount\b/g, "राशि");
  } else if (targetLanguage === "bn") {
    translated = translated
      .replace(/\bCustomer\b/g, "গ্রাহক")
      .replace(/\bPayment\b/g, "পেমেন্ট")
      .replace(/\bTotal\b/g, "মোট")
      .replace(/\bItems\b/g, "আইটেম")
      .replace(/\bPhone\b/g, "ফোন")
      .replace(/\bStatus\b/g, "অবস্থা")
      .replace(/\bWarning\b/g, "সতর্কতা")
      .replace(/\bAmount\b/g, "পরিমাণ");
  }

  return translated;
}

export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as TranslateBody | null;
  const text = cleanText(body?.text);
  const targetLanguage = cleanText(body?.targetLanguage).toLowerCase();
  const sourceLanguage = cleanText(body?.sourceLanguage).toLowerCase() || "auto";

  if (!text) return NextResponse.json({ error: "Text is required" }, { status: 400 });
  if (!LANGUAGE_NAMES[targetLanguage]) return NextResponse.json({ error: "Unsupported target language" }, { status: 400 });
  if (targetLanguage === sourceLanguage && sourceLanguage !== "auto") {
    return NextResponse.json({ translatedText: text, sourceLanguage, targetLanguage });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.length < 15 || apiKey.includes("[SENSITIVE")) {
    // Zero-downtime offline dictionary translation fallback
    const offlineResult = applyOfflineTranslation(text, targetLanguage);
    return NextResponse.json({ translatedText: offlineResult, sourceLanguage, targetLanguage, fallback: true });
  }

  const targetName = LANGUAGE_NAMES[targetLanguage];
  const sourceName = sourceLanguage === "auto" ? "the detected source language (may be in native script or Latin transliteration like Hinglish/Banglish)" : (LANGUAGE_NAMES[sourceLanguage] || sourceLanguage);

  const systemInstruction = [
    "You are the authoritative, fluent translation layer for Cafe-EPR's business ERP AI agent.",
    `Translate text from ${sourceName} into natural, accurate, culturally appropriate ${targetName}.`,
    "The input may be written in formal script, casual phrasing, or Latin-script transliteration (e.g. Hinglish or Banglish). Output accurately in the target language's standard script (Devanagari for Hindi, Bengali script for Bengali, Latin for English).",
    "CRITICAL PRESERVATION RULES:",
    "1. Preserve numbers, currency values (₹, Rs), quantities, dates, timestamps, phone numbers, and URLs EXACTLY.",
    "2. Preserve invoice numbers, UTR / RRN numbers, bank account endings, and customer names.",
    "3. Preserve markdown formatting (bolding, headers, bullet points, tables, code blocks).",
    "4. For technical or financial terms that are universally used in business (e.g. UPI, QR, PDF, P&L, GSTIN), preserve their familiar form.",
    "5. Return ONLY the translated text. Do not add quotes, explanations, markdown wrappers, or greetings.",
  ].join("\n");

  let data: any = null;
  let lastError = "Gemini translation request failed";

  for (const model of getGeminiModels()) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
        }),
      });
      data = await response.json().catch(() => ({}));
      if (response.ok) break;
      lastError = data?.error?.message || `${model}: ${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }

  const translatedText = data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text).filter(Boolean).join("\n").trim();
  const finalResult = translatedText || applyOfflineTranslation(text, targetLanguage);

  return NextResponse.json({
    translatedText: finalResult,
    sourceLanguage,
    targetLanguage,
    modelUsed: data?.candidates ? "gemini" : "offline_fallback",
  });
}
