import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const watcherSource = fs.readFileSync(path.join(root, "electron", "aeps-watcher.js"), "utf8");
const sessionSource = fs.readFileSync(path.join(root, "electron", "aeps-transaction-session.js"), "utf8");

const requiredWatcher = [
  ["transaction journey memory import", 'require("./aeps-transaction-session")'],
  ["transaction journey state", "this.journeyMemory = new AepsTransactionJourneyMemory()"],
  ["safe journey extraction", "extractTransactionJourneySnapshot.toString()"],
  ["entry/intermediate/final/passbook stages", 'stage: journeyPage.stage || "intermediate"'],
  ["journey update event", 'type: "transaction_journey"'],
  ["reconciled event", 'type: "transaction_reconciled"'],
  ["conflict event", 'type: "transaction_conflict"'],
  ["final transaction event remains", 'type: "transaction"'],
  ["session reset on stop", "this.journeyFinalEmitted.clear()"],
];

const forbiddenSecrets = [
  ["OTP selector/value capture", "input[name*=\"otp"],
  ["PIN selector/value capture", "input[name*=\"pin"],
  ["password value capture", "input[type=\"password\"]"],
  ["biometric value capture", "input[name*=\"biometric"],
];

const requiredSession = [
  ["entry stage", '"entry"'],
  ["intermediate stage", '"intermediate"'],
  ["final stage", '"final"'],
  ["passbook stage", '"passbook"'],
  ["reconciled state", '"RECONCILED"'],
  ["conflict state", '"CONFLICT"'],
  ["temporary in-memory store", "this.sessions = new Map()"],
  ["transaction scoped observations", "session.observations"],
  ["field conflict comparison", "fieldAgreement(a, b)"],
];

let failed = 0;
for (const [label, needle] of requiredWatcher) {
  if (watcherSource.includes(needle)) console.log("PASS:", label);
  else {
    console.error("FAIL:", label, "missing:", needle);
    failed++;
  }
}

for (const [label, needle] of forbiddenSecrets) {
  if (!watcherSource.includes(needle)) console.log("PASS:", label, "not present");
  else {
    console.error("FAIL:", label, "forbidden secret capture pattern present:", needle);
    failed++;
  }
}

for (const [label, needle] of requiredSession) {
  if (sessionSource.includes(needle)) console.log("PASS:", label);
  else {
    console.error("FAIL:", label, "missing:", needle);
    failed++;
  }
}

console.log("");
console.log(
  failed === 0
    ? "AEPS transaction journey contract passed."
    : `AEPS transaction journey contract failed: ${failed} check(s).`
);
process.exitCode = failed === 0 ? 0 : 1;
