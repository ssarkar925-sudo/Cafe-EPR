/**
 * ==============================================================================
 * AI Cash & Pool Auto-Reconciliation Engine & Service Profitability
 * ==============================================================================
 */

export type PoolReconciliationResult = {
  pool: string;
  label: string;
  opening: number;
  movements: number;
  calculatedLive: number;
  status: "matched" | "discrepancy" | "healthy";
  difference: number;
  anomalyNote?: string;
};

export type ServiceProfitabilityItem = {
  serviceKey: string;
  serviceName: string;
  transactionCount: number;
  totalVolume: number;
  grossCommission: number;
  averageMarginPercent: number;
  profitPerTransaction: number;
  rating: "star" | "steady" | "low_margin";
};

export function reconcilePools(
  poolBalances: Record<string, { opening: number; movements: number; current: number }>
): PoolReconciliationResult[] {
  const POOL_LABELS: Record<string, string> = {
    cash: "Cash in Drawer",
    bank: "Bank Accounts",
    aeps: "AEPS Portal Float",
    dmt: "DMT Transfer Float",
    upi_qr: "Shop UPI QR Wallet",
    recharge: "Recharge Portal Float",
    wallet: "Digital Wallet",
    credit_card: "Credit Card Available Limit",
  };

  const results: PoolReconciliationResult[] = [];

  for (const [poolKey, data] of Object.entries(poolBalances || {})) {
    if (poolKey === "total") continue;
    const label = POOL_LABELS[poolKey] || poolKey;
    const opening = Number(data.opening || 0);
    const movements = Number(data.movements || 0);
    const current = Number(data.current || 0);

    const expected = Math.round((opening + movements) * 100) / 100;
    const diff = Math.round((expected - current) * 100) / 100;

    let status: PoolReconciliationResult["status"] = "matched";
    let anomalyNote: string | undefined = undefined;

    if (Math.abs(diff) > 0.05) {
      status = "discrepancy";
      anomalyNote = `Math drift of ₹${Math.abs(diff).toFixed(2)} detected between seed and movements.`;
    } else if (current < 0 && poolKey !== "credit_card") {
      status = "discrepancy";
      anomalyNote = "Negative balance detected. Verify unrecorded deposits or settlements.";
    } else {
      status = "healthy";
    }

    results.push({
      pool: poolKey,
      label,
      opening,
      movements,
      calculatedLive: current,
      status,
      difference: diff,
      anomalyNote,
    });
  }

  return results;
}

export function analyzeServiceProfitability(transactions: {
  service_type: string;
  total_amount: number;
  net_earnings: number;
  status: string;
}[]): ServiceProfitabilityItem[] {
  const map: Record<string, { count: number; volume: number; commission: number }> = {
    aeps: { count: 0, volume: 0, commission: 0 },
    dmt: { count: 0, volume: 0, commission: 0 },
    upi: { count: 0, volume: 0, commission: 0 },
    recharge: { count: 0, volume: 0, commission: 0 },
    bill_payment: { count: 0, volume: 0, commission: 0 },
  };

  for (const t of transactions) {
    if (t.status !== "success") continue;
    const key = t.service_type || "other";
    if (!map[key]) map[key] = { count: 0, volume: 0, commission: 0 };

    map[key].count += 1;
    map[key].volume += Number(t.total_amount || 0);
    map[key].commission += Number(t.net_earnings || 0);
  }

  const SERVICE_NAMES: Record<string, string> = {
    aeps: "AEPS Cash Withdrawal",
    dmt: "DMT Money Transfer",
    upi: "UPI QR Cash Collections",
    recharge: "Mobile & DTH Recharge",
    bill_payment: "Utility Bill Payments",
  };

  const results: ServiceProfitabilityItem[] = [];

  for (const [key, data] of Object.entries(map)) {
    if (data.count === 0) continue;
    const avgMargin = data.volume > 0 ? (data.commission / data.volume) * 100 : 0;
    const profitPerTxn = data.count > 0 ? data.commission / data.count : 0;

    let rating: ServiceProfitabilityItem["rating"] = "steady";
    if (profitPerTxn >= 15 || avgMargin >= 1.5) {
      rating = "star";
    } else if (profitPerTxn < 3 && avgMargin < 0.3) {
      rating = "low_margin";
    }

    results.push({
      serviceKey: key,
      serviceName: SERVICE_NAMES[key] || key.toUpperCase(),
      transactionCount: data.count,
      totalVolume: data.volume,
      grossCommission: data.commission,
      averageMarginPercent: Math.round(avgMargin * 100) / 100,
      profitPerTransaction: Math.round(profitPerTxn * 100) / 100,
      rating,
    });
  }

  return results.sort((a, b) => b.grossCommission - a.grossCommission);
}
