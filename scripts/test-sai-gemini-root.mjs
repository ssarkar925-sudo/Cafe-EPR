import fs from "node:fs";

const engine = fs.readFileSync("lib/ai/multi-provider-engine.ts", "utf8");
const agent = fs.readFileSync("lib/ai/agent-runtime.ts", "utf8");
const route = fs.readFileSync("app/api/ai/agent/route.ts", "utf8");
const panel = fs.readFileSync("components/settings/ai-provider-panel.tsx", "utf8");
const transcribe = fs.readFileSync("app/api/sai/transcribe/route.ts", "utf8");

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

console.log("SAI Gemini 3.x and voice root-cause regression tests");

check(engine.includes('defaultModel: "gemini-3.8-flash"'), "Gemini provider default is current 3.8 Flash");
check(engine.includes('gemini-3.8-flash'), "Gemini 3.8 Flash is selectable");
check(engine.includes('gemini-3.7-flash'), "Gemini 3.7 Flash is selectable");
check(engine.includes('gemini-3.6-flash'), "Gemini 3.6 Flash is selectable");
check(engine.includes('gemini-3.5-flash'), "Gemini 3.5 Flash is selectable");
check(engine.includes('gemini-3.1-pro-preview'), "Gemini 3.1 Pro preview is selectable");
check(engine.includes('gemini-3.1-flash-lite'), "Gemini 3.1 Flash-Lite is selectable");
check(!engine.includes('id: "gemini-2.5-pro"'), "Gemini 2.5 Pro is no longer selectable");
check(!engine.includes('id: "gemini-2.5-flash"'), "Gemini 2.5 Flash is no longer selectable");
check(!engine.includes('id: "gemini-2.0-flash"'), "Gemini 2.0 Flash is no longer selectable");
check(engine.includes("normalizeGeminiModel"), "Runtime normalizes stale Gemini model IDs");
check(engine.includes("async function postProviderJson"), "Provider responses use shared safe JSON handling");
check((engine.split("postProviderJson(").length - 1) === 4, "Gemini, OpenAI-compatible, and Anthropic calls share the guarded request path");
check(engine.includes('const responseBody = await response.text().catch(() => "")'), "Empty provider bodies are handled without raw JSON parser errors");
check(engine.includes("returned an empty response (HTTP"), "Empty successful provider responses produce an actionable error");
check(engine.includes("returned an invalid response (HTTP"), "Malformed successful provider responses produce an actionable error");
check(engine.includes("TRANSIENT_PROVIDER_STATUSES = new Set([429, 502, 503, 504])"), "Transient provider statuses are identified");
check(engine.includes("attempt < 2"), "Transient provider failures receive at most one bounded retry");
check(engine.includes("getProviderRetryDelay(response)"), "Retry-After is checked before retrying");
check(engine.includes("request timed out. Please try again."), "Provider timeouts produce a clear retry message");
check(engine.includes("AbortSignal.timeout(60_000)"), "Provider request window accommodates the observed Gemini latency");

check(engine.includes('"gemini-2.5-pro"'), "Runtime explicitly recognizes stale 2.5 Pro configuration");
check(engine.includes('"gemini-2.5-flash"'), "Runtime explicitly recognizes stale 2.5 Flash configuration");

check(agent.includes('model = "gemini-3.8-flash"'), "SAI runtime fallback model is current");
check(agent.includes("normalizeGeminiModel(model)"), "SAI runtime normalizes Gemini model before calls");
check(agent.includes("SAI model unavailable"), "Provider failure is explicit instead of a canned reply");
check(!agent.includes("falling back to heuristic"), "SAI no longer silently falls back to heuristic after model failure");

check(route.includes('activeModel = "gemini-3.8-flash"'), "API agent defaults to current Gemini model");
check(route.includes("normalizeGeminiModel(activeModel)"), "API agent normalizes stale Gemini config");
check(panel.includes("PROVIDER_CATALOG.gemini.defaultModel"), "AI settings panel follows provider catalog default");

check(transcribe.includes('model: "gemini-3.5-transcribe"'), "Voice uses dedicated Gemini 3.5 Transcribe");
check(transcribe.includes("upload/v1beta/files"), "Voice uploads audio through Gemini Files API");
check(transcribe.includes("/v1beta/interactions"), "Voice invokes Gemini Interactions API");
check(transcribe.includes("language_codes: []"), "Voice enables automatic language detection");
check(transcribe.includes('mode: "smart"'), "Voice uses smart transcription formatting");
check(transcribe.includes("custom_vocabulary"), "Voice supplies CafeERP domain vocabulary");

console.log(`\n${passed} passed / ${failed} failed`);
process.exitCode = failed ? 1 : 0;
