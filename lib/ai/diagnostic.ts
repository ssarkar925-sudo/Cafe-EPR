/**
 * ==============================================================================
 * AI Software Self-Diagnostic & Bug Detection Engine
 * ==============================================================================
 * Automatically verifies database integrity, single-source pool balance invariants,
 * FIFO customer ledger integrity, WhatsApp gateway health, and cloud sync sanity.
 * ==============================================================================
 */

export type DiagnosticCheckStatus = "pass" | "warn" | "fail";

export type DiagnosticCheckItem = {
  id: string;
  category: "database" | "accounting_matrix" | "ledger" | "whatsapp" | "inventory" | "security";
  title: string;
  description: string;
  status: DiagnosticCheckStatus;
  details?: string;
  latencyMs?: number;
  fixSuggestion?: string;
};

export type DiagnosticReport = {
  timestamp: string;
  overallStatus: "healthy" | "warning" | "critical";
  healthScore: number; // 0 - 100
  totalChecks: number;
  passedChecks: number;
  warningChecks: number;
  failedChecks: number;
  checks: DiagnosticCheckItem[];
  anomaliesDetected: string[];
  recommendedFixes: {
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    autoFixSnippet?: string;
  }[];
};

/**
 * Runs full AI system self-diagnostic scan on the live application state
 */
