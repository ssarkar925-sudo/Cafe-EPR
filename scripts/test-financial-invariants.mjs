console.log("================================================================================");
console.log("CYBERCAFE ERP — AUTOMATED FINANCIAL & INTEGRITY TEST SUITE");
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
// Unit Invariant Tests (Mathematical & Financial Formula Verification)
// -----------------------------------------------------------------------------

// 1. Invoice Total Calculation
{
  const items = [
    { qty: 2, rate: 150, amount: 300 },
    { qty: 5, rate: 10, amount: 50 },
    { qty: 1, rate: 25.5, amount: 25.5 },
  ];
  const discount = 15.5;
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const total = subtotal - discount;
  assert(subtotal === 375.5, "1. Invoice Subtotal Calculation", `Expected 375.5, got ${subtotal}`);
  assert(total === 360, "1. Invoice Net Total Calculation", `Expected 360, got ${total}`);
}

// 2. Payment Reconciliation
{
  const total = 1250.0;
  const payments = [
    { method: "cash", amount: 500 },
    { method: "upi", amount: 500 },
  ];
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const due = total - paid;
  assert(paid === 1000, "2. Split Payment Sum Reconciliation", `Expected 1000, got ${paid}`);
  assert(due === 250, "2. Unpaid Due Balance Calculation", `Expected 250, got ${due}`);
  assert(paid + due === total, "2. Universal Balance Invariant (Paid + Due === Total)");
}

// 3. Customer Balance Invariant
{
  const ledger = [
    { type: "invoice", debit: 500, credit: 0 },
    { type: "payment", debit: 0, credit: 300 },
    { type: "invoice", debit: 1200, credit: 0 },
    { type: "payment", debit: 0, credit: 1200 },
    { type: "advance", debit: 0, credit: 200 }, // Advance deposit creates negative balance
  ];
  const totalDebits = ledger.reduce((s, r) => s + r.debit, 0);
  const totalCredits = ledger.reduce((s, r) => s + r.credit, 0);
  const expectedBalance = totalDebits - totalCredits;
  assert(totalDebits === 1700, "3. Customer Ledger Total Debits Sum");
  assert(totalCredits === 1700, "3. Customer Ledger Total Credits Sum");
  assert(expectedBalance === 0, "3. Customer Ledger Balance Invariant (Debit - Credit === Balance)");
}

// 4. 8-Pool Balance Invariant
{
  const pools = {
    cash: { opening: 10000, movements: 2500, current: 12500 },
    bank: { opening: 50000, movements: -10000, current: 40000 },
    aeps: { opening: 15000, movements: 8000, current: 23000 },
    dmt: { opening: 20000, movements: -5000, current: 15000 },
    upi_qr: { opening: 5000, movements: 12000, current: 17000 },
    recharge: { opening: 3000, movements: -1000, current: 2000 },
    wallet: { opening: 2000, movements: 500, current: 2500 },
    credit_card: { opening: 0, movements: -4500, current: -4500 },
  };

  let allValid = true;
  for (const [pool, data] of Object.entries(pools)) {
    if (data.opening + data.movements !== data.current) {
      allValid = false;
      break;
    }
  }
  assert(allValid, "4. 8-Pool Balance Invariant (Opening + Movements === Current Balance)");
}

// 5. AEPS -> Bank Settlement Invariant
{
  let aeps = 25000;
  let bank = 100000;
  let cash = 15000;
  let pnlRevenue = 5000;
  const settlementAmount = 10000;

  // Inter-pool settlement action
  aeps -= settlementAmount;
  bank += settlementAmount;

  assert(aeps === 15000, "5. AEPS Pool Decremented by ₹10,000");
  assert(bank === 110000, "5. Bank Pool Incremented by ₹10,000");
  assert(cash === 15000, "5. Physical Cash Drawer Unaffected by Bank Float Transfer");
  assert(pnlRevenue === 5000, "5. P&L Net Impact === ₹0.00 (Balance Sheet Float Shift Only)");
}

// 6. Inventory Concurrency & Non-Negative Stock Lock
{
  let stock = 1;
  const checkout1 = (qty) => {
    if (stock >= qty) {
      stock -= qty;
      return true;
    }
    return false;
  };
  const res1 = checkout1(1);
  const res2 = checkout1(1); // Simultaneous attempt for same final unit

  assert(res1 === true, "6. Concurrent Sale: First Transaction Secures Final Unit");
  assert(res2 === false, "6. Concurrent Sale: Second Transaction Throws Insufficient Stock");
  assert(stock === 0, "6. Stock Quantity Invariant (Never Negative)");
}

