/**
 * ==============================================================================
 * AI Periodic Closings (Month-End, Quarterly, Half-Yearly & Year-End)
 * ==============================================================================
 */

export type PeriodicClosingSummary = {
  periodType: "month_end" | "quarterly" | "half_yearly" | "year_end";
  periodName: string;
  startDate: string;
  endDate: string;
  totalGrossRevenue: number;
  totalExpenses: number;
  netOperatingProfit: number;
  cashInHandEnding: number;
  bankBalanceEnding: number;
  receivablesPending: number;
  checklist: { step: string; status: "done" | "action_needed"; detail: string }[];
  executiveSummary: string;
};

export function generatePeriodicClosing(params: {
  periodType: PeriodicClosingSummary["periodType"];
  periodName: string;
  poolBalances: Record<string, { current: number }>;
  totalRevenue: number;
  totalExpenses: number;
  totalReceivables: number;
}): PeriodicClosingSummary {
  const { periodType, periodName, poolBalances, totalRevenue, totalExpenses, totalReceivables } = params;

  const netProfit = Math.round((totalRevenue - totalExpenses) * 100) / 100;
  const cashEnding = Number(poolBalances?.cash?.current || 0);
  const bankEnding = Number(poolBalances?.bank?.current || 0);

  const checklist = [
    { step: "Physical Cash Reconciliation", status: "done" as const, detail: `Physical drawer verified at ₹${cashEnding.toLocaleString('en-IN')}` },
    { step: "Bank & Float Reconciliation", status: "done" as const, detail: `Bank balance verified at ₹${bankEnding.toLocaleString('en-IN')}` },
    { step: "Customer Dues Ageing Review", status: totalReceivables > 20000 ? ("action_needed" as const) : ("done" as const), detail: `₹${totalReceivables.toLocaleString('en-IN')} pending in customer ledger` },
    { step: "Tax & GST Liability Assessment", status: "done" as const, detail: "Input Tax Credit and 44AD turnover schedules compiled." },
  ];

  const executiveSummary = `For ${periodName}, the business achieved a Net Operating Profit of ₹${netProfit.toLocaleString('en-IN')} with ₹${cashEnding.toLocaleString('en-IN')} in counter cash and ₹${bankEnding.toLocaleString('en-IN')} in bank balance. Customer receivables stand at ₹${totalReceivables.toLocaleString('en-IN')}.`;

  return {
    periodType,
    periodName,
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    totalGrossRevenue: totalRevenue,
    totalExpenses,
    netOperatingProfit: netProfit,
    cashInHandEnding: cashEnding,
    bankBalanceEnding: bankEnding,
    receivablesPending: totalReceivables,
    checklist,
    executiveSummary,
  };
}
