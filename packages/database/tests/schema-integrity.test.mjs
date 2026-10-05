/**
 * packages/database/tests/schema-integrity.test.mjs
 * Verification of Drizzle ORM Schema and Default Seed Data.
 */

import assert from "node:assert/strict";
import {
  tenants,
  accounts,
  creditCardDetails,
  loanDetails,
  customers,
  invoices,
  invoiceItems,
  paymentClaims,
  paymentAllocations,
  contraTransfers,
  journalEntries,
  journalLines,
  ingestedEvents,
  dayCloses,
  dayCloseDenominations,
  DEFAULT_ACCOUNTS_SEED,
} from "../dist/index.js";

console.log("▶ Running Drizzle ORM Schema & Seed Integrity Tests...\n");

// 1. Verify Table Definitions
const tables = [
  { name: "tenants", obj: tenants },
  { name: "accounts", obj: accounts },
  { name: "creditCardDetails", obj: creditCardDetails },
  { name: "loanDetails", obj: loanDetails },
  { name: "customers", obj: customers },
  { name: "invoices", obj: invoices },
  { name: "invoiceItems", obj: invoiceItems },
  { name: "paymentClaims", obj: paymentClaims },
  { name: "paymentAllocations", obj: paymentAllocations },
  { name: "contraTransfers", obj: contraTransfers },
  { name: "journalEntries", obj: journalEntries },
  { name: "journalLines", obj: journalLines },
  { name: "ingestedEvents", obj: ingestedEvents },
  { name: "dayCloses", obj: dayCloses },
  { name: "dayCloseDenominations", obj: dayCloseDenominations },
];

for (const t of tables) {
  assert(t.obj, `Table ${t.name} must be exported and defined`);
  console.log(`✔ Table verified: ${t.name}`);
}

// 2. Verify Seed Data
assert(Array.isArray(DEFAULT_ACCOUNTS_SEED), "Seed data must be an array");
assert(DEFAULT_ACCOUNTS_SEED.length >= 15, "Expected at least 15 seed accounts");

const cashAccount = DEFAULT_ACCOUNTS_SEED.find((a) => a.code === "1010");
assert(cashAccount && cashAccount.type === "CASH", "Cash Drawer 1010 must exist as CASH");

const sbiAccount = DEFAULT_ACCOUNTS_SEED.find((a) => a.code === "1020-SBI");
assert(sbiAccount && sbiAccount.type === "BANK", "SBI 1020 must exist as BANK");

const phonePeAccount = DEFAULT_ACCOUNTS_SEED.find((a) => a.code === "1031-PHONEPE");
assert(phonePeAccount && phonePeAccount.type === "UPI_HOLDING", "PhonePe must exist as UPI_HOLDING");

const payNearbyAccount = DEFAULT_ACCOUNTS_SEED.find((a) => a.code === "1041-PAYNEARBY");
assert(payNearbyAccount && payNearbyAccount.type === "WALLET", "PayNearby must exist as WALLET");

const hdfcCard = DEFAULT_ACCOUNTS_SEED.find((a) => a.code === "2010-HDFC-CARD");
assert(hdfcCard && hdfcCard.type === "CREDIT_CARD", "HDFC Card must exist as CREDIT_CARD");

console.log(`✔ Verified ${DEFAULT_ACCOUNTS_SEED.length} default accounts seed entries.`);

console.log("\n=======================================================");
console.log("🎉 ALL DATABASE SCHEMA & SEED TESTS PASSED 100%!");
console.log("=======================================================\n");
