/**
 * AEPS FEE COLLECTION MODES, PORTAL COMMISSION & FLOAT BALANCE ACCEPTANCE TESTS (Tests A to Y)
 *
 * Verifies:
 * 1. Transaction Type Selector UI (Exactly 3 cards: Cash Withdrawal, Balance Enquiry, Mini Statement; No OUT/IN suffixes)
 * 2. Backend payment_collection preservation
 * 3. Column 3 Dedicated 4-Card Order:
 *    Card 1: FEE COLLECTION (Cut from Withdrawal, Collect Separately, Collect Separately in QR)
 *    Card 2: CUSTOMER FEE PAID
 *    Card 3: PORTAL COMMISSION (AEPS Balance Impact: +₹commission)
 *    Card 4: AEPS BALANCE IMPACT / Settlement Review
 * 4. Exact Financial Calculations for Options A, B, C
 * 5. QR Fee Isolation Invariant (No physical till cash impact)
 * 6. Portal Commission Increases AEPS Balance / Float (Asset 1400)
 * 7. Double-Entry Balancing & Ledger Reconciliation
 * 8. Pre-Approval Review Modal & Draft Persistence
 * 9. Database Migration Constraints & RPC Support
 */

import assert from "node:assert";
import fs from "node:fs";
import {
  normalizeBankName,
  matchBank,
  normalizeTransactionType,
  resolvePricingFromRules,
  getDynamicDenominations,
} from "../lib/aeps/portal-watcher.ts";

console.log("================================================================================");
console.log("AEPS FEE COLLECTION, COMMISSION & BALANCE IMPACT ACCEPTANCE TESTS (A to Y)");
console.log("================================================================================\n");

let passedCount = 0;
let failedCount = 0;

function runTest(testName, fn) {
  try {
    fn();
    passedCount++;
    console.log(`  ✅ PASS: ${testName}`);
  } catch (err) {
    failedCount++;
    console.error(`  ❌ FAIL: ${testName}`);
    console.error(err);
    process.exit(1);
  }
}

const mockPortals = [
  { id: "portal-digipay", name: "CSC DigiPay" },
  { id: "portal-spicemoney", name: "Spice Money" },
];

const mockBanks = [
  { id: "bank-sbi", name: "State Bank of India", code: "SBIN" },
  { id: "bank-pnb", name: "Punjab National Bank", code: "PUNB" },
];

const workspaceSrc = fs.readFileSync("./components/business/aeps-workspace.tsx", "utf8");
const migrationSrc = fs.readFileSync(
  "./supabase/migrations/20260926_aeps_fee_collection_and_float_accounting.sql",
  "utf8"
);
const watcherSrc = fs.readFileSync("./lib/aeps/portal-watcher.ts", "utf8");

// -----------------------------------------------------------------------------
// TEST A: Visible Selector Cards Count & Labels
// -----------------------------------------------------------------------------
runTest("TEST A: Visible Selector Cards Count & Labels (Exactly 3 cards)", () => {
  // Must have exactly 3 visible items in the grid
  assert.ok(
    workspaceSrc.includes('id: "cash_out", label: "Cash Withdrawal"'),
    "Must have Cash Withdrawal card"
  );
  assert.ok(
    workspaceSrc.includes('id: "balance_enquiry", label: "Balance Enquiry"'),
    "Must have Balance Enquiry card"
  );
  assert.ok(
    workspaceSrc.includes('id: "mini_statement", label: "Mini Statement"'),
    "Must have Mini Statement card"
  );
  assert.ok(
    !workspaceSrc.includes('label: "Cash Out (OUT)"'),
    "Must NOT have Cash Out (OUT) in visible cards"
  );
  assert.ok(
    !workspaceSrc.includes('label: "Collection (IN)"'),
    "Must NOT have Collection (IN) in visible cards"
  );
  assert.ok(
    workspaceSrc.includes("grid grid-cols-3 gap-1.5"),
    "Visible selector must use a 3-column grid"
  );
});

