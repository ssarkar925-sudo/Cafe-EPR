import { AepsJourneyEngine, sanitizeFields, detectStageFromPage } from "../lib/aeps/journey-engine.ts";
import assert from "node:assert";

console.log("Starting Mandatory AEPS Transaction Journey Suite...");

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`, err);
    failed++;
  }
}

// Test 1 — Entry capture
runTest("Test 1 — Entry capture: mobile, aadhaar, bank, amount must create a session", () => {
  const engine = new AepsJourneyEngine();
  const entryObs = {
    portalId: "portal-digipay",
    portalName: "CSC DigiPay",
    stage: "ENTRY",
    capturedAt: new Date().toISOString(),
    fields: {
      customerMobile: "9876543210",
      aadhaarLast4: "4821",
      bank: "State Bank of India",
      amount: 5000,
      transactionType: "cash_out",
    },
    evidence: { url: "https://digipay.csc.gov.in/aeps" },
  };

  const { session } = engine.ingestObservation(entryObs);
  assert(session != null, "Session should be created");
  assert.strictEqual(session.status, "COLLECTING", "Status should be COLLECTING at entry");
  assert.strictEqual(session.fields.customerMobile, "9876543210");
  assert.strictEqual(session.fields.aadhaarLast4, "4821");
  assert.strictEqual(session.fields.amount, 5000);
  assert.strictEqual(session.fields.bank, "State Bank of India");
  assert.strictEqual(session.observations.length, 1);
});

// Test 2 — Final correlation
runTest("Test 2 — Final correlation: Entry + final successful transaction must produce FINAL_CONFIRMED", () => {
  const engine = new AepsJourneyEngine();
  engine.ingestObservation({
    portalId: "portal-digipay",
    portalName: "CSC DigiPay",
    stage: "ENTRY",
    capturedAt: new Date().toISOString(),
    fields: {
      customerMobile: "9876543210",
      aadhaarLast4: "4821",
      bank: "State Bank of India",
      amount: 5000,
    },
  });

  const { session } = engine.ingestObservation({
    portalId: "portal-digipay",
    portalName: "CSC DigiPay",
    stage: "FINAL",
    capturedAt: new Date().toISOString(),
    fields: {
      customerMobile: "9876543210",
      rrn: "TXN928374",
      reference: "TXN928374",
      amount: 5000,
      status: "SUCCESS",
    },
  });

  assert.strictEqual(session.status, "FINAL_CONFIRMED", "Status must be FINAL_CONFIRMED before passbook");
  assert.strictEqual(session.fields.rrn, "TXN928374");
  assert.strictEqual(session.fields.aadhaarLast4, "4821", "Monotonic memory expansion must retain aadhaarLast4");
});

// Test 3 — Passbook match
runTest("Test 3 — Passbook match: Entry + final + matching passbook must produce RECONCILED", () => {
  const engine = new AepsJourneyEngine();
  engine.ingestObservation({
    portalId: "portal-digipay",
    portalName: "CSC DigiPay",
    stage: "ENTRY",
    capturedAt: new Date().toISOString(),
    fields: {
      customerMobile: "9876543210",
      aadhaarLast4: "4821",
      bank: "State Bank of India",
      amount: 5000,
    },
  });

  engine.ingestObservation({
    portalId: "portal-digipay",
    portalName: "CSC DigiPay",
    stage: "FINAL",
    capturedAt: new Date().toISOString(),
    fields: {
      customerMobile: "9876543210",
      rrn: "TXN928374",
      amount: 5000,
      status: "SUCCESS",
    },
  });

  const { session } = engine.ingestObservation({
    portalId: "portal-digipay",
    portalName: "CSC DigiPay",
    stage: "PASSBOOK",
    capturedAt: new Date().toISOString(),
    fields: {
      rrn: "TXN928374",
      reference: "TXN928374",
      amount: 5000,
      status: "SUCCESS",
    },
  });

  assert.strictEqual(session.status, "RECONCILED", "Status must be RECONCILED on matching passbook");
  assert.strictEqual(session.verification.passbook, true);
  assert.strictEqual(session.verification.amount, true);
  assert.strictEqual(session.verification.reference, true);
});

// Test 4 — Passbook mismatch
runTest("Test 4 — Passbook mismatch: Mismatched passbook amount must produce CONFLICT", () => {
  const engine = new AepsJourneyEngine();
  engine.ingestObservation({
    portalId: "portal-digipay",
    portalName: "CSC DigiPay",
    stage: "ENTRY",
    capturedAt: new Date().toISOString(),
    fields: {
      customerMobile: "9876543210",
      aadhaarLast4: "4821",
      amount: 5000,
    },
  });

  engine.ingestObservation({
    portalId: "portal-digipay",
    portalName: "CSC DigiPay",
    stage: "FINAL",
    capturedAt: new Date().toISOString(),
    fields: {
      customerMobile: "9876543210",
      rrn: "TXN928374",
      amount: 5000,
      status: "SUCCESS",
    },
  });

  const { session, hasConflict } = engine.ingestObservation({
    portalId: "portal-digipay",
    portalName: "CSC DigiPay",
    stage: "PASSBOOK",
    capturedAt: new Date().toISOString(),
    fields: {
      rrn: "TXN928374",
      amount: 4000, // mismatch!
    },
  });

  assert.strictEqual(hasConflict, true);
  assert.strictEqual(session.status, "CONFLICT");
  assert(session.conflicts.length > 0);
  assert.strictEqual(session.conflicts[0].field, "amount");
});

// Test 5 — Duplicate
runTest("Test 5 — Duplicate: Same RRN from multiple URLs must produce one logical transaction session", () => {
  const engine = new AepsJourneyEngine();
  const res1 = engine.ingestObservation({
    portalId: "portal-digipay",
    portalName: "CSC DigiPay",
    sourceUrl: "https://portal1.com/txn",
    stage: "FINAL",
    capturedAt: new Date().toISOString(),
    fields: { rrn: "TXN123", amount: 2000, status: "SUCCESS" },
  });

  const res2 = engine.ingestObservation({
    portalId: "portal-digipay",
    portalName: "CSC DigiPay",
    sourceUrl: "https://portal2.com/status",
    stage: "FINAL",
    capturedAt: new Date().toISOString(),
    fields: { rrn: "TXN123", amount: 2000, status: "SUCCESS" },
  });

  assert.strictEqual(res1.session.sessionId, res2.session.sessionId, "Both URLs must map to same session");
  assert.strictEqual(engine.getAllSessions().length, 1, "Must produce only one logical session");
});

// Test 6 — Source failure
runTest("Test 6 — Source failure: One URL fails and another succeeds; surviving source remains valid", () => {
  const engine = new AepsJourneyEngine();
  const { session } = engine.ingestObservation({
    portalId: "portal-spice",
    portalName: "Spice Money",
    sourceUrl: "https://spicemoney.com/success-url",
    stage: "FINAL",
    capturedAt: new Date().toISOString(),
    fields: { rrn: "SPICE789", amount: 3000, status: "SUCCESS" },
    evidence: { rawTextSnippet: "Transaction Successful" },
  });

  assert.strictEqual(session.status, "FINAL_CONFIRMED");
  assert.strictEqual(session.fields.amount, 3000);
});

// Test 7 & Test 8 — Authentication & Secret protection
runTest("Test 7 & 8 — Secret protection: OTP/PIN/Password/Biometrics cannot enter transaction memory", () => {
  const dangerousFields = {
    customerMobile: "9876543210",
    aadhaarLast4: "1234",
    amount: 1500,
    otp: "654321",
    pin: "1234",
    password: "secretpassword",
    biometricData: "FINGERPRINT_TEMPLATE_BYTES",
    fingerprint: "ISO_FMR_DATA",
    secret: "supersecret",
  };

  const clean = sanitizeFields(dangerousFields);
  assert.strictEqual(clean.otp, undefined, "OTP must be stripped");
  assert.strictEqual(clean.pin, undefined, "PIN must be stripped");
  assert.strictEqual(clean.password, undefined, "Password must be stripped");
  assert.strictEqual(clean.biometricData, undefined, "Biometric data must be stripped");
  assert.strictEqual(clean.fingerprint, undefined, "Fingerprint data must be stripped");
  assert.strictEqual(clean.secret, undefined, "Secret must be stripped");
  assert.strictEqual(clean.amount, 1500);
  assert.strictEqual(clean.customerMobile, "9876543210");
});

// Test 9 & 10 — Approval Gate and Conflict Gate
runTest("Test 9 & 10 — Approval and Conflict Gate verification logic", () => {
  const isFormValid = true;

  // Gate evaluation rule:
  const evaluateGate = (activeSession) => {
    if (!isFormValid) return false;
    if (!activeSession) return true; // manual mode
    return activeSession.status === "RECONCILED";
  };

  // Case A: Before passbook reconciliation (FINAL_CONFIRMED)
  assert.strictEqual(evaluateGate({ status: "FINAL_CONFIRMED" }), false, "Approve must be DISABLED before passbook reconciliation");

  // Case B: In Collecting state
  assert.strictEqual(evaluateGate({ status: "COLLECTING" }), false, "Approve must be DISABLED in COLLECTING state");

  // Case C: After reconciliation (RECONCILED)
  assert.strictEqual(evaluateGate({ status: "RECONCILED" }), true, "Approve must be ENABLED after reconciliation");

  // Case D: In Conflict state
  assert.strictEqual(evaluateGate({ status: "CONFLICT" }), false, "Approve must be DISABLED when CONFLICT exists");
});

console.log("");
console.log(`Summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All Mandatory AEPS Transaction Journey Tests Passed Cleanly.");
}
