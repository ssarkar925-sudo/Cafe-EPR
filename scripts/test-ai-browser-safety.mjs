import fs from "fs";

const worker = fs.readFileSync("lib/ai/browser-worker.ts", "utf8");
const adapter = fs.readFileSync("lib/ai/portal-adapters/csc-digipay.ts", "utf8");
const workflow = fs.readFileSync("lib/ai/portal-workflows.ts", "utf8");

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
assert(!/password|otp|pin|payment authorization/i.test(worker.match(/export async function runReadOnlyPortalWorker[\\s\\S]*/)?.[0] ?? ""), "Worker execution API does not accept credential fields");

assert(adapter.includes('providerName: "CSC DigiPay"'), "CSC DigiPay adapter is provider-bound");
assert(adapter.includes('sourceType: "aeps"'), "CSC DigiPay adapter emits AEPS source type");
assert(adapter.includes('isCompletedTransaction(status)'), "Adapter filters to completed transactions");
assert(adapter.includes('buildTransactionFingerprint(transaction)'), "Adapter deduplicates by transaction fingerprint");
assert(adapter.includes('workflow_not_learned'), "Adapter fails closed when selectors are not taught");
assert(!/fetch|axios|POST|PUT|PATCH|DELETE|submit|transfer|withdraw/i.test(adapter), "Adapter contains no external transaction-initiation/network-write primitive");

assert(workflow.includes('readOnly: true'), "CSC DigiPay workflow is marked read-only");
assert(workflow.includes('A PIN, OTP, password, or payment authorization is requested'), "Workflow documents secret stop condition");
assert(workflow.includes('The page layout no longer matches the learned workflow'), "Workflow documents layout-change stop condition");

console.log(`\n${passed} passed / ${failed} failed`);
if (failed) process.exit(1);
