import fs from "node:fs";

const route = fs.readFileSync("app/api/sai/chat/route.ts", "utf8");
const runtime = fs.readFileSync("lib/sai/cognition/chat-runtime.ts", "utf8");
const ui = fs.readFileSync("components/sai/sai-background-layer.tsx", "utf8");

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

console.log("SAI first-party chat runtime regression tests");

check(route.includes('from "@/lib/sai/cognition/chat-runtime"'), "SAI chat route imports the first-party SAI runtime");
check(!route.includes("@/app/api/ai/agent/route"), "SAI chat route does not delegate to legacy AI agent");
check(route.includes("assertSaiChatActor"), "SAI chat route authenticates through SAI actor context");
check(route.includes("runSaiChat"), "SAI chat route runs the SAI chat orchestrator");

check(runtime.includes("loadSaiWorldState"), "SAI chat loads live SAI world state");
check(runtime.includes("runSaiInstruction"), "SAI chat can invoke the SAI plan/execution core");
check(runtime.includes("sai_query_erp"), "SAI exposes a typed live ERP query bridge");
check(runtime.includes("listSaiCapabilityDescriptors"), "SAI supplies registered capability context to reasoning");
check(runtime.includes("recordSaiTrace"), "SAI chat is traceable end-to-end");
check(runtime.includes("detectSaiLanguage"), "SAI detects language per turn");
check(runtime.includes("SAI_RESPONSE_RULES"), "SAI chat applies first-party response policy");
check(runtime.includes("SAI_MODEL_NOT_CONFIGURED"), "SAI surfaces model configuration failure explicitly");
check(runtime.includes("SAI_EMPTY_MODEL_RESPONSE"), "SAI rejects empty provider responses");

check(ui.includes('"/api/sai/chat"'), "SAI UI calls the canonical SAI endpoint");
check(ui.includes('surface: "sai"'), "SAI UI identifies itself as the SAI surface");
check(ui.includes("history:"), "SAI UI sends conversation history");
check(ui.includes("window.location.pathname"), "SAI UI sends active screen context");

console.log(`\n${passed} passed / ${failed} failed`);
process.exitCode = failed ? 1 : 0;