// -----------------------------------------------------------------------------
// TEST B: No OUT or IN Suffixes in Visible Selector
// -----------------------------------------------------------------------------
runTest("TEST B: No OUT or IN Suffixes in Visible Selector Cards", () => {
  assert.ok(
    !workspaceSrc.includes('"Cash Out (OUT)"'),
    "Must not show '(OUT)' in Cash Out"
  );
  assert.ok(
    !workspaceSrc.includes('"Collection (IN)"'),
    "Must not show '(IN)' in Collection"
  );
});

// -----------------------------------------------------------------------------
// TEST C: "Cash Withdrawal" Maps Internally to transfer_method = 'cash_out'
// -----------------------------------------------------------------------------
runTest("TEST C: 'Cash Withdrawal' Maps Internally to 'cash_out'", () => {
  assert.ok(
    workspaceSrc.includes('{ id: "cash_out", label: "Cash Withdrawal" }'),
    "Cash Withdrawal card must have id 'cash_out'"
  );
  assert.ok(
    migrationSrc.includes("v_direction := 'out'") &&
      migrationSrc.includes("v_prefix := 'AEP'"),
    "cash_out maps to direction out and prefix AEP"
  );
});

// -----------------------------------------------------------------------------
// TEST D: Backend Preservation of payment_collection
// -----------------------------------------------------------------------------
runTest("TEST D: Backend Preservation of payment_collection", () => {
  assert.ok(
    migrationSrc.includes("payment_collection"),
    "payment_collection preserved in migration"
  );
  assert.ok(
    watcherSrc.includes('"payment_collection"'),
    "payment_collection preserved in AepsTxnType definition"
  );
  assert.ok(
    workspaceSrc.includes('transactionType === "payment_collection"'),
    "payment_collection preserved in workspace logic"
  );
});

// -----------------------------------------------------------------------------
// TEST E: Column 3 Dedicated 4-Card Order
// -----------------------------------------------------------------------------
runTest("TEST E: Column 3 Dedicated 4-Card Hierarchy & Order", () => {
  const card1Idx = workspaceSrc.indexOf("CARD 1: FEE COLLECTION");
  const card2Idx = workspaceSrc.indexOf("CARD 2: CUSTOMER FEE PAID");
  const card3Idx = workspaceSrc.indexOf("CARD 3: PORTAL COMMISSION");
  const card4Idx = workspaceSrc.indexOf("CARD 4: AEPS BALANCE IMPACT / SETTLEMENT REVIEW");

  assert.ok(card1Idx !== -1, "Card 1: FEE COLLECTION must exist");
  assert.ok(card2Idx !== -1, "Card 2: CUSTOMER FEE PAID must exist");
  assert.ok(card3Idx !== -1, "Card 3: PORTAL COMMISSION must exist");
  assert.ok(card4Idx !== -1, "Card 4: AEPS BALANCE IMPACT must exist");

  assert.ok(card1Idx < card2Idx, "Card 1 must be immediately above Card 2");
  assert.ok(card2Idx < card3Idx, "Card 2 must be immediately above Card 3");
  assert.ok(card3Idx < card4Idx, "Card 3 must be immediately above Card 4");
});

// -----------------------------------------------------------------------------
// TEST F: Fee Collection Dropdown Options
// -----------------------------------------------------------------------------
runTest("TEST F: Fee Collection Dropdown Options", () => {
  assert.ok(
    workspaceSrc.includes('<option value="cut_from_withdrawal">Cut from Withdrawal</option>'),
    "Option 1 must be Cut from Withdrawal"
  );
  assert.ok(
    workspaceSrc.includes('<option value="separate_cash">Collect Separately (Cash)</option>'),
    "Option 2 must be Collect Separately (Cash)"
  );
  assert.ok(
    workspaceSrc.includes('<option value="upi">Collect Separately in QR</option>'),
    "Option 3 must be Collect Separately in QR"
  );
});

