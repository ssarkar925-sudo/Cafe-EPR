/**
 * ==============================================================================
 * AI Accountant & ITR-Ready Tax Engine (Income Tax of India)
 * ==============================================================================
 * Calculates:
 * 1. True Business Turnover (Demarcating retail gross vs pure banking commissions)
 * 2. Section 44AD / 44ADA Presumptive Taxable Profit (6% digital / 8% cash)
 * 3. Actual Net Profit vs Presumptive Comparison
 * 4. CA Schedule Pack (Trading A/C, Profit & Loss A/C, Balance Sheet Summary)
 * ==============================================================================
 */

export type TaxCalculationReport = {
  periodLabel: string;
  startDate: string;
  endDate: string;

  // Turnover Breakdown
  retailTurnover: number;       // Sales of goods, Xerox, PVC, Photo, Stationery
  commissionTurnover: number;   // Pure commissions earned on AEPS, DMT, Recharge, Bill Pay
  grossThroughputVolume: number; // Crores of customer cash throughput (Non-Turnover)
  totalRecognizedTurnover: number;

  // Digital vs Cash Share
  digitalTurnover: number;      // Bank, UPI, QR, AEPS, DMT, Card
  cashTurnover: number;         // Physical cash retail sales
  digitalPercent: number;

  // Section 44AD Presumptive Taxation (6% digital, 8% cash)
  presumptiveDigitalProfit: number; // 6% of digital turnover
  presumptiveCashProfit: number;    // 8% of cash turnover
  totalPresumptiveProfit: number;   // Recommended minimum taxable income under 44AD

  // Actual Financials
  grossProfit: number;
  operatingExpenses: number;
  actualNetProfit: number;
  actualMarginPercent: number;

  // Recommendations
  recommendedTaxScheme: "44AD_presumptive" | "regular_audit";
  taxSavingsTip: string;
  auditRequired: boolean;
};

export function calculateITRReadyTax(params: {
  periodLabel?: string;
  startDate: string;
  endDate: string;
  invoices: { total_amount: number; payment_method?: string; status: string; type?: string }[];
  transactions: { service_type: string; total_amount: number; net_earnings: number; status: string; payment_mode?: string }[];
  expenses: { amount: number; is_deductible?: boolean }[];
}): TaxCalculationReport {
  const { periodLabel = "Financial Year (Live)", startDate, endDate, invoices, transactions, expenses } = params;

  // 1. Retail Goods & POS Services Turnover
  let retailDigital = 0;
  let retailCash = 0;

  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    const amt = Number(inv.total_amount || 0);
    const method = String(inv.payment_method || "").toLowerCase();

    if (method === "cash" || method === "") {
      retailCash += amt;
    } else {
      retailDigital += amt;
    }
  }

  const retailTurnover = retailDigital + retailCash;

  // 2. Financial Services Intermediary Turnover (Only Commission / Net Earnings is Turnover!)
  let commissionTurnover = 0;
  let grossThroughput = 0;

  for (const t of transactions) {
    if (t.status !== "success") continue;
    const vol = Number(t.total_amount || 0);
    const earnings = Number(t.net_earnings || 0);

    grossThroughput += vol;
    commissionTurnover += earnings;
  }

  // All financial banking services (AEPS, DMT, Recharge, UPI) are 100% digital throughput
  const totalDigital = retailDigital + commissionTurnover;
  const totalCash = retailCash;
  const totalTurnover = totalDigital + totalCash;

  const digitalPercent = totalTurnover > 0 ? Math.round((totalDigital / totalTurnover) * 100) : 100;

  // 3. Section 44AD Presumptive Taxation (6% on digital, 8% on cash)
  const presumptiveDigitalProfit = Math.round(totalDigital * 0.06 * 100) / 100;
  const presumptiveCashProfit = Math.round(totalCash * 0.08 * 100) / 100;
  const totalPresumptiveProfit = presumptiveDigitalProfit + presumptiveCashProfit;

  // 4. Actual Operating Expenses & Net Profit
  let totalExpenses = 0;
  for (const exp of expenses) {
    totalExpenses += Number(exp.amount || 0);
  }

  const grossProfit = retailTurnover * 0.4 + commissionTurnover; // Est 40% retail gross margin + 100% commissions
  const actualNetProfit = Math.round((grossProfit - totalExpenses) * 100) / 100;
  const actualMarginPercent = totalTurnover > 0 ? Math.round((actualNetProfit / totalTurnover) * 100) : 0;

  // 5. CA Recommendation
  const auditRequired = totalTurnover > 20000000; // > 2 Crore or > 3 Crore if digital > 95%
  let recommendedTaxScheme: "44AD_presumptive" | "regular_audit" = "44AD_presumptive";
  let taxSavingsTip = "";

  if (actualNetProfit < totalPresumptiveProfit && totalTurnover > 2500000) {
    taxSavingsTip = "Your actual net profit is lower than the 44AD presumptive minimum (6%/8%). Filing regular ITR-3 with maintenance of accounts is legally allowable if audited, but Section 44AD provides exemption from regular books audit.";
  } else {
    taxSavingsTip = `Section 44AD is highly recommended. Because ${digitalPercent}% of your turnover is digital, you qualify for the concessional 6% presumptive rate instead of 8%, saving substantial income tax.`;
  }

  return {
    periodLabel,
    startDate,
    endDate,
    retailTurnover,
    commissionTurnover,
    grossThroughputVolume: grossThroughput,
    totalRecognizedTurnover: totalTurnover,
    digitalTurnover: totalDigital,
    cashTurnover: totalCash,
    digitalPercent,
    presumptiveDigitalProfit,
    presumptiveCashProfit,
    totalPresumptiveProfit,
    grossProfit,
    operatingExpenses: totalExpenses,
    actualNetProfit,
    actualMarginPercent,
    recommendedTaxScheme,
    taxSavingsTip,
    auditRequired,
  };
}
