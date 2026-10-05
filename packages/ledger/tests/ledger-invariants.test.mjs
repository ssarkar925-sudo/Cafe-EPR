/**
 * packages/ledger/tests/ledger-invariants.test.mjs
 * Rigorous invariant verification suite for CafeERP double-entry ledger.
 */

import assert from "node:assert/strict";
import {
  assertJournalEntryBalanced,
  createInwardSaleEntry,
  createMerchantSettlementEntry,
  createOutwardPaymentEntry,
  createContraTransferEntry,
  createDayCloseVarianceEntry,
  LedgerInvariantError,
} from "../dist/index.js";

console.log("▶ Running CafeERP Double-Entry Ledger Invariant Suite...\n");

const ACCOUNTS = {
  cashDrawer: { id: "acc-cash-1010", name: "Shop Cash Drawer" },
  sbiBank: { id: "acc-sbi-1020", name: "SBI Current A/C" },
  hdfcBank: { id: "acc-hdfc-1021", name: "HDFC Savings A/C" },
  phonePeHolding: { id: "acc-qr-phonepe-1031", name: "PhonePe Merchant QR Holding" },
  paytmHolding: { id: "acc-qr-paytm-1032", name: "Paytm QR Holding" },
  payNearbyWallet: { id: "acc-wallet-paynearby-1041", name: "PayNearby Portal Float" },
  hdfcCard: { id: "acc-card-hdfc-2010", name: "HDFC Millennia Credit Card" },
  khataCustomer: { id: "acc-khata-rahul-1301", name: "Khata - Rahul Kumar" },
  salesRevenue: { id: "acc-rev-sales-4000", name: "Sales & Services Revenue" },
  payoutFeeExpense: { id: "acc-exp-payout-5010", name: "Portal IMPS Payout Charges" },
  storeExpense: { id: "acc-exp-store-6010", name: "Store General Expense" },
  cashVarianceExp: { id: "acc-exp-variance-5210", name: "Cash Shortage Variance" },
  cashVarianceGain: { id: "acc-rev-variance-4210", name: "Cash Overage Gain" },
};

// 1. Inward Single Cash Sale
{
  const entry = createInwardSaleEntry({
    invoiceId: "INV-1001",
    date: "2026-10-04",
    grandTotalPaisa: 10000n, // ₹100.00
    salesRevenueAccount: ACCOUNTS.salesRevenue,
    allocations: [
      { account: ACCOUNTS.cashDrawer, amountPaisa: 10000n, methodLabel: "CASH" },
    ],
  });
  assert.equal(entry.lines.length, 2);
  assertJournalEntryBalanced(entry);
  console.log("✔ Test 1: Inward Single Cash Sale (₹100) balanced.");
}

// 2. Inward Split Payment (Cash ₹200 + PhonePe QR ₹300 = ₹500)
{
  const entry = createInwardSaleEntry({
    invoiceId: "INV-1002",
    date: "2026-10-04",
    grandTotalPaisa: 50000n, // ₹500.00
    salesRevenueAccount: ACCOUNTS.salesRevenue,
    allocations: [
      { account: ACCOUNTS.cashDrawer, amountPaisa: 20000n, methodLabel: "CASH" },
      { account: ACCOUNTS.phonePeHolding, amountPaisa: 30000n, methodLabel: "UPI" },
    ],
  });
  assert.equal(entry.lines.length, 3);
  assert.equal(entry.lines[0].debitPaisa, 20000n);
  assert.equal(entry.lines[1].debitPaisa, 30000n);
  assert.equal(entry.lines[2].creditPaisa, 50000n);
  assertJournalEntryBalanced(entry);
  console.log("✔ Test 2: Inward Split Payment (Cash ₹200 + UPI ₹300) balanced.");
}