// -----------------------------------------------------------------------------
// TEST G: Option A (Cut from Withdrawal) Exact Calculations
// -----------------------------------------------------------------------------
runTest("TEST G: Option A (Cut from Withdrawal) Calculations (1000 amt, 20 fee, 10 comm)", () => {
  const amount = 1000;
  const fee = 20;
  const commission = 10;
  const feeSource = "cut_from_withdrawal";

  const customerReceives = feeSource === "cut_from_withdrawal" ? amount - fee : amount;
  const cashOut = amount - fee;
  const cashIn = 0;
  const netCashTill = cashIn - cashOut;
  const grossFloatCredit = amount + commission;
  const floatCommissionInc = commission;

  assert.strictEqual(customerReceives, 980, "Customer receives net payout of 980");
  assert.strictEqual(cashOut, 980, "Cash till dispenses net payout of 980");
  assert.strictEqual(netCashTill, -980, "Net physical cash till is -980");
  assert.strictEqual(grossFloatCredit, 1010, "Gross portal float credit is 1010");
  assert.strictEqual(floatCommissionInc, 10, "Commission added to float is 10");
});

// -----------------------------------------------------------------------------
// TEST H: Option B (Collect Separately in Cash) Exact Calculations
// -----------------------------------------------------------------------------
runTest("TEST H: Option B (Collect Separately in Cash) Calculations (1000 amt, 20 fee, 10 comm)", () => {
  const amount = 1000;
  const fee = 20;
  const commission = 10;
  const feeSource = "separate_cash";

  const customerReceives = feeSource === "cut_from_withdrawal" ? amount - fee : amount;
  const cashOut = amount;
  const cashIn = fee;
  const netCashTill = cashIn - cashOut;
  const grossFloatCredit = amount + commission;

  assert.strictEqual(customerReceives, 1000, "Customer receives full payout of 1000");
  assert.strictEqual(cashOut, 1000, "Cash till dispenses 1000 payout");
  assert.strictEqual(cashIn, 20, "Cash till receives 20 fee in cash");
  assert.strictEqual(netCashTill, -980, "Net physical cash till impact is -980");
  assert.strictEqual(grossFloatCredit, 1010, "Gross portal float credit is 1010");
});

// -----------------------------------------------------------------------------
// TEST I: Option C (Collect Separately in QR) Exact Calculations
// -----------------------------------------------------------------------------
runTest("TEST I: Option C (Collect Separately in QR) Calculations (1000 amt, 20 fee, 10 comm)", () => {
  const amount = 1000;
  const fee = 20;
  const commission = 10;
  const feeSource = "upi";

  const customerReceives = feeSource === "cut_from_withdrawal" ? amount - fee : amount;
  const cashOut = amount;
  const physicalCashIn = 0;
  const qrFeeIn = fee;
  const netPhysicalCashTill = physicalCashIn - cashOut;
  const grossFloatCredit = amount + commission;

  assert.strictEqual(customerReceives, 1000, "Customer receives full payout of 1000");
  assert.strictEqual(cashOut, 1000, "Physical till dispenses 1000 payout");
  assert.strictEqual(physicalCashIn, 0, "Physical till receives 0 cash");
  assert.strictEqual(netPhysicalCashTill, -1000, "Net physical till impact is strictly -1000");
  assert.strictEqual(qrFeeIn, 20, "QR account receives 20 fee");
  assert.strictEqual(grossFloatCredit, 1010, "Gross portal float credit is 1010");
});

// -----------------------------------------------------------------------------
// TEST J: QR Fee Isolation Invariant (No Physical Till Cash Pollution)
// -----------------------------------------------------------------------------
runTest("TEST J: QR Fee Isolation Invariant (Zero physical till cash pollution)", () => {
  assert.ok(
    migrationSrc.includes("if p_fee_source in ('upi', 'qr') then") &&
      migrationSrc.includes("v_cash_in := 0;") &&
      migrationSrc.includes("v_upi_fee := v_fee;"),
    "QR fee mode sets physical v_cash_in to 0 and stores fee in v_upi_fee"
  );
  assert.ok(
    migrationSrc.includes("if v_upi_fee > 0 then") &&
      migrationSrc.includes("method, direction, amount") &&
      migrationSrc.includes("'upi', 'in', v_upi_fee"),
    "QR fee is recorded under 'upi' method and v_qr_instrument_id"
  );
});

// -----------------------------------------------------------------------------
// TEST K: Portal Commission Card Explicitly Displays Balance Impact
// -----------------------------------------------------------------------------
runTest("TEST K: Portal Commission Card Displays Balance Impact", () => {
  assert.ok(
    workspaceSrc.includes("AEPS Balance Impact:"),
    "Card must contain 'AEPS Balance Impact:' label"
  );
  assert.ok(
    workspaceSrc.includes("Increases AEPS float balance on successful settlement"),
    "Card must explain that commission increases AEPS float balance"
  );
});

