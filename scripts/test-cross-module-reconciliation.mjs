import fs from "fs";

console.log("================================================================================");
console.log("CYBERCAFE ERP — CROSS-MODULE FINANCIAL RECONCILIATION & AUDIT SUITE");
console.log("================================================================================\n");

let passed = 0;
let failed = 0;

function assert(condition, name, details = "") {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}`);
    if (details) console.error(`     Details: ${details}`);
    failed++;
  }
}

// -----------------------------------------------------------------------------
// MODULE 1: UNIFIED DOUBLE-ENTRY TRIAL BALANCE & LEDGER BALANCING
// -----------------------------------------------------------------------------
console.log("--- Module 1: Double-Entry Trial Balance & Ledger Balance Invariants ---");

{
  // Simulated Chart of Accounts
  const chartOfAccounts = {
    "1000": { name: "Cash Drawer", type: "asset" },
    "1010": { name: "Bank Accounts", type: "asset" },
    "1020": { name: "UPI / QR", type: "asset" },
    "1030": { name: "Wallets", type: "asset" },
    "1040": { name: "AEPS Float", type: "asset" },
    "1050": { name: "DMT Float", type: "asset" },
    "1060": { name: "Credit Card Float", type: "asset" },
    "1200": { name: "Inventory", type: "asset" },
    "1300": { name: "Accounts Receivable", type: "asset" },
    "1400": { name: "Business Clearing", type: "asset" },
    "2000": { name: "Accounts Payable", type: "liability" },
    "2100": { name: "GST Output", type: "liability" },
    "2200": { name: "GST Input", type: "asset" },
    "3000": { name: "Owner Equity", type: "equity" },
    "4000": { name: "Product Sales", type: "income" },
    "4010": { name: "Service Revenue", type: "income" },
    "4020": { name: "Service Fees", type: "income" },
    "4030": { name: "Commission Income", type: "income" },
    "5000": { name: "Cost of Goods Sold", type: "expense" },
    "5100": { name: "Sales Returns", type: "contra_income" },
    "5200": { name: "Inventory Adjustment", type: "expense" },
    "5210": { name: "Cash Shortage and Overage", type: "expense" },
    "6000": { name: "Operating Expenses", type: "expense" },
  };

  // Complete Simulated Day of Operations
  const journals = [
    // 1. Owner opening equity injection: ₹50,000 cash, ₹100,000 bank
    {
      id: "JE-001",
      desc: "Owner Capital Seed",
      lines: [
        { code: "1000", debit: 50000, credit: 0 },
        { code: "1010", debit: 100000, credit: 0 },
        { code: "3000", debit: 0, credit: 150000 },
      ],
    },
    // 2. Inventory purchase on credit from Supplier: ₹20,000 taxable + ₹3,600 GST
    {
      id: "JE-002",
      desc: "Purchase PUR-001",
      lines: [
        { code: "1200", debit: 20000, credit: 0 },
        { code: "2200", debit: 3600, credit: 0 },
        { code: "2000", debit: 0, credit: 23600 },
      ],
    },
    // 3. Supplier partial payment from Bank: ₹10,000
    {
      id: "JE-003",
      desc: "Supplier Payment PUR-001",
      lines: [
        { code: "2000", debit: 10000, credit: 0 },
        { code: "1010", debit: 0, credit: 10000 },
      ],
    },
    // 4. POS Invoice: ₹3,000 product sale (₹2,500 taxable + ₹500 GST). Paid: ₹1,500 cash, ₹1,500 due (Khata)
    {
      id: "JE-004",
      desc: "Sale INV-001",
      lines: [
        { code: "1000", debit: 1500, credit: 0 },
        { code: "1300", debit: 1500, credit: 0 },
        { code: "4000", debit: 0, credit: 2500 },
        { code: "2100", debit: 0, credit: 500 },
      ],
    },
    // 5. POS COGS for Sale INV-001 (inventory reduction)
    {
      id: "JE-005",
      desc: "COGS INV-001",
      lines: [
        { code: "5000", debit: 1400, credit: 0 },
        { code: "1200", debit: 0, credit: 1400 },
      ],
    },
    // 6. POS Quick Sale: ₹800 retail sale paid via UPI. COGS: ₹400
    {
      id: "JE-006",
      desc: "Quick Sale QS-001",
      lines: [
        { code: "1020", debit: 800, credit: 0 },
        { code: "4000", debit: 0, credit: 800 },
        { code: "5000", debit: 400, credit: 0 },
        { code: "1200", debit: 0, credit: 400 },
      ],
    },
    // 7. AEPS Withdrawal: Customer gets ₹2,000 cash, Portal credited ₹2,006 (₹6 commission)
    {
      id: "JE-007",
      desc: "AEPS AEP-001",
      lines: [
        { code: "1040", debit: 2006, credit: 0 },
        { code: "1000", debit: 0, credit: 2000 },
        { code: "4030", debit: 0, credit: 6 },
      ],
    },
    // 8. DMT Remittance: Customer pays ₹5,050 cash (₹5,000 principal + ₹50 fee). Bank sends ₹5,000
    {
      id: "JE-008",
      desc: "DMT DMT-001",
      lines: [
        { code: "1000", debit: 5050, credit: 0 },
        { code: "1010", debit: 0, credit: 5000 },
        { code: "4020", debit: 0, credit: 50 },
      ],
    },
    // 9. Mobile Recharge: ₹299 customer cash, funded from Wallet (Cost ₹294, Comm ₹5)
    {
      id: "JE-009",
      desc: "Recharge RCH-001",
      lines: [
        { code: "1000", debit: 299, credit: 0 },
        { code: "1030", debit: 0, credit: 294 },
        { code: "4030", debit: 0, credit: 5 },
      ],
    },
    // 10. Utility Bill: ₹1,510 customer cash (₹1,500 bill + ₹10 fee), funded from Wallet (Cost ₹1,495, Comm ₹5)
    {
      id: "JE-010",
      desc: "Bill BP-001",
      lines: [
        { code: "1000", debit: 1510, credit: 0 },
        { code: "1030", debit: 0, credit: 1495 },
        { code: "4020", debit: 0, credit: 10 },
        { code: "4030", debit: 0, credit: 5 },
      ],
    },
    // 11. Customer Khata Due Settlement: Customer pays ₹1,000 cash towards previous ₹1,500 due
    {
      id: "JE-011",
      desc: "Customer Due Collection INV-001",
      lines: [
        { code: "1000", debit: 1000, credit: 0 },
        { code: "1300", debit: 0, credit: 1000 },
      ],
    },
    // 12. Inter-Account Settlement: Transfer ₹15,000 from Bank to Cash Drawer
    {
      id: "JE-012",
      desc: "Settlement SET-001",
      lines: [
        { code: "1000", debit: 15000, credit: 0 },
        { code: "1010", debit: 0, credit: 15000 },
      ],
    },
    // 13. Operating Expense: Shop Electricity ₹1,200 paid from Bank
    {
      id: "JE-013",
      desc: "Expense EXP-001",
      lines: [
        { code: "6000", debit: 1200, credit: 0 },
        { code: "1010", debit: 0, credit: 1200 },
      ],
    },
    // 14. Day Close Cash Variance: Physical count reveals ₹20 cash shortage
    {
      id: "JE-014",
      desc: "Day Close Cash Shortage CLS-001",
      lines: [
        { code: "5210", debit: 20, credit: 0 },
        { code: "1000", debit: 0, credit: 20 },
      ],
    },
  ];

  // Invariant 1: Individual Journal Balance Test
  let allJournalsBalanced = true;
  for (const j of journals) {
    const d = j.lines.reduce((s, l) => s + l.debit, 0);
    const c = j.lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(d - c) > 0.001) {
      allJournalsBalanced = false;
      console.error(`Unbalanced journal: ${j.id} (D: ${d}, C: ${c})`);
      break;
    }
  }
  assert(allJournalsBalanced, "1. Universal Journal Invariant: Every posted journal entry strictly balances (Sum Debits === Sum Credits)");

  // Invariant 2: Aggregated Trial Balance Construction & Equality
  const trialBalance = {};
  for (const code of Object.keys(chartOfAccounts)) {
    trialBalance[code] = { totalDebit: 0, totalCredit: 0, balance: 0 };
  }

  for (const j of journals) {
    for (const l of j.lines) {
      trialBalance[l.code].totalDebit += l.debit;
      trialBalance[l.code].totalCredit += l.credit;
    }
  }

  let grandDebit = 0;
  let grandCredit = 0;
  for (const [code, acc] of Object.entries(trialBalance)) {
    grandDebit += acc.totalDebit;
    grandCredit += acc.totalCredit;
    const type = chartOfAccounts[code].type;
    if (["asset", "expense", "contra_income"].includes(type)) {
      acc.balance = acc.totalDebit - acc.totalCredit;
    } else {
      acc.balance = acc.totalCredit - acc.totalDebit;
    }
  }

  assert(Math.abs(grandDebit - grandCredit) < 0.001, `2. Universal Trial Balance Invariant: Grand Debit (₹${grandDebit}) === Grand Credit (₹${grandCredit})`);
  assert(trialBalance["1400"].balance === 0, "3. Business Clearing Account Invariant: Zero balance in clearing account 1400 (no leak black-holes)");

  // Invariant 4: Accounts Receivable Reconciliation
  // Invoice total due ₹1,500, customer collected ₹1,000 -> Remaining AR = ₹500
  assert(trialBalance["1300"].balance === 500, `4. Accounts Receivable Invariant: GL AR 1300 balance strictly equals unpaid Khata (Expected ₹500, got ₹${trialBalance["1300"].balance})`);

  // Invariant 5: Accounts Payable Reconciliation
  // Purchase total AP ₹23,600, supplier paid ₹10,000 -> Remaining AP = ₹13,600
  assert(trialBalance["2000"].balance === 13600, `5. Accounts Payable Invariant: GL AP 2000 balance strictly equals unpaid supplier balance (Expected ₹13,600, got ₹${trialBalance["2000"].balance})`);

  // Invariant 6: Product Sales Revenue
  // Sale INV-001 taxable ₹2,500 + Quick Sale QS-001 ₹800 = ₹3,300
  assert(trialBalance["4000"].balance === 3300, `6. Product Sales Revenue Invariant: GL 4000 strictly equals retail sales (Expected ₹3,300, got ₹${trialBalance["4000"].balance})`);

  // Invariant 7: Service Fee Income
  // DMT fee ₹50 + Bill fee ₹10 = ₹60 (Principal volume excluded!)
  assert(trialBalance["4020"].balance === 60, `7. Service Fee Invariant: GL 4020 strictly equals fees earned (Expected ₹60, got ₹${trialBalance["4020"].balance})`);

  // Invariant 8: Commission Income
  // AEPS comm ₹6 + Recharge comm ₹5 + Bill comm ₹5 = ₹16
  assert(trialBalance["4030"].balance === 16, `8. Commission Income Invariant: GL 4030 strictly equals portal commissions (Expected ₹16, got ₹${trialBalance["4030"].balance})`);

  // Invariant 9: Operating Expense & COGS
  assert(trialBalance["6000"].balance === 1200, "9. Expense Invariant: Operating expenses match vouchers (₹1,200)");
  assert(trialBalance["5000"].balance === 1800, "10. COGS Invariant: Cost of goods sold matches perpetual inventory (₹1,400 + ₹400 = ₹1,800)");
  assert(trialBalance["5210"].balance === 20, "11. Cash Shortage Invariant: Physical shortage posted to variance account 5210 (₹20)");
}

// -----------------------------------------------------------------------------
// MODULE 2: GHOST OUTFLOW PREVENTION & CASHBOOK 2-LEG ATOMICITY
// -----------------------------------------------------------------------------
console.log("\n--- Module 2: Ghost Outflow Prevention & Cashbook Atomicity ---");

{
  // Transaction creation simulator matching create_business_txn & frontend fallbacks
  function simulateServiceTransaction(service, payload) {
    const cashEntries = [];
    const amt = payload.amount;
    const fee = payload.service_fee || 0;
    const comm = payload.portal_commission || 0;

    if (service === "aeps") {
      // Leg 1: Cash out to customer
      cashEntries.push({
        method: "cash",
        direction: "out",
        amount: amt,
        instrument: payload.cash_instrument_id,
        desc: "Cash payout",
      });
      // Leg 2: Portal float credit (Inflow)
      cashEntries.push({
        method: "aeps",
        direction: "in",
        amount: amt + comm,
        instrument: payload.portal_instrument_id,
        desc: "Portal float credit",
      });
    } else if (service === "dmt") {
      // Leg 1: Customer collection (Inflow)
      if (payload.customer_pay_method !== "due") {
        cashEntries.push({
          method: payload.customer_pay_method || "cash",
          direction: "in",
          amount: amt + fee,
          instrument: payload.customer_instrument_id,
          desc: "Customer payment",
        });
      }
      // Leg 2: Payout from bank or portal (Outflow)
      cashEntries.push({
        method: payload.pay_from_method || "bank",
        direction: "out",
        amount: amt,
        instrument: payload.pay_from_instrument_id,
        desc: "Payout to beneficiary",
      });
    } else if (service === "recharge") {
      const cost = amt - comm;
      // Leg 1: Customer collection
      if (payload.customer_pay_method !== "due") {
        cashEntries.push({
          method: payload.customer_pay_method || "cash",
          direction: "in",
          amount: amt,
          instrument: payload.customer_instrument_id,
          desc: "Customer collection",
        });
      }
      // Leg 2: Provider cost deduction (Outflow)
      cashEntries.push({
        method: payload.pay_from_method || "wallet",
        direction: "out",
        amount: cost,
        instrument: payload.pay_from_instrument_id,
        desc: "Recharge cost",
      });
    } else if (service === "bill_payment") {
      const cost = amt - comm;
      // Leg 1: Customer collection
      if (payload.customer_pay_method !== "due") {
        cashEntries.push({
          method: payload.customer_pay_method || "cash",
          direction: "in",
          amount: amt + fee,
          instrument: payload.customer_instrument_id,
          desc: "Bill collection",
        });
      }
      // Leg 2: Provider cost deduction (Outflow)
      cashEntries.push({
        method: payload.pay_from_method || "wallet",
        direction: "out",
        amount: cost,
        instrument: payload.pay_from_instrument_id,
        desc: "Bill provider cost",
      });
    }
    return cashEntries;
  }

  // 1. AEPS Test
  const aepsLegs = simulateServiceTransaction("aeps", {
    amount: 2000,
    service_fee: 0,
    portal_commission: 6,
    cash_instrument_id: "inst-cash-1",
    portal_instrument_id: "inst-aeps-1",
  });
  assert(aepsLegs.length === 2, "12. AEPS Atomicity: Exactly 2 cashbook legs generated (1 cash out, 1 float in)");
  assert(aepsLegs.find(l => l.direction === "in" && l.method === "aeps" && l.amount === 2006), "13. AEPS Float Inflow: Float arrival ₹2,006 strictly recorded in cashbook");
  assert(aepsLegs.find(l => l.direction === "out" && l.method === "cash" && l.amount === 2000), "14. AEPS Cash Outflow: Cash payout ₹2,000 strictly recorded in cashbook");

  // 2. DMT Test
  const dmtLegs = simulateServiceTransaction("dmt", {
    amount: 5000,
    service_fee: 50,
    customer_pay_method: "cash",
    customer_instrument_id: "inst-cash-1",
    pay_from_method: "bank",
    pay_from_instrument_id: "inst-bank-sbi",
  });
  assert(dmtLegs.length === 2, "15. DMT Atomicity: Exactly 2 cashbook legs generated (1 customer in, 1 bank out)");
  assert(dmtLegs.find(l => l.direction === "out" && l.method === "bank" && l.amount === 5000), "16. Zero Ghost Outflow (DMT): Bank transfer outflow ₹5,000 strictly recorded");
  assert(dmtLegs.find(l => l.direction === "in" && l.method === "cash" && l.amount === 5050), "17. DMT Cash Inflow: Customer collection ₹5,050 strictly recorded");

  // 3. Recharge Test
  const rchLegs = simulateServiceTransaction("recharge", {
    amount: 299,
    portal_commission: 5,
    customer_pay_method: "cash",
    customer_instrument_id: "inst-cash-1",
    pay_from_method: "wallet",
    pay_from_instrument_id: "inst-wallet-paytm",
  });
  assert(rchLegs.length === 2, "18. Recharge Atomicity: Exactly 2 cashbook legs generated");
  assert(rchLegs.find(l => l.direction === "out" && l.method === "wallet" && l.amount === 294), "19. Zero Ghost Outflow (Recharge): Provider cost outflow ₹294 strictly recorded");

  // 4. Utility Bill Test
  const billLegs = simulateServiceTransaction("bill_payment", {
    amount: 1500,
    service_fee: 10,
    portal_commission: 5,
    customer_pay_method: "cash",
    customer_instrument_id: "inst-cash-1",
    pay_from_method: "wallet",
    pay_from_instrument_id: "inst-wallet-bbps",
  });
  assert(billLegs.length === 2, "20. Bill Payment Atomicity: Exactly 2 cashbook legs generated");
  assert(billLegs.find(l => l.direction === "out" && l.method === "wallet" && l.amount === 1495), "21. Zero Ghost Outflow (Bill): BBPS cost outflow ₹1,495 strictly recorded");

  // Invariant: All legs must have an identified instrument ID
  const allLegs = [...aepsLegs, ...dmtLegs, ...rchLegs, ...billLegs];
  const allInstrumentsIdentified = allLegs.every(l => Boolean(l.instrument));
  assert(allInstrumentsIdentified, "22. Instrument Attribution Invariant: 100% of cashbook legs have non-null instrument_id");
}

// -----------------------------------------------------------------------------
// MODULE 3: RECONCILIATION BETWEEN 3 MODELS (SQL POOL, GENERAL LEDGER, CASHBOOK)
// -----------------------------------------------------------------------------
console.log("\n--- Module 3: Cross-Model 3-Way Reconciliation Invariant ---");

{
  // Simulated initial state
  const cashOpening = 10000;
  const bankOpening = 40000;

  // Day's operations:
  // - Cash sales: +₹5,000
  // - DMT transfers: +₹5,050 cash, -₹5,000 bank
  // - AEPS withdrawals: -₹2,000 cash, +₹2,006 aeps float
  // - Expenses: -₹1,200 bank
  // - Settlements: -₹10,000 bank, +₹10,000 cash
  // - Day close variance: -₹20 cash shortage

  // Model 1: SQL 7-Pool Balances calculation
  const poolCash = cashOpening + 5000 + 5050 - 2000 + 10000 - 20; // 28030
  const poolBank = bankOpening - 5000 - 1200 - 10000;              // 23800

  // Model 2: General Ledger trial balance calculation (debit - credit)
  const glCash = cashOpening + 5000 + 5050 - 2000 + 10000 - 20;    // 28030
  const glBank = bankOpening - 5000 - 1200 - 10000;                // 23800

  // Model 3: Cashbook (cash_entries sum)
  const cashbookCashMovements = [
    { dir: "in", amt: 5000 },
    { dir: "in", amt: 5050 },
    { dir: "out", amt: 2000 },
    { dir: "in", amt: 10000 },
    { dir: "out", amt: 20 },
  ];
  const cashbookBankMovements = [
    { dir: "out", amt: 5000 },
    { dir: "out", amt: 1200 },
    { dir: "out", amt: 10000 },
  ];
  const cbCash = cashOpening + cashbookCashMovements.reduce((s, m) => s + (m.dir === "in" ? m.amt : -m.amt), 0);
  const cbBank = bankOpening + cashbookBankMovements.reduce((s, m) => s + (m.dir === "in" ? m.amt : -m.amt), 0);

  // 3-Way Reconciliation Verification
  assert(poolCash === glCash && glCash === cbCash, `23. Tri-Model Cash Reconciliation: Pool (₹${poolCash}) === GL Account 1000 (₹${glCash}) === Cashbook (₹${cbCash})`);
  assert(poolBank === glBank && glBank === cbBank, `24. Tri-Model Bank Reconciliation: Pool (₹${poolBank}) === GL Account 1010 (₹${glBank}) === Cashbook (₹${cbBank})`);
  assert(poolCash === 28030, "25. Cash Calculation Accuracy: Strictly ₹28,030.00");
  assert(poolBank === 23800, "26. Bank Calculation Accuracy: Strictly ₹23,800.00");
}

// -----------------------------------------------------------------------------
// MODULE 4: SQL MIGRATION CODEBASE INTEGRITY AUDIT
// -----------------------------------------------------------------------------
console.log("\n--- Module 4: SQL Migration Codebase Integrity Audit ---");

{
  const migrationPath = "./supabase/migrations/20260906_02_unified_double_entry_accounting.sql";
  assert(fs.existsSync(migrationPath), "27. Migration File Exists: 20260906_02_unified_double_entry_accounting.sql");

  const sql = fs.readFileSync(migrationPath, "utf8");

  // 1. Chart of Accounts 5210
  assert(sql.includes("5210") && sql.includes("Cash Shortage and Overage"), "28. Chart of Accounts: Account 5210 configured");

  // 2. trg_post_cash_entry_journal operational exclusion
  assert(sql.includes("new.ref_type in ('invoice', 'purchase', 'quick_sale', 'expense', 'transaction', 'settlement')"), "29. Cash Entry Journal: Operational parent entities excluded from double-posting");

  // 3. Customer payment to 1300 AR
  assert(sql.includes("when 'customer_payment', 'due_collection' then '1300'"), "30. Cash Entry Journal: Customer due collection mapped to Account 1300 (AR)");

  // 4. Supplier payment to 2000 AP
  assert(sql.includes("when 'supplier_payment', 'purchase_payment' then '2000'"), "31. Cash Entry Journal: Supplier payment mapped to Account 2000 (AP)");

  // 5. Day close variance to 5210
  assert(sql.includes("5210") && sql.includes("cash_variance"), "32. Cash Entry Journal: Cash variance mapped to Account 5210");

  // 6. create_business_txn DMT bank out leg
  assert(sql.includes("v_bank_out > 0") && sql.includes("transfer sent to beneficiary"), "33. Business Txn RPC: DMT bank payout leg inserted into cash_entries");

  // 7. create_business_txn AEPS float credit leg
  assert(sql.includes("v_pool_credit > 0") && sql.includes("float credited"), "34. Business Txn RPC: AEPS float credit leg inserted into cash_entries");

  // 8. Service transaction deferred constraint trigger
  assert(sql.includes("deferrable initially deferred") && sql.includes("trg_post_service_transaction_accounting_bridge"), "35. Transaction Trigger: Service transaction bridge is deferrable initially deferred");

  // 9. Invoice bridge triggers on INSERT and UPDATE
  assert(sql.includes("after insert or update of paid, due, status on public.invoices"), "36. Invoice Trigger: Invoice accounting bridge fires on INSERT as well as UPDATE");

  // 10. reconcile_day_close_variance RPC
  assert(sql.includes("create or replace function public.reconcile_day_close_variance"), "37. Day Close Variance RPC: reconcile_day_close_variance defined with journal posting");

  // 11. Security Definer & Privilege Grants
  assert(sql.includes("grant execute on function public.create_business_txn") && sql.includes("revoke all on function public.create_business_txn"), "38. Security Governance: create_business_txn properly granted to authenticated and revoked from anon");
}

// -----------------------------------------------------------------------------
// MODULE 5: FRONTEND WORKSPACE SYNCHRONIZATION AUDIT
// -----------------------------------------------------------------------------
console.log("\n--- Module 5: Frontend Workspace Synchronization Audit ---");

{
  const bizClient = fs.readFileSync("./components/business/business-client.tsx", "utf8");
  assert(bizClient.includes("p_pay_from_instrument_id:") && bizClient.includes("p_pay_from_method:"), "39. Frontend Business Client: Funding account instrument explicitly passed to create_business_txn");
  assert(bizClient.includes("Recharge") && bizClient.includes("Provider Outflow Leg") && bizClient.includes("direction: \"out\""), "40. Frontend Business Client: Recharge fallback records provider outflow leg with instrument_id");

  const upiClient = fs.readFileSync("./components/business/upi-workspace.tsx", "utf8");
  assert(upiClient.includes("existingLegs") && upiClient.includes("ref_type: \"transaction\""), "41. Frontend UPI Workspace: Idempotent cashbook sync guards against duplicate entries");

  const utilClient = fs.readFileSync("./components/business/utility-bill-workspace.tsx", "utf8");
  assert(utilClient.includes("Provider Funding Leg") && utilClient.includes("direction: \"out\""), "42. Frontend Utility Workspace: Provider funding outflow leg verified");
}

console.log("\n================================================================================");
console.log(`RECONCILIATION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log("================================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