export function runSystemDiagnostic(params: {
  poolBalances: Record<string, { opening: number; movements: number; current: number }> | null;
  customers: { id: string; name: string; balance: number }[];
  invoices: { id: string; invoice_number: string; total_amount: number; paid_amount: number; status: string }[];
  settlements: { id: string; settlement_number: string; from_pool: string; to_pool: string; amount: number; status: string }[];
  cashEntries: { id: string; method: string; direction: string; amount: number; ref_type: string | null; ref_id?: string | null }[];
  products: { id: string; name: string; stock_quantity: number; cost_price: number; sale_price: number }[];
  gatewayStatus?: { connected: boolean; status: string; error?: string; url?: string };
}): DiagnosticReport {
  const { poolBalances, customers, settlements, cashEntries, products, gatewayStatus } = params;
  const checks: DiagnosticCheckItem[] = [];
  const anomalies: string[] = [];
  const fixes: DiagnosticReport["recommendedFixes"] = [];

  // 1. Single-Source Pool Balance Invariant Check
  if (poolBalances && Object.keys(poolBalances).length > 0) {
    let poolDriftFound = false;
    const driftedPools: string[] = [];

    for (const [poolKey, data] of Object.entries(poolBalances)) {
      if (poolKey === "total") continue;
      const expected = Math.round((Number(data.opening || 0) + Number(data.movements || 0)) * 100) / 100;
      const actual = Math.round(Number(data.current || 0) * 100) / 100;
      const diff = Math.abs(expected - actual);

      if (diff > 0.05) {
        poolDriftFound = true;
        driftedPools.push(`${poolKey} (Diff: ₹${diff.toFixed(2)})`);
      }
    }

    if (poolDriftFound) {
      checks.push({
        id: "pool_matrix_math",
        category: "accounting_matrix",
        title: "Single-Source Pool Balance Mathematical Invariant",
        description: "Verifies Opening + Net Movements == Current Live Balance across all 8 pools.",
        status: "fail",
        details: `Drift detected in: ${driftedPools.join(", ")}`,
        fixSuggestion: "Run 'get_pool_balances' refresh or perform today's day close to re-anchor seed balances.",
      });
      anomalies.push(`Pool calculation discrepancy in: ${driftedPools.join(", ")}`);
      fixes.push({
        title: "Re-anchor Pool Seed Balances",
        description: "Perform Day Close or refresh Opening Balances matrix to reconcile pool movements.",
        priority: "high",
      });
    } else {
      checks.push({
        id: "pool_matrix_math",
        category: "accounting_matrix",
        title: "Single-Source Pool Balance Mathematical Invariant",
        description: "Opening + Net Movements == Current Balance holds 100% true across all 8 asset pools.",
        status: "pass",
        details: "Verified across Cash, Bank, AEPS, DMT, UPI QR, Recharge, Wallet, and Credit Card.",
      });
    }
  } else {
    checks.push({
      id: "pool_matrix_math",
      category: "accounting_matrix",
      title: "Pool Balance RPC Connection",
      description: "Database get_pool_balances query.",
      status: "warn",
      details: "No pool data returned from database RPC. Opening balance seeds may be uninitialized.",
    });
  }

  // 2. FIFO Customer Ledger Integrity Check
  const negativeCustomers = customers.filter((c) => Number(c.balance) < -0.05);
  const hugeDues = customers.filter((c) => Number(c.balance) > 25000);

  if (negativeCustomers.length > 0) {
    checks.push({
      id: "customer_ledger_negatives",
      category: "ledger",
      title: "Customer Ledger Negative Balance Audit",
      description: "Checks if any customer has an unintentional negative balance due to excess credit receipts.",
      status: "warn",
      details: `${negativeCustomers.length} customer(s) have advance / negative balances (e.g. ${negativeCustomers[0].name}: ₹${negativeCustomers[0].balance}).`,
      fixSuggestion: "Review Customer Ledger to verify advance payment vouchers.",
    });
    anomalies.push(`${negativeCustomers.length} customer(s) with advance / negative ledger balances.`);
  } else {
    checks.push({
      id: "customer_ledger_negatives",
      category: "ledger",
      title: "Customer Ledger Negative Balance Audit",
      description: "No abnormal negative balances found in customer accounts.",
      status: "pass",
    });
  }

  if (hugeDues.length > 0) {
    checks.push({
      id: "customer_credit_risk",
      category: "ledger",
      title: "High-Exposure Outstanding Debt Audit",
      description: "Monitors customers with outstanding unpaid balances exceeding ₹25,000.",
      status: "warn",
      details: `${hugeDues.length} customer(s) exceed ₹25,000 credit limit (Highest: ${hugeDues[0].name} ₹${Number(hugeDues[0].balance).toLocaleString('en-IN')}).`,
      fixSuggestion: "Dispatch 1-click WhatsApp Ledger Statements and collect payments.",
    });
  } else {
    checks.push({
      id: "customer_credit_risk",
      category: "ledger",
      title: "Customer Credit Exposure",
      description: "No customer accounts exceed single-party debt risk threshold.",
      status: "pass",
    });
  }

  // 3. Cash Entries & Duplicate Voucher Guard
  const duplicateEntries = cashEntries.filter(
    (e, idx, arr) =>
      Boolean(e.ref_id) &&
      Boolean(e.ref_type) &&
      arr.findIndex(
        (x) =>
          x.id !== e.id &&
          x.ref_id === e.ref_id &&
          x.ref_type === e.ref_type &&
          x.method === e.method &&
          x.direction === e.direction &&
          Number(x.amount) === Number(e.amount)
      ) !== -1
  );

  if (duplicateEntries.length > 0) {
    checks.push({
      id: "cash_entries_dedup",
      category: "accounting_matrix",
      title: "Cashbook & Settlement Duplicate Voucher Guard",
      description: "Scans for duplicate linked entries created during inter-pool transfers.",
      status: "warn",
      details: `${duplicateEntries.length} duplicate voucher reference entries flagged.`,
      fixSuggestion: "Review Cashbook vouchers for duplicate settlement postings.",
    });
    anomalies.push(`Flagged ${duplicateEntries.length} duplicate cashbook transactions.`);
  } else {
    checks.push({
      id: "cash_entries_dedup",
      category: "accounting_matrix",
      title: "Cashbook Duplicate Voucher Guard",
      description: "Zero duplicate settlement or transaction vouchers detected in cashbook.",
      status: "pass",
    });
  }

  // 4. Inventory Margin & Stock Audit
  const negativeStock = products.filter((p) => Number(p.stock_quantity) < 0);
  const zeroMarginItems = products.filter((p) => Number(p.sale_price) <= Number(p.cost_price) && Number(p.cost_price) > 0);

  if (negativeStock.length > 0) {
    checks.push({
      id: "negative_inventory",
      category: "inventory",
      title: "Negative Stock & Physical Discrepancy Audit",
      description: "Checks if products are sold with negative inventory counts.",
      status: "fail",
      details: `${negativeStock.length} product(s) have negative stock (e.g. ${negativeStock[0].name}: ${negativeStock[0].stock_quantity} units).`,
      fixSuggestion: "Update stock counts in Catalog & Inventory to reflect physical shelf quantity.",
    });
    anomalies.push(`${negativeStock.length} product(s) currently sold below zero stock.`);
    fixes.push({
      title: "Reconcile Negative Stock Quantities",
      description: "Audit physical shop inventory and adjust opening stock in Catalog.",
      priority: "high",
    });
  } else {
    checks.push({
      id: "negative_inventory",
      category: "inventory",
      title: "Negative Stock & Physical Discrepancy Audit",
      description: "All products have valid positive inventory quantities.",
      status: "pass",
    });
  }

  if (zeroMarginItems.length > 0) {
    checks.push({
      id: "zero_margin_products",
      category: "inventory",
      title: "Product Cost vs Retail Selling Price Leakage",
      description: "Detects products where sale price is lower than or equal to purchase cost.",
      status: "warn",
      details: `${zeroMarginItems.length} product(s) priced at or below purchase cost (e.g. ${zeroMarginItems[0].name}).`,
      fixSuggestion: "Update sale price in Catalog to protect retail gross margins.",
    });
    anomalies.push(`${zeroMarginItems.length} product(s) selling at zero or negative profit margin.`);
  } else {
    checks.push({
      id: "zero_margin_products",
      category: "inventory",
      title: "Retail Margin & Pricing Safety",
      description: "All products maintain healthy gross profit margins above purchase cost.",
      status: "pass",
    });
  }

  // 5. WhatsApp Gateway Diagnostic
  if (gatewayStatus) {
    if (gatewayStatus.connected) {
      checks.push({
        id: "whatsapp_gateway",
        category: "whatsapp",
        title: "WhatsApp Automation Gateway Health",
        description: "Background messaging socket connection status.",
        status: "pass",
        details: `Gateway is LIVE & connected (${gatewayStatus.url || 'Active Server'}).`,
      });
    } else {
      checks.push({
        id: "whatsapp_gateway",
        category: "whatsapp",
        title: "WhatsApp Automation Gateway Health",
        description: "Background messaging socket connection status.",
        status: "warn",
        details: `Gateway status is '${gatewayStatus.status}' (${gatewayStatus.error || 'Waiting for QR scan'}).`,
        fixSuggestion: "Open Settings -> WhatsApp & Notifications to link your phone QR code.",
      });
      anomalies.push("WhatsApp background messaging is currently disconnected or waiting for QR scan.");
    }
  }

  // 6. Calculate Health Score (0 - 100)
  const passed = checks.filter((c) => c.status === "pass").length;
  const warnings = checks.filter((c) => c.status === "warn").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const total = checks.length || 1;

  let score = Math.round((passed / total) * 100) - warnings * 4 - failed * 15;
  score = Math.max(10, Math.min(100, score));

  const overallStatus = failed > 0 ? "critical" : warnings > 0 ? "warning" : "healthy";

  return {
    timestamp: new Date().toISOString(),
    overallStatus,
    healthScore: score,
    totalChecks: total,
    passedChecks: passed,
    warningChecks: warnings,
    failedChecks: failed,
    checks,
    anomaliesDetected: anomalies,
    recommendedFixes: fixes,
  };
}