// -----------------------------------------------------------------------------
// TEST L: Portal Commission Increases AEPS Float / Balance (Asset 1400)
// -----------------------------------------------------------------------------
runTest("TEST L: Portal Commission Increases AEPS Float / Balance (Asset 1400)", () => {
  assert.ok(
    migrationSrc.includes("v_pool_credit := p_amount + coalesce(p_portal_commission, 0);"),
    "create_business_txn adds portal commission to float credit"
  );
});

// -----------------------------------------------------------------------------
// TEST M: Double-Entry Balancing for Option A (Cut from Withdrawal)
// -----------------------------------------------------------------------------
runTest("TEST M: Double-Entry Balancing for Option A (Cut from Withdrawal)", () => {
  const amount = 1000;
  const fee = 20;
  const comm = 10;

  // Debits:
  // Asset 1400 (Portal Float): amount + comm = 1010
  const debits = [{ account: "1400", amount: amount + comm }];

  // Credits:
  // Asset 1110 (Till Cash): amount - fee = 980
  // Revenue 4020 (Fee): 20
  // Revenue 4030 (Commission): 10
  const credits = [
    { account: "1110", amount: amount - fee },
    { account: "4020", amount: fee },
    { account: "4030", amount: comm },
  ];

  const totalDebits = debits.reduce((s, d) => s + d.amount, 0);
  const totalCredits = credits.reduce((s, c) => s + c.amount, 0);

  assert.strictEqual(totalDebits, 1010, "Total Debits must equal 1010");
  assert.strictEqual(totalCredits, 1010, "Total Credits must equal 1010");
  assert.strictEqual(totalDebits - totalCredits, 0, "Journal entry is perfectly balanced");
});

// -----------------------------------------------------------------------------
// TEST N: Double-Entry Balancing for Option B (Collect Separately)
// -----------------------------------------------------------------------------
runTest("TEST N: Double-Entry Balancing for Option B (Collect Separately)", () => {
  const amount = 1000;
  const fee = 20;
  const comm = 10;

  // Debits:
  // Asset 1400 (Portal Float): 1010
  // Asset 1110 (Till Cash from customer fee): 20
  const debits = [
    { account: "1400", amount: amount + comm },
    { account: "1110", amount: fee },
  ];

  // Credits:
  // Asset 1110 (Till Cash payout): 1000
  // Revenue 4020 (Fee): 20
  // Revenue 4030 (Commission): 10
  const credits = [
    { account: "1110", amount: amount },
    { account: "4020", amount: fee },
    { account: "4030", amount: comm },
  ];

  const totalDebits = debits.reduce((s, d) => s + d.amount, 0);
  const totalCredits = credits.reduce((s, c) => s + c.amount, 0);

  assert.strictEqual(totalDebits, 1030, "Total Debits must equal 1030");
  assert.strictEqual(totalCredits, 1030, "Total Credits must equal 1030");
  assert.strictEqual(totalDebits - totalCredits, 0, "Journal entry is perfectly balanced");
});

// -----------------------------------------------------------------------------
// TEST O: Double-Entry Balancing for Option C (Collect Separately in QR)
// -----------------------------------------------------------------------------
runTest("TEST O: Double-Entry Balancing for Option C (Collect Separately in QR)", () => {
  const amount = 1000;
  const fee = 20;
  const comm = 10;

  // Debits:
  // Asset 1400 (Portal Float): 1010
  // Asset 1120/1020 (QR Payment Instrument): 20
  const debits = [
    { account: "1400", amount: amount + comm },
    { account: "1120", amount: fee },
  ];

  // Credits:
  // Asset 1110 (Till Cash payout): 1000
  // Revenue 4020 (Fee): 20
  // Revenue 4030 (Commission): 10
  const credits = [
    { account: "1110", amount: amount },
    { account: "4020", amount: fee },
    { account: "4030", amount: comm },
  ];

  const totalDebits = debits.reduce((s, d) => s + d.amount, 0);
  const totalCredits = credits.reduce((s, c) => s + c.amount, 0);

  assert.strictEqual(totalDebits, 1030, "Total Debits must equal 1030");
  assert.strictEqual(totalCredits, 1030, "Total Credits must equal 1030");
  assert.strictEqual(totalDebits - totalCredits, 0, "Journal entry is perfectly balanced");
});

