// scripts/test-aeps-network-interception.mjs
// Test Suite for Passive Chrome DevTools Protocol (CDP) Network Interceptor for AEPS
import assert from "node:assert";
import { parseAepsNetworkPayload, findValueInObject } from "../electron/aeps-network-interceptor.js";
import { AepsJourneyEngine } from "../lib/aeps/journey-engine.ts";

console.log("Starting AEPS Network Interception (CDP) Test Suite...\n");

// Scenario 1: CSC DigiPay Web Raw API Response
{
  const digiPayPayload = {
    responseCode: "00",
    status: "SUCCESS",
    txn_id: "DIGI9284729104",
    bank_rrn: "409218291042",
    stan: "192847",
    amount: "5000.00",
    customer_balance: "12450.50",
    bank: "STATE BANK OF INDIA",
    commission: "11.20",
    fee: "0.00",
  };

  const parsed = parseAepsNetworkPayload(digiPayPayload, "https://digipay.csccloud.in/api/aeps/withdraw");
  assert(parsed !== null, "DigiPay payload must parse successfully");
  assert.strictEqual(parsed.stage, "FINAL", "Withdraw URL maps to FINAL stage");
  assert.strictEqual(parsed.fields.rrn, "409218291042", "RRN correctly extracted from bank_rrn");
  assert.strictEqual(parsed.fields.amount, 5000, "Amount correctly parsed as float number");
  assert.strictEqual(parsed.fields.status, "SUCCESS", "Response code '00' maps to SUCCESS");
  assert.strictEqual(parsed.fields.portalCommission, 11.2, "Commission correctly extracted");
  console.log("✅ PASS: Test 1 — CSC DigiPay Web raw network JSON parsed cleanly");
}

// Scenario 2: Spice Money AEPS API Response
{
  const spiceMoneyPayload = {
    statusCode: "SUCCESS",
    msg: "Transaction Successful",
    data: {
      transId: "SPICE-TXN-8392",
      rrn: "509182390192",
      withdrawAmount: 2500,
      accountBalance: 450.0,
      issuerBank: "PUNJAB NATIONAL BANK",
      margin: 6.5,
    },
  };

  const parsed = parseAepsNetworkPayload(spiceMoneyPayload, "https://b2b.spicemoney.com/gateway/aeps/transaction/process");
  assert(parsed !== null, "Spice Money payload must parse successfully");
  assert.strictEqual(parsed.fields.rrn, "509182390192", "RRN extracted from nested data.rrn");
  assert.strictEqual(parsed.fields.amount, 2500, "Amount extracted from nested data.withdrawAmount");
  assert.strictEqual(parsed.fields.portalCommission, 6.5, "Commission extracted from margin");
  console.log("✅ PASS: Test 2 — Spice Money nested gateway JSON parsed cleanly");
}

// Scenario 3: Passbook / Statement API Response
{
  const passbookPayload = {
    status: "SUCCESS",
    records: [
      {
        refNo: "409218291042",
        trans_amount: 5000,
        txnStatus: "SUCCESS",
        timestamp: "2026-10-01T12:20:00Z",
      },
    ],
  };

  const parsed = parseAepsNetworkPayload(passbookPayload, "https://digipay.csccloud.in/api/reports/passbook/statement");
  assert(parsed !== null, "Passbook payload must parse successfully");
  assert.strictEqual(parsed.stage, "PASSBOOK", "Report/Passbook URL maps to PASSBOOK stage");
  assert.strictEqual(parsed.fields.rrn, "409218291042", "Passbook RRN extracted correctly");
  assert.strictEqual(parsed.fields.amount, 5000, "Passbook amount extracted correctly");
  console.log("✅ PASS: Test 3 — Passbook statement API response parsed into PASSBOOK stage");
}

// Scenario 4: Irrelevant non-AEPS API filtering (Telemetry, Config, Analytics)
{
  const telemetryPayload = {
    appVersion: "4.2.1",
    theme: "light",
    sessionTimeout: 900,
    serverTime: 1727763600,
  };

  const parsed = parseAepsNetworkPayload(telemetryPayload, "https://portal.example.com/api/config/init");
  assert.strictEqual(parsed, null, "Non-transaction JSON must be filtered out (returns null)");
  console.log("✅ PASS: Test 4 — Non-financial API telemetry successfully ignored");
}

// Scenario 5: Full Journey Fusion: DOM Entry + Network Intercepted JSON + Passbook API
{
  const engine = new AepsJourneyEngine({ sessionExpiryMinutes: 60 });

  // Step 1: DOM Entry
  const { session: s1 } = engine.ingestObservation({
    portalId: "portal-digipay",
    portalName: "CSC DigiPay",
    sourceUrl: "https://digipay.csccloud.in/aeps",
    stage: "ENTRY",
    capturedAt: new Date().toISOString(),
    fields: {
      customerMobile: "9876543210",
      aadhaarLast4: "4821",
      bank: "State Bank of India",
      amount: 5000,
      transactionType: "cash_out",
    },
  });
  assert.strictEqual(s1.status, "COLLECTING", "Initial session is COLLECTING");

  // Step 2: In-Flight Network Response Intercepted (CDP)
  const networkParsed = parseAepsNetworkPayload(
    {
      status: "SUCCESS",
      bank_rrn: "409218291042",
      amount: 5000,
      commission: 11.2,
    },
    "https://digipay.csccloud.in/api/aeps/withdraw"
  );

  const { session: s2 } = engine.ingestObservation({
    portalId: "portal-digipay",
    portalName: "CSC DigiPay",
    sourceUrl: "https://digipay.csccloud.in/api/aeps/withdraw",
    stage: networkParsed.stage,
    capturedAt: new Date().toISOString(),
    fields: networkParsed.fields,
    evidence: { source: "network_interception_cdp" },
  });
  assert.strictEqual(s2.status, "FINAL_CONFIRMED", "Transitions to FINAL_CONFIRMED on network receipt");
  assert.strictEqual(s2.fields.customerMobile, "9876543210", "Keeps DOM mobile");
  assert.strictEqual(s2.fields.rrn, "409218291042", "Receives exact network RRN");
  assert.strictEqual(s2.fields.portalCommission, 11.2, "Receives exact portal commission");

  // Step 3: Passbook Statement API Intercepted
  const pbParsed = parseAepsNetworkPayload(
    {
      status: "SUCCESS",
      refNo: "409218291042",
      amount: 5000,
    },
    "https://digipay.csccloud.in/api/reports/passbook"
  );

  const { session: s3 } = engine.ingestObservation({
    portalId: "portal-digipay",
    portalName: "CSC DigiPay",
    sourceUrl: "https://digipay.csccloud.in/api/reports/passbook",
    stage: pbParsed.stage,
    capturedAt: new Date().toISOString(),
    fields: pbParsed.fields,
    evidence: { source: "network_interception_cdp" },
  });
  assert.strictEqual(s3.status, "RECONCILED", "Seamlessly transitions to RECONCILED with zero DOM delay");
  assert.strictEqual(s3.conflicts.length, 0, "Zero conflicts on matched amounts and RRNs");
  console.log("✅ PASS: Test 5 — Full Journey Fusion: DOM Entry + Network JSON + Passbook API = RECONCILED");
}

console.log("\nSummary: 5 passed, 0 failed.\nAll AEPS Network Interception Tests Passed Cleanly.");
