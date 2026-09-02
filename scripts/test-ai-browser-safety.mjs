import fs from "fs";

const worker = fs.readFileSync("lib/ai/browser-worker.ts", "utf8");
const adapter = fs.readFileSync("lib/ai/portal-adapters/csc-digipay.ts", "utf8");
const workflow = fs.readFileSync("lib/ai/portal-workflows.ts", "utf8");
const cli = fs.readFileSync("scripts/ai-portal-worker.mjs", "utf8");
const learningUi = fs.readFileSync("components/ai/ai-learning-control-center.tsx", "utf8");

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed += 1;
  } else {
    console.error(`  FAIL: ${name}`);
    failed += 1;
  }
}

console.log("AI browser worker safety regression tests\n");

assert(worker.includes('readOnly: true'), "Worker contract is explicitly read-only");
assert(worker.includes('secret_requested'), "Worker has a secret-request stop state");
assert(worker.includes('captcha_detected'), "Worker has a CAPTCHA stop state");
assert(worker.includes('login_required'), "Worker has an authentication stop state");
assert(worker.includes('initiation_control_detected'), "Worker rejects non-read-only adapters");
assert(worker.includes('finally'), "Browser session is closed in a finally block");
assert(!/password|otp|pin|payment authorization/i.test(worker.match(/export async function runReadOnlyPortalWorker[\s\S]*/)?.[0] ?? ""), "Worker execution API does not accept credential fields");

assert(adapter.includes('providerName: "CSC DigiPay"'), "CSC DigiPay adapter is provider-bound");
assert(adapter.includes('sourceType: "aeps"'), "CSC DigiPay adapter emits AEPS source type");
assert(adapter.includes('isCompletedTransaction(status)'), "Adapter filters to completed transactions");
assert(adapter.includes('buildTransactionFingerprint(transaction)'), "Adapter deduplicates by transaction fingerprint");
assert(adapter.includes('workflow_not_learned'), "Adapter fails closed when selectors are not taught");
const networkWritePatterns = [
  /\b(?:fetch|axios)\s*\(/i,
  /\.(?:post|put|patch|delete)\s*\(/i,
  /\bXMLHttpRequest\b/i,
];
assert(!networkWritePatterns.some((pattern) => pattern.test(adapter)), "Adapter contains no network-write primitive");
assert(!/\b(?:window\.location|document\.location)\.(?:assign|replace)\s*\(/i.test(adapter), "Adapter contains no navigation-to-initiation primitive");

assert(workflow.includes('readOnly: true'), "CSC DigiPay workflow is marked read-only");
assert(workflow.includes('A PIN, OTP, password, or payment authorization is requested'), "Workflow documents secret stop condition");
assert(workflow.includes('The page layout no longer matches the learned workflow'), "Workflow documents layout-change stop condition");

assert(cli.includes('AI_PORTAL_SELECTORS_FILE'), "CLI accepts an owner-taught selector map");
assert(cli.includes('transaction-history-snapshot.txt'), "Learn mode persists a transaction-history snapshot");
assert(cli.includes('teaching-draft.json'), "Live teaching persists a local teaching draft");
assert(cli.includes('teaching-screenshot.png'), "Live teaching captures a local screenshot as evidence");
assert(cli.includes('pickSelector(page'), "Live teaching uses an interactive element picker");
assert(cli.includes('structuralSelector'), "Learned selectors are structural rather than text-value based");
assert(cli.includes('AI_PORTAL_TEACHING_DRAFT'), "Teaching draft path can be configured");
assert(cli.includes('await fs.writeFile(teachingDraftFile'), "Teaching draft is persisted before browser shutdown");
assert(!/\b(?:submit|transfer|withdraw)\s*\(/i.test(cli.match(/async function collect\([\s\S]*/)?.[0] ?? ""), "CLI collection path contains no transaction-initiation call");
assert(cli.includes('readOnly: true'), "Export explicitly marks collection as read-only");

assert(learningUi.includes('importTeachingDraft'), "Learning Control Center can import live teaching drafts");
assert(learningUi.includes('draft.schemaVersion === 1'), "Learning Control Center validates teaching draft schema");
assert(learningUi.includes('Import live browser teaching'), "Learning Control Center has a visible live-teaching import workflow");
assert(learningUi.includes('Imported live teaching'), "Learning Control Center reports live teaching imports");
assert(learningUi.includes('status: "draft"'), "Imported live workflows are saved as drafts through the existing API");
assert(learningUi.includes('localEvidenceOnly: true'), "Local screenshot/browser evidence is not treated as uploaded server evidence");

console.log(`\n${passed} passed / ${failed} failed`);
if (failed) process.exit(1);
