/**
 * packages/ledger/tests/intake-handler.test.mjs
 * Verification of Automatic Ingestion Event to Double-Entry Journal Generator.
 */

import assert from "node:assert/strict";
import { processIntakeEventToJournal, assertJournalEntryBalanced } from "../dist/index.js";

console.log("▶ Running Automatic Intake Event Processing Tests...\n");

const registry = {
  cashDrawer: { id: "acc-cash-1010", name: "Shop Cash Drawer" },
  portalWallets: {
    PayNearby: { id: "acc-wallet-paynearby-1041", name: "PayNearby Wallet Float" },
    SpiceMoney: { id: "acc-wallet-spicemoney-1042", name: "Spice Money Wallet Float" },
  },
  upiHoldings: {
    PhonePe: { id: "acc-qr-phonepe-1031", name: "PhonePe QR Holding" },
    Paytm: { id: "acc-qr-paytm-1032", name: "Paytm QR Holding" },
  },
  bankAccounts: {
    SBI: { id: "acc-bank-sbi-1020", name: "SBI Current A/C" },
  },
  commissionIncome: { id: "acc-rev-comm-4100", name: "Digital Commission Income" },
  salesRevenue: { id: "acc-rev-sales-4000", name: "Sales Revenue" },
  payoutFeeExpense: { id: "acc-exp-fee-5010", name: "Portal IMPS Payout Charges" },
};

// 1. AEPS Cash Withdrawal Ingestion
{
  const aepsEvent = {
    source: "CHROME_EXTENSION",
    portalOrAppName: "PayNearby",
    serviceType: "AEPS_CASH_OUT",
    grossAmountPaisa: 300000n, // ₹3,000.00 cash given
    commissionPaisa: 850n,     // ₹8.50 commission earned
    rrnOrUtr: "412984019284",
    timestamp: "2026-10-04T10:30:00Z",
  };

  const journal = processIntakeEventToJournal(aepsEvent, registry);
  assert.equal(journal.lines.length, 3);
  assert.equal(journal.lines[0].debitPaisa, 300850n); // PayNearby Wallet gets ₹3,008.50
  assert.equal(journal.lines[1].creditPaisa, 300000n); // Cash Drawer gives ₹3,000.00
  assert.equal(journal.lines[2].creditPaisa, 850n);     // Commission Income gets ₹8.50
  assertJournalEntryBalanced(journal);
  console.log("✔ Test 1: Ingested AEPS Cash Out (₹3,000 + ₹8.50 comm) auto-balanced.");
}

// 2. DMT Money Transfer Ingestion
{
  const dmtEvent = {
    source: "CHROME_EXTENSION",
    portalOrAppName: "PayNearby",
    serviceType: "DMT",
    grossAmountPaisa: 500000n, // ₹5,000.00 sent
    commissionPaisa: 2500n,    // ₹25.00 customer fee kept by shop
    rrnOrUtr: "DMT9910283",
    timestamp: "2026-10-04T11:00:00Z",
  };

  const journal = processIntakeEventToJournal(dmtEvent, registry);
  assert.equal(journal.lines.length, 3);
  assert.equal(journal.lines[0].debitPaisa, 502500n);  // Cash Drawer gets ₹5,025
  assert.equal(journal.lines[1].creditPaisa, 500000n); // Wallet loses ₹5,000
  assert.equal(journal.lines[2].creditPaisa, 2500n);   // Shop profit gets ₹25
  assertJournalEntryBalanced(journal);
  console.log("✔ Test 2: Ingested DMT Money Transfer (₹5,000 sent + ₹25 fee) auto-balanced.");
}

// 3. Inward UPI QR Notification
{
  const upiEvent = {
    source: "ANDROID_NOTIFICATION",
    portalOrAppName: "PhonePe",
    serviceType: "UPI_INWARD",
    grossAmountPaisa: 15000n, // ₹150.00
    rrnOrUtr: "UTR88291028",
    timestamp: "2026-10-04T11:15:00Z",
  };

  const journal = processIntakeEventToJournal(upiEvent, registry);
  assert.equal(journal.lines.length, 2);
  assert.equal(journal.lines[0].debitPaisa, 15000n);
  assert.equal(journal.lines[1].creditPaisa, 15000n);
  assertJournalEntryBalanced(journal);
  console.log("✔ Test 3: Ingested UPI QR Payment (₹150 PhonePe) auto-balanced.");
}

// 4. Merchant Settlement to Bank
{
  const settleEvent = {
    source: "SMS",
    portalOrAppName: "PhonePe",
    serviceType: "MERCHANT_SETTLEMENT",
    grossAmountPaisa: 500000n, // ₹5,000.00
    netAmountPaisa: 500000n,
    timestamp: "2026-10-04T07:00:00Z",
  };

  const journal = processIntakeEventToJournal(settleEvent, registry);
  assert.equal(journal.lines[0].accountId, registry.bankAccounts.SBI.id);
  assert.equal(journal.lines[0].debitPaisa, 500000n); // Bank gets ₹5,000
  assert.equal(journal.lines[1].creditPaisa, 500000n); // PhonePe holding cleared
  assertJournalEntryBalanced(journal);
  console.log("✔ Test 4: Ingested Merchant Settlement (₹5,000 to SBI) auto-balanced.");
}

// 5. ATM Cash Refill
{
  const atmEvent = {
    source: "SMS",
    portalOrAppName: "SBI",
    serviceType: "ATM_WITHDRAWAL",
    grossAmountPaisa: 2000000n, // ₹20,000.00
    timestamp: "2026-10-04T09:00:00Z",
  };

  const journal = processIntakeEventToJournal(atmEvent, registry);
  assert.equal(journal.lines[0].debitPaisa, 2000000n); // Cash Drawer gets ₹20k
  assert.equal(journal.lines[1].creditPaisa, 2000000n); // Bank deducted ₹20k
  assertJournalEntryBalanced(journal);
  console.log("✔ Test 5: Ingested ATM Cash Refill (₹20,000 into Drawer) auto-balanced.");
}

console.log("\n=======================================================");
console.log("🎉 ALL INTAKE-TO-LEDGER AUTO JOURNAL TESTS PASSED 100%!");
console.log("=======================================================\n");