// 3. Inward Split Imbalance Rejection
{
  assert.throws(
    () => {
      createInwardSaleEntry({
        invoiceId: "INV-1003",
        date: "2026-10-04",
        grandTotalPaisa: 50000n, // ₹500.00
        salesRevenueAccount: ACCOUNTS.salesRevenue,
        allocations: [
          { account: ACCOUNTS.cashDrawer, amountPaisa: 20000n, methodLabel: "CASH" },
          // Missing ₹300!
        ],
      });
    },
    LedgerInvariantError,
    "Expected error on allocation mismatch"
  );
  console.log("✔ Test 3: Inward Split Imbalance correctly rejected.");
}

// 4. Merchant QR Settlement (PhonePe Holding ➔ HDFC Bank)
{
  const entry = createMerchantSettlementEntry({
    settlementId: "SETTLE-901",
    date: "2026-10-04",
    grossAmountPaisa: 50000n,
    netSettledPaisa: 50000n,
    bankAccount: ACCOUNTS.hdfcBank,
    upiHoldingAccount: ACCOUNTS.phonePeHolding,
  });
  assert.equal(entry.lines[0].accountId, ACCOUNTS.hdfcBank.id);
  assert.equal(entry.lines[0].debitPaisa, 50000n);
  assert.equal(entry.lines[1].accountId, ACCOUNTS.phonePeHolding.id);
  assert.equal(entry.lines[1].creditPaisa, 50000n);
  assertJournalEntryBalanced(entry);
  console.log("✔ Test 4: Merchant QR Settlement (₹500 to Bank) balanced with zero double-counting.");
}

// 5. Outward Expense: Paid from Credit Card
{
  const entry = createOutwardPaymentEntry({
    paymentId: "PAY-501",
    date: "2026-10-04",
    amountPaisa: 250000n, // ₹2,500.00
    sourceAccount: ACCOUNTS.hdfcCard,
    targetCategoryAccount: ACCOUNTS.storeExpense,
    paidTo: "Amazon Business",
  });
  assert.equal(entry.lines[0].debitPaisa, 250000n);
  assert.equal(entry.lines[1].creditPaisa, 250000n);
  assertJournalEntryBalanced(entry);
  console.log("✔ Test 5: Outward Expense paid on Credit Card (₹2,500) balanced.");
}

// 6. Contra: Cash Deposit to Bank (CDM)
{
  const entry = createContraTransferEntry({
    transferId: "TXF-001",
    date: "2026-10-04",
    fromAccount: ACCOUNTS.cashDrawer,
    toAccount: ACCOUNTS.sbiBank,
    amountPaisa: 4000000n, // ₹40,000.00
  });
  assert.equal(entry.lines[0].debitPaisa, 4000000n); // SBI gets ₹40k
  assert.equal(entry.lines[1].creditPaisa, 4000000n); // Cash leaves ₹40k
  assertJournalEntryBalanced(entry);
  console.log("✔ Test 6: Contra Cash Deposit to Bank (₹40,000) balanced.");
}

// 7. Contra: Bank to Bank Transfer (HDFC ➔ SBI)
{
  const entry = createContraTransferEntry({
    transferId: "TXF-002",
    date: "2026-10-04",
    fromAccount: ACCOUNTS.hdfcBank,
    toAccount: ACCOUNTS.sbiBank,
    amountPaisa: 5000000n, // ₹50,000.00
  });
  assert.equal(entry.lines[0].debitPaisa, 5000000n);
  assert.equal(entry.lines[1].creditPaisa, 5000000n);
  assertJournalEntryBalanced(entry);
  console.log("✔ Test 7: Contra Bank to Bank Transfer (₹50,000) balanced.");
}

