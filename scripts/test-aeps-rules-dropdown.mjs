import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  normalizeRuleTransactionType,
  formatRuleTransactionType,
  resolvePricingFromRules,
  getDynamicDenominations,
} from "../lib/aeps/portal-watcher.ts";

console.log("=== AEPS RULES TRANSACTION TYPE DROPDOWN ACCEPTANCE SUITE ===");

let passedTests = 0;
function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// TEST 1: normalizeRuleTransactionType mappings
// -----------------------------------------------------------------------------
runTest("TEST 1: normalizeRuleTransactionType maps to canonical values", () => {
  assert.strictEqual(normalizeRuleTransactionType("cash_out"), "cash_out");
  assert.strictEqual(normalizeRuleTransactionType("Cash Withdrawal"), "cash_out");
  assert.strictEqual(normalizeRuleTransactionType("cash_withdrawal"), "cash_out");
  assert.strictEqual(normalizeRuleTransactionType("Biometric Withdrawal"), "cash_out");
  assert.strictEqual(normalizeRuleTransactionType("Cash Out (Biometric Withdrawal)"), "cash_out");
  assert.strictEqual(normalizeRuleTransactionType("balance_enquiry"), "balance_enquiry");
  assert.strictEqual(normalizeRuleTransactionType("Balance Enquiry"), "balance_enquiry");
  assert.strictEqual(normalizeRuleTransactionType("mini_statement"), "mini_statement");
  assert.strictEqual(normalizeRuleTransactionType("Mini Statement"), "mini_statement");
  assert.strictEqual(normalizeRuleTransactionType("all"), "all");
  assert.strictEqual(normalizeRuleTransactionType("All Types"), "all");
  assert.strictEqual(normalizeRuleTransactionType(null), "all");
  assert.strictEqual(normalizeRuleTransactionType(undefined), "all");
});

// -----------------------------------------------------------------------------
// TEST 2: formatRuleTransactionType labels
// -----------------------------------------------------------------------------
runTest("TEST 2: formatRuleTransactionType strictly returns user-facing labels", () => {
  assert.strictEqual(formatRuleTransactionType("cash_out"), "Cash Withdrawal");
  assert.strictEqual(formatRuleTransactionType("Cash Withdrawal"), "Cash Withdrawal");
  assert.strictEqual(formatRuleTransactionType("cash_withdrawal"), "Cash Withdrawal");
  assert.strictEqual(formatRuleTransactionType("balance_enquiry"), "Balance Enquiry");
  assert.strictEqual(formatRuleTransactionType("Balance Enquiry"), "Balance Enquiry");
  assert.strictEqual(formatRuleTransactionType("mini_statement"), "Mini Statement");
  assert.strictEqual(formatRuleTransactionType("Mini Statement"), "Mini Statement");
  assert.strictEqual(formatRuleTransactionType("all"), "All Types");
  assert.strictEqual(formatRuleTransactionType("All Types"), "All Types");
  assert.strictEqual(formatRuleTransactionType(null), "All Types");
  assert.strictEqual(formatRuleTransactionType(undefined), "All Types");

  // Never returns "Cash Out" or "Payment Collection"
  assert.notStrictEqual(formatRuleTransactionType("cash_out"), "Cash Out");
  assert.notStrictEqual(formatRuleTransactionType("payment_collection"), "Payment Collection");
});

// -----------------------------------------------------------------------------
// TEST 3: Pricing resolution with canonical cash_out & Cash Withdrawal
// -----------------------------------------------------------------------------
runTest("TEST 3: resolvePricingFromRules resolves identical pricing for cash_out & Cash Withdrawal", () => {
  const rules = [
    {
      id: "r1",
      serviceType: "aeps",
      ruleType: "fee",
      transactionType: "cash_out",
      portalId: "portal-1",
      minAmount: 100,
      maxAmount: 5000,
      value: 15,
      priority: 10,
      isActive: true,
    },
    {
      id: "r2",
      serviceType: "aeps",
      ruleType: "commission",
      transactionType: "cash_out",
      portalId: "portal-1",
      minAmount: 100,
      maxAmount: 5000,
      value: 5,
      priority: 10,
      isActive: true,
    },
  ];

  // Resolve using canonical "cash_out"
  const res1 = resolvePricingFromRules(rules, {
    portalId: "portal-1",
    transactionType: "cash_out",
    amount: 2000,
  });
  assert.strictEqual(res1.fee, 15);
  assert.strictEqual(res1.commission, 5);

  // Resolve using "Cash Withdrawal"
  const res2 = resolvePricingFromRules(rules, {
    portalId: "portal-1",
    transactionType: "Cash Withdrawal",
    amount: 2000,
  });
  assert.strictEqual(res2.fee, 15);
  assert.strictEqual(res2.commission, 5);

  // Resolve using "cash_withdrawal"
  const res3 = resolvePricingFromRules(rules, {
    portalId: "portal-1",
    transactionType: "cash_withdrawal",
    amount: 2000,
  });
  assert.strictEqual(res3.fee, 15);
  assert.strictEqual(res3.commission, 5);
});

