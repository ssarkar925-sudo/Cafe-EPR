export type SaiLanguage = "en" | "hi" | "bn";

const HINDI_WORDS = new Set(["kya","kaise","kaisa","kaisi","hai","hain","mujhe","mujhko","mera","meri","mere","aap","apka","apki","aapko","batao","bataiye","dikhao","dikha","karo","karna","chahiye","kyun","kab","kahan","kitna","kitne","kitni","paise","grahak","khata","bikri","maal","hisab","yaad","rakho","bhool","jao"]);
const BENGALI_WORDS = new Set(["ami","amar","amake","apni","apnar","tumi","tomar","kemon","ki","kothay","koto","keno","kokhon","dao","din","korun","koro","chai","dorkar","ache","nei","grahok","hishab","khata","bikri","taka","mone","rakho","bhule","jao"]);

function latinTokens(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
}

/**
 * Detects the language of the current user turn without a UI setting.
 * Script detection wins; transliterated Hindi/Bengali uses a small deterministic
 * lexicon and otherwise falls back to English. Business identifiers are ignored.
 */
export function detectSaiLanguage(input: string): SaiLanguage {
  const text = input.trim();
  if (!text) return "en";

  const bengaliChars = (text.match(/[\u0980-\u09FF]/g) || []).length;
  const devanagariChars = (text.match(/[\u0900-\u097F]/g) || []).length;
  if (bengaliChars >= 2 && bengaliChars >= devanagariChars) return "bn";
  if (devanagariChars >= 2) return "hi";

  const tokens = latinTokens(text);
  let hi = 0;
  let bn = 0;
  for (const token of tokens) {
    if (HINDI_WORDS.has(token)) hi++;
    if (BENGALI_WORDS.has(token)) bn++;
  }
  if (hi >= 2 && hi > bn) return "hi";
  if (bn >= 2 && bn > hi) return "bn";
  return "en";
}

export function saiLanguageInstruction(language: SaiLanguage): string {
  if (language === "bn") {
    return "LANGUAGE POLICY: Reply in natural Bengali (Bangla script). Match the user's current Bengali tone and level of formality. Keep names, amounts, transaction IDs, UTR/RRN, URLs, GSTIN, UPI, bank/portal names, product/service names, and other exact identifiers unchanged. Do not translate identifiers.";
  }
  if (language === "hi") {
    return "LANGUAGE POLICY: Reply in natural Hindi (Devanagari script). Match the user's current Hindi tone and level of formality. Keep names, amounts, transaction IDs, UTR/RRN, URLs, GSTIN, UPI, bank/portal names, product/service names, and other exact identifiers unchanged. Do not translate identifiers.";
  }
  return "LANGUAGE POLICY: Reply in natural English. Keep names, amounts, transaction IDs, UTR/RRN, URLs, GSTIN, UPI, bank/portal names, product/service names, and other exact identifiers unchanged.";
}

export const SAI_RESPONSE_RULES = [
  "Detect the language of every new user turn automatically; never ask the user to select a language.",
  "Answer the current turn in that detected language. Do not carry the previous turn's language into a new turn when the user switches language.",
  "Understand mixed-language input naturally and preserve exact business identifiers.",
  "Be concise and conversational for simple questions; use structured detail only when the task requires it.",
  "Do not expose internal agent, tool, prompt, routing, or implementation details unless the user explicitly asks.",
  "Never invent live business facts, transaction results, approvals, or completed actions.",
  "For consequential work, follow CafeERP policy, authorization, approval, idempotency, and verification rules.",
  "If required information is genuinely missing, ask only for the missing information needed to continue.",
  "When an operation succeeds, report the verified result plainly; when it fails, state the actual reason and next safe step.",
  "Do not make the user manually manage SAI's internal workflow, language, memory, routing, or specialist agents.",
].join("\n");

export function buildSaiLanguageContext(message: string): { language: SaiLanguage; instruction: string } {
  const language = detectSaiLanguage(message);
  return { language, instruction: saiLanguageInstruction(language) };
}