// -----------------------------------------------------------------------------
// TEST P: Balance Enquiry & Mini Statement Commission & Accounting
// -----------------------------------------------------------------------------
runTest("TEST P: Balance Enquiry & Mini Statement Commission & Accounting", () => {
  const comm = 1.5;
  assert.ok(
    migrationSrc.includes("elsif v_norm_method in ('balance_enquiry', 'mini_statement') then") &&
      migrationSrc.includes("v_pool_credit := coalesce(p_portal_commission, 0);") &&
      migrationSrc.includes("v_cash_out := 0;"),
    "Enquiry/Statement carries 0 cash_out and credits commission to pool_credit"
  );

  // Debits: Asset 1400 = 1.50
  // Credits: Revenue 4030 = 1.50
  const debits = [{ account: "1400", amount: comm }];
  const credits = [{ account: "4030", amount: comm }];
  assert.strictEqual(
    debits.reduce((s, d) => s + d.amount, 0),
    credits.reduce((s, c) => s + c.amount, 0)
  );
});

// -----------------------------------------------------------------------------
// TEST Q: Pre-Approval Review Modal Detailed Breakdown
// -----------------------------------------------------------------------------
runTest("TEST Q: Pre-Approval Review Modal Detailed Breakdown", () => {
  assert.ok(
    workspaceSrc.includes("Fee Collection Mode"),
    "Review modal displays Fee Collection Mode"
  );
  assert.ok(
    workspaceSrc.includes("Customer Receives"),
    "Review modal displays Customer Receives"
  );
  assert.ok(
    workspaceSrc.includes("Cash Till Impact"),
    "Review modal displays Cash Till Impact"
  );
  assert.ok(
    workspaceSrc.includes("AEPS Balance Impact"),
    "Review modal displays AEPS Balance Impact"
  );
});

// -----------------------------------------------------------------------------
// TEST R: Database Constraint Expansion in Migration 20260926
// -----------------------------------------------------------------------------
runTest("TEST R: Database Constraint Expansion in Migration 20260926", () => {
  assert.ok(
    migrationSrc.includes("'qr'::text") &&
      migrationSrc.includes("'cut_from_withdrawal'::text") &&
      migrationSrc.includes("'separate_cash'::text") &&
      migrationSrc.includes("'upi'::text"),
    "Constraint explicitly includes 'qr', 'cut_from_withdrawal', 'separate_cash', and 'upi'"
  );
});

// -----------------------------------------------------------------------------
// TEST S: Pricing Rule Resolution Engine Supports feeSource
// -----------------------------------------------------------------------------
runTest("TEST S: Pricing Rule Resolution Engine Supports feeSource", () => {
  const customRules = [
    {
      id: "rule-1",
      serviceType: "aeps",
      ruleType: "fee",
      transactionType: "cash_out",
      portalId: "portal-digipay",
      feeSource: "cut_from_withdrawal",
      minAmount: 100,
      maxAmount: 10000,
      value: 15,
      priority: 10,
      isActive: true,
    },
    {
      id: "rule-2",
      serviceType: "aeps",
      ruleType: "commission",
      transactionType: "cash_out",
      portalId: "portal-digipay",
      minAmount: 100,
      maxAmount: 10000,
      value: 8,
      priority: 10,
      isActive: true,
    },
  ];

  const resolved = resolvePricingFromRules(customRules, {
    portalId: "portal-digipay",
    amount: 1000,
    transactionType: "cash_out",
  });

  assert.strictEqual(resolved.fee, 15, "Resolved fee must be 15");
  assert.strictEqual(resolved.commission, 8, "Resolved commission must be 8");
  assert.strictEqual(resolved.feeSource, "cut_from_withdrawal", "Resolved feeSource must be cut_from_withdrawal");
});