// 8. Contra: AEPS Move-to-Bank with ₹5 IMPS Payout Fee
{
  const entry = createContraTransferEntry({
    transferId: "TXF-003",
    date: "2026-10-04",
    fromAccount: ACCOUNTS.payNearbyWallet,
    toAccount: ACCOUNTS.sbiBank,
    amountPaisa: 5000000n, // ₹50,000.00 to Bank
    feePaisa: 500n,        // ₹5.00 Payout Fee
    feeExpenseAccount: ACCOUNTS.payoutFeeExpense,
  });
  assert.equal(entry.lines.length, 3);
  assert.equal(entry.lines[0].debitPaisa, 5000000n); // Bank gets ₹50k
  assert.equal(entry.lines[1].debitPaisa, 500n);     // Expense gets ₹5
  assert.equal(entry.lines[2].creditPaisa, 5000500n); // Wallet loses ₹50,005
  assertJournalEntryBalanced(entry);
  console.log("✔ Test 8: Contra AEPS Move-to-Bank with ₹5 Payout Fee balanced.");
}

// 9. Contra: Bank to Wallet Load
{
  const entry = createContraTransferEntry({
    transferId: "TXF-004",
    date: "2026-10-04",
    fromAccount: ACCOUNTS.sbiBank,
    toAccount: ACCOUNTS.payNearbyWallet,
    amountPaisa: 2500000n, // ₹25,000.00
  });
  assert.equal(entry.lines[0].debitPaisa, 2500000n);
  assert.equal(entry.lines[1].creditPaisa, 2500000n);
  assertJournalEntryBalanced(entry);
  console.log("✔ Test 9: Contra Bank to Wallet Load (₹25,000) balanced.");
}

// 10. Contra: Bank to Credit Card Repayment
{
  const entry = createContraTransferEntry({
    transferId: "TXF-005",
    date: "2026-10-04",
    fromAccount: ACCOUNTS.sbiBank,
    toAccount: ACCOUNTS.hdfcCard,
    amountPaisa: 2200000n, // ₹22,000.00
  });
  assert.equal(entry.lines[0].debitPaisa, 2200000n); // Card liability reduced
  assert.equal(entry.lines[1].creditPaisa, 2200000n); // Bank deducted
  assertJournalEntryBalanced(entry);
  console.log("✔ Test 10: Contra Credit Card Repayment (₹22,000) balanced.");
}

// 11. Day Close Cash Shortage (₹20 shortage)
{
  const entry = createDayCloseVarianceEntry({
    dayCloseId: "DC-2026-10-04",
    date: "2026-10-04",
    cashDrawerAccount: ACCOUNTS.cashDrawer,
    varianceExpenseAccount: ACCOUNTS.cashVarianceExp,
    varianceGainAccount: ACCOUNTS.cashVarianceGain,
    variancePaisa: -2000n, // -₹20.00
  });
  assert.equal(entry.lines[0].accountId, ACCOUNTS.cashVarianceExp.id);
  assert.equal(entry.lines[0].debitPaisa, 2000n);
  assert.equal(entry.lines[1].accountId, ACCOUNTS.cashDrawer.id);
  assert.equal(entry.lines[1].creditPaisa, 2000n);
  assertJournalEntryBalanced(entry);
  console.log("✔ Test 11: Day Close Cash Shortage (-₹20) balanced.");
}

// 12. Day Close Cash Overage (+₹50 overage)
{
  const entry = createDayCloseVarianceEntry({
    dayCloseId: "DC-2026-10-04-B",
    date: "2026-10-04",
    cashDrawerAccount: ACCOUNTS.cashDrawer,
    varianceExpenseAccount: ACCOUNTS.cashVarianceExp,
    varianceGainAccount: ACCOUNTS.cashVarianceGain,
    variancePaisa: 5000n, // +₹50.00
  });
  assert.equal(entry.lines[0].accountId, ACCOUNTS.cashDrawer.id);
  assert.equal(entry.lines[0].debitPaisa, 5000n);
  assert.equal(entry.lines[1].accountId, ACCOUNTS.cashVarianceGain.id);
  assert.equal(entry.lines[1].creditPaisa, 5000n);
  assertJournalEntryBalanced(entry);
  console.log("✔ Test 12: Day Close Cash Overage (+₹50) balanced.");
}

console.log("\n=======================================================");
console.log("🎉 ALL 12 FINANCIAL INVARIANT CONTRACTS VERIFIED 100%!");
console.log("=======================================================\n");
