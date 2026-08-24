/**
 * ==============================================================================
 * AI Customer Intelligence & Credit Risk Engine
 * ==============================================================================
 */

export type CustomerRiskProfile = {
  id: string;
  name: string;
  phone: string | null;
  totalBalanceDue: number;
  riskCategory: "low_risk" | "moderate_risk" | "high_risk" | "vip_good_standing";
  riskScore: number; // 0 (Worst) - 100 (Best)
  recommendedAction: string;
};

export type CustomerIntelligenceReport = {
  totalCustomers: number;
  totalOutstandingReceivables: number;
  highRiskCustomerCount: number;
  vipCustomerCount: number;
  overdueBucket15Days: number;
  overdueBucket30Days: number;
  overdueBucket60Days: number;
  rankedCustomers: CustomerRiskProfile[];
};

export function analyzeCustomerIntelligence(customers: {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
  credit_limit?: number;
  created_at?: string;
}[]): CustomerIntelligenceReport {
  let totalReceivables = 0;
  const ranked: CustomerRiskProfile[] = [];

  let bucket15 = 0;
  let bucket30 = 0;
  let bucket60 = 0;

  for (const c of customers) {
    const due = Number(c.balance || 0);
    if (due > 0) totalReceivables += due;

    let score = 100;
    let riskCategory: CustomerRiskProfile["riskCategory"] = "low_risk";
    let action = "Account in good standing.";

    if (due > 20000) {
      score = 25;
      riskCategory = "high_risk";
      action = "Exceeds ₹20,000 credit limit. Restrict new credit & dispatch WhatsApp reminder.";
      bucket60 += due;
    } else if (due > 5000) {
      score = 55;
      riskCategory = "moderate_risk";
      action = "Outstanding due > ₹5,000. Send polite payment reminder.";
      bucket30 += due;
    } else if (due > 0) {
      score = 80;
      riskCategory = "low_risk";
      action = "Regular balance. Prompt for payment during next visit.";
      bucket15 += due;
    } else {
      score = 98;
      riskCategory = "vip_good_standing";
      action = "VIP Customer with zero debt.";
    }

    ranked.push({
      id: c.id,
      name: c.name,
      phone: c.phone,
      totalBalanceDue: due,
      riskCategory,
      riskScore: score,
      recommendedAction: action,
    });
  }

  ranked.sort((a, b) => b.totalBalanceDue - a.totalBalanceDue);

  const highRiskCount = ranked.filter((r) => r.riskCategory === "high_risk").length;
  const vipCount = ranked.filter((r) => r.riskCategory === "vip_good_standing").length;

  return {
    totalCustomers: customers.length,
    totalOutstandingReceivables: Math.round(totalReceivables * 100) / 100,
    highRiskCustomerCount: highRiskCount,
    vipCustomerCount: vipCount,
    overdueBucket15Days: bucket15,
    overdueBucket30Days: bucket30,
    overdueBucket60Days: bucket60,
    rankedCustomers: ranked,
  };
}