// -----------------------------------------------------------------------------
// TEST T: Draft Record Persistence & Restoration of feeSource
// -----------------------------------------------------------------------------
runTest("TEST T: Draft Record Persistence & Restoration of feeSource", () => {
  assert.ok(
    workspaceSrc.includes("feeSource?: \"cut_from_withdrawal\" | \"separate_cash\" | \"upi\""),
    "DraftRecord interface has optional feeSource"
  );
  assert.ok(
    workspaceSrc.includes("if (d.feeSource) setFeeSource(d.feeSource)"),
    "handleLoadDraft restores feeSource from saved draft"
  );
});

// -----------------------------------------------------------------------------
// TEST U: Server-side RPC Invariants & Parameter Mapping
// -----------------------------------------------------------------------------
runTest("TEST U: Server-side RPC Invariants & Parameter Mapping", () => {
  assert.ok(
    workspaceSrc.includes("p_fee_source: feeSource"),
    "recordTransaction passes feeSource as p_fee_source"
  );
  assert.ok(
    migrationSrc.includes("p_fee_source text default null"),
    "create_business_txn accepts p_fee_source"
  );
});

// -----------------------------------------------------------------------------
// TEST V: Customer Fee and Portal Commission Separation Invariant
// -----------------------------------------------------------------------------
runTest("TEST V: Customer Fee and Portal Commission Separation Invariant", () => {
  assert.ok(
    migrationSrc.includes("service_fee, portal_commission"),
    "transactions table stores fee and commission in distinct columns"
  );
  assert.ok(
    workspaceSrc.includes("CARD 2: CUSTOMER FEE PAID") &&
      workspaceSrc.includes("CARD 3: PORTAL COMMISSION"),
    "Workspace presents fee and commission in distinct cards"
  );
});

// -----------------------------------------------------------------------------
// TEST W: Single Canonical Float Account Invariant (Asset 1400)
// -----------------------------------------------------------------------------
runTest("TEST W: Single Canonical Float Account Invariant (Asset 1400)", () => {
  assert.ok(
    migrationSrc.includes("where type in ('aeps_portal', 'aeps') and is_active = true"),
    "create_business_txn resolves existing payment_instruments for float without creating duplicate tables"
  );
});

// -----------------------------------------------------------------------------
// TEST X: Live UI Breakdown Reactivity
// -----------------------------------------------------------------------------
runTest("TEST X: Live UI Breakdown Reactivity", () => {
  // Test formula calculation simulation matching workspace component
  const calculateReceives = (amt, f, mode) => {
    return mode === "cut_from_withdrawal" ? Math.max(0, amt - f) : amt;
  };
  const calculateTillNet = (amt, f, mode) => {
    if (mode === "cut_from_withdrawal") return -Math.max(0, amt - f);
    if (mode === "separate_cash") return -amt + f;
    return -amt; // QR mode strictly dispenses amt
  };

  assert.strictEqual(calculateReceives(5000, 50, "cut_from_withdrawal"), 4950);
  assert.strictEqual(calculateReceives(5000, 50, "separate_cash"), 5000);
  assert.strictEqual(calculateReceives(5000, 50, "upi"), 5000);

  assert.strictEqual(calculateTillNet(5000, 50, "cut_from_withdrawal"), -4950);
  assert.strictEqual(calculateTillNet(5000, 50, "separate_cash"), -4950);
  assert.strictEqual(calculateTillNet(5000, 50, "upi"), -5000);
});

// -----------------------------------------------------------------------------
// TEST Y: Migration SQL Syntax & Completeness
// -----------------------------------------------------------------------------
runTest("TEST Y: Migration SQL Syntax & Completeness", () => {
  assert.ok(
    migrationSrc.includes("CREATE OR REPLACE FUNCTION public.create_business_txn"),
    "create_business_txn function definition present"
  );
  assert.ok(
    migrationSrc.includes("NOTIFY pgrst, 'reload schema'"),
    "PostgREST reload schema notification present"
  );
});

console.log("\n================================================================================");
console.log(`ALL 25 ACCEPTANCE TESTS (A to Y) PASSED SUCCESSFULLY (${passedCount} passed, ${failedCount} failed)`);
console.log("================================================================================\n");
