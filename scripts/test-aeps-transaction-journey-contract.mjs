import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const watcherSource = fs.readFileSync(path.join(root, "electron", "aeps-watcher.js"), "utf8");
const sessionPath = path.join(root, "electron", "aeps-transaction-session.js");
const sessionSource = fs.readFileSync(sessionPath, "utf8");

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

const requiredSecurity = [
  ["secret control exclusion", "isSecretControl"],
  ["secret-keyword exclusion", "/otp|one[- ]time|pin|password|passcode|biometric|fingerprint/"],
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

for (const [label, needle] of requiredSecurity) {
  if (watcherSource.includes(needle)) console.log("PASS:", label);
  else {
    console.error("FAIL:", label, "missing:", needle);
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

// Exercise the real correlation engine.
const require = createRequire(import.meta.url);
const { AepsTransactionJourneyMemory } = require(sessionPath);

const memory = new AepsTransactionJourneyMemory({ sessionTtlMs: 20 * 60 * 1000 });

const entry = memory.record({
  portalId: "portal-1",
  portalName: "Test Portal",
  sourceId: "entry",
  sourceUrl: "https://example.test/aeps",
  stage: "entry",
  capturedAt: "2026-10-01T09:00:00.000Z",
  fields: {
    customerName: "Rahul Das",
    customerMobile: "9876543210",
    aadhaarLast4: "4821",
    bankName: "State Bank of India",
    transactionType: "cash_out",
    amount: 5000,
  },
});
assert.equal(entry?.status, "COLLECTING");
assert.equal(entry?.stageSummary.entry, true);

const final = memory.record({
  portalId: "portal-1",
  portalName: "Test Portal",
  sourceId: "result",
  sourceUrl: "https://example.test/aeps/result",
  stage: "final",
  capturedAt: "2026-10-01T09:01:00.000Z",
  fields: {
    customerName: "Rahul Das",
    customerMobile: "9876543210",
    aadhaarLast4: "4821",
    bankName: "State Bank of India",
    transactionType: "cash_out",
    amount: 5000,
    reference: "TXN928374",
    status: "success",
  },
});
assert.equal(final?.status, "FINAL_CONFIRMED");
assert.equal(final?.fields.reference, "TXN928374");
assert.equal(final?.stageSummary.final, true);

const reconciled = memory.record({
  portalId: "portal-1",
  portalName: "Test Portal",
  sourceId: "passbook",
  sourceUrl: "https://example.test/passbook",
  stage: "passbook",
  capturedAt: "2026-10-01T09:02:00.000Z",
  fields: {
    customerMobile: "9876543210",
    aadhaarLast4: "4821",
    bankName: "State Bank of India",
    transactionType: "cash_out",
    amount: 5000,
    reference: "TXN928374",
    status: "success",
  },
});
assert.equal(reconciled?.status, "RECONCILED");
assert.equal(reconciled?.verification.passbookCaptured, true);
assert.equal(reconciled?.verification.conflicts.length, 0);

const conflictMemory = new AepsTransactionJourneyMemory();
conflictMemory.record({
  portalId: "portal-2",
  portalName: "Conflict Portal",
  sourceId: "entry",
  stage: "entry",
  capturedAt: "2026-10-01T09:00:00.000Z",
  fields: {
    customerMobile: "9876543210",
    aadhaarLast4: "4821",
    amount: 5000,
    bankName: "State Bank of India",
    transactionType: "cash_out",
  },
});
conflictMemory.record({
  portalId: "portal-2",
  portalName: "Conflict Portal",
  sourceId: "final",
  stage: "final",
  capturedAt: "2026-10-01T09:01:00.000Z",
  fields: {
    customerMobile: "9876543210",
    aadhaarLast4: "4821",
    amount: 5000,
    bankName: "State Bank of India",
    transactionType: "cash_out",
    reference: "TXN-CONFLICT",
    status: "success",
  },
});
const conflict = conflictMemory.record({
  portalId: "portal-2",
  portalName: "Conflict Portal",
  sourceId: "passbook",
  stage: "passbook",
  capturedAt: "2026-10-01T09:02:00.000Z",
  fields: {
    customerMobile: "9876543210",
    aadhaarLast4: "4821",
    amount: 4000,
    bankName: "State Bank of India",
    transactionType: "cash_out",
    reference: "TXN-CONFLICT",
    status: "success",
  },
});
assert.equal(conflict?.status, "CONFLICT");
assert.ok(conflict?.verification.conflicts.some((item) => item.field === "amount"));

console.log("PASS: entry → final correlation");
console.log("PASS: final → passbook reconciliation");
console.log("PASS: conflicting passbook data is blocked");
console.log("");
console.log(
  failed === 0
    ? "AEPS transaction journey contract passed."
    : `AEPS transaction journey contract failed: ${failed} static check(s).`
);
process.exitCode = failed === 0 ? 0 : 1;