// -----------------------------------------------------------------------------
// TEST 4: getDynamicDenominations resolves for Cash Withdrawal
// -----------------------------------------------------------------------------
runTest("TEST 4: getDynamicDenominations works for both cash_out and Cash Withdrawal", () => {
  const rules = [
    {
      id: "r1",
      serviceType: "aeps",
      ruleType: "fee",
      transactionType: "cash_out",
      portalId: "p1",
      minAmount: 500,
      maxAmount: 2500,
      value: 10,
      priority: 1,
      isActive: true,
    },
    {
      id: "r2",
      serviceType: "aeps",
      ruleType: "fee",
      transactionType: "cash_out",
      portalId: "p1",
      minAmount: 3500,
      maxAmount: 7500,
      value: 15,
      priority: 1,
      isActive: true,
    },
  ];

  const denoms1 = getDynamicDenominations(rules, "p1", "cash_out");
  const denoms2 = getDynamicDenominations(rules, "p1", "Cash Withdrawal");

  assert.deepStrictEqual(denoms1, denoms2);
  assert(denoms1.includes(500));
  assert(denoms1.includes(2500));
  assert(denoms1.includes(3500));
  assert(denoms1.includes(7500));
});

// -----------------------------------------------------------------------------
// TEST 5: Verify JSX in aeps-workspace.tsx has the exact 4 options
// -----------------------------------------------------------------------------
runTest("TEST 5: UI Workspace has exact 4 options and omits Cash Out / Payment Collection", () => {
  const filePath = path.join(process.cwd(), "components", "business", "aeps-workspace.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  // Verify the select block
  const selectBlockRegex = /<select[^>]*value=\{normalizeRuleTransactionType\(editingRule\.transactionType\)[^>]*>([\s\S]*?)<\/select>/;
  const match = content.match(selectBlockRegex);
  assert(match, "Editing rule transaction type select block must be present");

  const selectBody = match[1];

  // Must have exactly:
  assert(selectBody.includes('<option value="all">All Types</option>'), 'Must contain <option value="all">All Types</option>');
  assert(selectBody.includes('<option value="cash_out">Cash Withdrawal</option>'), 'Must contain <option value="cash_out">Cash Withdrawal</option>');
  assert(selectBody.includes('<option value="balance_enquiry">Balance Enquiry</option>'), 'Must contain <option value="balance_enquiry">Balance Enquiry</option>');
  assert(selectBody.includes('<option value="mini_statement">Mini Statement</option>'), 'Must contain <option value="mini_statement">Mini Statement</option>');

  // Must NOT have:
  assert(!selectBody.includes("Biometric Withdrawal"), "Must NOT contain Biometric Withdrawal in options");
  assert(!selectBody.includes("Payment Collection (Aadhaar Pay)"), "Must NOT contain Payment Collection (Aadhaar Pay) in options");
  assert(!selectBody.includes("Cash Out (Biometric Withdrawal)"), "Must NOT contain Cash Out (Biometric Withdrawal) in options");

  // Verify table method rendering uses formatRuleTransactionType
  assert(
    content.includes("{formatRuleTransactionType(r.transactionType)}"),
    "Rules table must render method via formatRuleTransactionType"
  );

  // Verify filter logic uses rulesTxnFilter and filters out payment_collection
  assert(
    content.includes('r.transactionType === "payment_collection"'),
    "Rules table filter must filter out payment_collection"
  );
  assert(
    content.includes("rulesTxnFilter"),
    "Rules modal must support rulesTxnFilter"
  );
});

// -----------------------------------------------------------------------------
// TEST 6: Rule lifecycle: Add, Edit, Duplicate, Table Display
// -----------------------------------------------------------------------------
runTest("TEST 6: Rule lifecycle preserves canonical cash_out and displays Cash Withdrawal", () => {
  // 1. Add Rule
  let rule = {
    id: "rule-add-1",
    serviceType: "aeps",
    ruleType: "fee",
    transactionType: "all",
    portalId: "portal-digipay",
    minAmount: 100,
    maxAmount: 5000,
    value: 15,
    priority: 10,
    isActive: true,
  };
  assert.strictEqual(formatRuleTransactionType(rule.transactionType), "All Types");

  // User selects "Cash Withdrawal" in dropdown (which gives value "cash_out")
  rule.transactionType = "cash_out";
  assert.strictEqual(normalizeRuleTransactionType(rule.transactionType), "cash_out");
  assert.strictEqual(formatRuleTransactionType(rule.transactionType), "Cash Withdrawal");

  // 2. Duplicate Rule
  const dupRule = {
    ...rule,
    id: "rule-dup-1",
    transactionType: normalizeRuleTransactionType(rule.transactionType) || "all",
    priority: (rule.priority || 0) + 1,
  };
  assert.strictEqual(dupRule.transactionType, "cash_out");
  assert.strictEqual(formatRuleTransactionType(dupRule.transactionType), "Cash Withdrawal");

  // 3. Edit Rule
  const editRule = {
    ...dupRule,
    transactionType: normalizeRuleTransactionType(dupRule.transactionType) || "all",
  };
  assert.strictEqual(editRule.transactionType, "cash_out");
  assert.strictEqual(formatRuleTransactionType(editRule.transactionType), "Cash Withdrawal");
});

console.log(`\n🎉 ALL ${passedTests} ACCEPTANCE TESTS PASSED SUCCESSFULLY!`);