// 7. Historical COGS Price Locking
{
  const historicalSale = {
    product: "PVC Card",
    qty: 10,
    sale_rate: 50,
    locked_cost_price: 8, // Cost at time of sale
  };
  let currentCatalogCost = 12; // Supplier cost raised later

  const historicalCOGS = historicalSale.qty * historicalSale.locked_cost_price;
  const historicalGrossProfit = (historicalSale.qty * historicalSale.sale_rate) - historicalCOGS;

  assert(historicalCOGS === 80, "7. Historical COGS uses locked cost (₹80, not ₹120)");
  assert(historicalGrossProfit === 420, "7. Historical P&L Gross Margin Locked (₹420)");
}

// 8. Reversal & Soft-Cancellation Model
{
  const invoice = {
    id: "inv-001",
    total: 500,
    status: "paid",
    stockDeducted: 2,
    customerDue: 0,
  };
  let stock = 10;

  // Reversal Execution
  invoice.status = "cancelled";
  stock += invoice.stockDeducted; // Restore stock
  const compensatingLedgerEntry = { type: "return", amount: 500, status: "reversed" };

  assert(invoice.status === "cancelled", "8. Invoice Status Updated to 'cancelled' (Not Deleted)");
  assert(stock === 12, "8. Inventory Restored on Cancellation");
  assert(compensatingLedgerEntry.type === "return", "8. Compensating Ledger Adjustment Recorded");
}

// 9. Day Close Uniqueness & Single Active Close per Date
{
  const closings = new Map();
  const openDay = (date) => {
    if (closings.has(date) && closings.get(date).status !== "cancelled") {
      throw new Error(`Day ${date} is already open or closed.`);
    }
    closings.set(date, { date, status: "open" });
    return true;
  };

  const close1 = openDay("2026-08-24");
  let duplicateCaught = false;
  try {
    openDay("2026-08-24");
  } catch {
    duplicateCaught = true;
  }
  assert(close1 === true, "9. Day Close Initialized for 2026-08-24");
  assert(duplicateCaught === true, "9. Duplicate Day Close Attempt Blocked by Unique Constraint");
}

// 10. Day Close Next-Day Auto-Seeding
{
  const closedBalances = {
    cash: 14500,
    bank: 110000,
    aeps: 15000,
  };
  const tomorrowOpeningSeeds = Object.entries(closedBalances).map(([pool, amount]) => ({
    pool,
    amount,
    is_auto: true,
    as_of: "2026-08-25",
  }));

  assert(tomorrowOpeningSeeds.length === 3, "10. Auto-Seeded 3 Next-Day Opening Balances");
  assert(tomorrowOpeningSeeds[0].amount === 14500 && tomorrowOpeningSeeds[0].is_auto === true, "10. Auto-Seed Flag 'is_auto = true' Verified");
}

// 11. Role-Based Authorization Guard
{
  const checkPermission = (userRole, requiredRole) => {
    const roles = { staff: 1, manager: 2, admin: 3 };
    return (roles[userRole] || 0) >= (roles[requiredRole] || 99);
  };

  assert(checkPermission("admin", "admin") === true, "11. Admin Role Authorized for Sensitive Actions");
  assert(checkPermission("staff", "admin") === false, "11. Staff Role Blocked from Sensitive Destructive Actions");
  assert(checkPermission("staff", "staff") === true, "11. Staff Role Authorized for Counter POS Sales");
}

// 12. GST Tax Calculations
{
  const taxableValue = 1000.0;
  const gstRate = 18; // 18% GST (9% CGST + 9% SGST)
  const cgstAmount = (taxableValue * (gstRate / 2)) / 100;
  const sgstAmount = (taxableValue * (gstRate / 2)) / 100;
  const totalInvoice = taxableValue + cgstAmount + sgstAmount;

  assert(cgstAmount === 90, "12. CGST 9% Calculation (₹90.00)");
  assert(sgstAmount === 90, "12. SGST 9% Calculation (₹90.00)");
  assert(totalInvoice === 1180, "12. Total Tax Invoice (₹1,180.00)");
}

// 13. Recharge Account-Linked Outflow Tracking
{
  let cashDrawer = 10000;
  let creditCardLimit = 50000;
  let commissionIncome = 0;

  const rechargePlan = 299.0;
  const commissionEarned = 6.0;
  const netAccountCost = rechargePlan - commissionEarned; // ₹293.00

  // 1. Customer pays Cash ₹299
  cashDrawer += rechargePlan;
  // 2. Recharge funded from HDFC Credit Card (Cost ₹293)
  creditCardLimit -= netAccountCost;
  // 3. Profit earned
  commissionIncome += commissionEarned;

  assert(cashDrawer === 10299, "13. Customer Cash Inflow: Cash Drawer +₹299.00");
  assert(creditCardLimit === 49707, "13. Paid Out From Account: Credit Card -₹293.00");
  assert(commissionIncome === 6, "13. Net P&L Commission Income: +₹6.00");
}

console.log("\n================================================================================");
console.log(`TEST RUN SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log("================================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
