/**
 * AI Financial Audit Assistant
 * 
 * Provides accountant-grade root-cause explanations and safe action recommendations
 * for detected anomalies or clean reconciliation states.
 * 
 * Invariant Rule: AI NEVER invents financial amounts. All figures come from the canonical check payload.
 */

export interface AuditExplanationRequest {
  checkId: string;
  category: string;
  severity: string;
  status: string;
  amount: number;
  expectedValue: string;
  actualValue: string;
  variance: number;
  recordIds?: string[];
  description: string;
  formula: string;
}

export interface AuditExplanationResponse {
  whatHappened: string;
  whyItMatters: string;
  likelyCause: string;
  recommendedInvestigation: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidenceScore: number;
}

/**
 * Generates an accountant-grade 5-point explanation for an audit check.
 */
export function generateAuditExplanation(input: AuditExplanationRequest): AuditExplanationResponse {
  const { checkId, variance, expectedValue, actualValue, formula, description, severity } = input;

  if (Math.abs(variance) <= 0.01) {
    return {
      whatHappened: `Deterministic mathematical verification succeeded with ₹0.00 variance. Expected: ${expectedValue}, Actual: ${actualValue}. Formula: ${formula}.`,
      whyItMatters: "Proves that underlying transactions, double-entry ledgers, and period rollovers are 100% mathematically conserved.",
      likelyCause: "All point-of-sale invoices, cashbook entries, and pool movements are properly synchronized with database triggers.",
      recommendedInvestigation: "No corrective action required. Continue regular operational logging and daily closing procedures.",
      riskLevel: "LOW",
      confidenceScore: 100,
    };
  }

  // Anomaly Explanations
  if (checkId === "pool_cash") {
    return {
      whatHappened: `A cash discrepancy of ₹${variance.toFixed(2)} was detected between physical drawer calculation and cashbook movements. Expected: ${expectedValue}, Actual: ${actualValue}.`,
      whyItMatters: "Cash deficits directly impact balance sheet liquid assets and cannot be deducted as tax expenses under Section 37.",
      likelyCause: "Unrecorded cash counter payout, manual change discrepancy, or a delayed cashbook entry.",
      recommendedInvestigation: "Perform an immediate physical drawer count and cross-examine cash entries created in the last 24 hours.",
      riskLevel: "HIGH",
      confidenceScore: 95,
    };
  }

  if (checkId === "bank_dual_derivation" || checkId === "pool_bank") {
    return {
      whatHappened: `Bank dual derivation mismatch detected. Historical inception calculation (${expectedValue}) differs from period-anchor rollover (${actualValue}) by ₹${variance.toFixed(2)}.`,
      whyItMatters: "Double-counting historical opening floats will distort available working capital and tax readiness reports.",
      likelyCause: "A pre-existing opening balance seed was applied concurrently with an authoritative day-close rollover.",
      recommendedInvestigation: "Verify that Bank period anchor is locked to the latest day-close rollover without adding pre-rollover seeds.",
      riskLevel: "CRITICAL",
      confidenceScore: 98,
    };
  }

  if (checkId === "inventory_stock") {
    return {
      whatHappened: `${variance} product item(s) have negative stock counts in the catalog register.`,
      whyItMatters: "Negative inventory distorts Cost of Goods Sold (COGS) and inventory asset valuation.",
      likelyCause: "Sales were billed at the POS counter prior to entering supplier purchase restock invoices.",
      recommendedInvestigation: "Enter missing vendor purchase bills or make an inventory adjustment in Catalog & Inventory.",
      riskLevel: "MEDIUM",
      confidenceScore: 92,
    };
  }

  return {
    whatHappened: `Variance of ₹${variance.toFixed(2)} detected in ${description}. Formula: ${formula}.`,
    whyItMatters: "Deviation from standard accounting invariants requires auditor reconciliation.",
    likelyCause: "Potential unlinked transaction or timing mismatch in underlying journals.",
    recommendedInvestigation: "Inspect underlying ledger records and re-run the self-audit scan.",
    riskLevel: (severity as any) || "MEDIUM",
    confidenceScore: 90,
  };
}
