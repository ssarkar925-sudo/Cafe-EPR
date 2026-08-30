export type CommissionType = "flat" | "percentage";

export type BillCommissionConfig = {
  id: string;
  service_type: string;
  category_id?: string | null;
  biller_id?: string | null;
  commission_type: CommissionType;
  commission_value: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CommissionResolution = {
  config: BillCommissionConfig | null;
  source: "biller_override" | "category_default" | "service_default" | "fallback";
  commissionType: CommissionType;
  commissionValue: number;
  commissionAmount: number;
  netProviderCost: number;
  shopNetIncome: number;
  label: string;
};

export const BUILTIN_CATEGORY_COMMISSIONS: Record<string, { type: CommissionType; value: number }> = {
  electricity: { type: "flat", value: 5.0 },
  gas: { type: "flat", value: 4.0 },
  water: { type: "flat", value: 4.0 },
  broadband: { type: "flat", value: 6.0 },
  dth: { type: "flat", value: 5.0 },
  fastag: { type: "flat", value: 3.0 },
  insurance: { type: "flat", value: 10.0 },
  loan: { type: "flat", value: 10.0 },
  landline: { type: "flat", value: 4.0 },
  postpaid: { type: "flat", value: 4.0 },
  google_play: { type: "percentage", value: 2.0 },
  google_play_recharge: { type: "percentage", value: 2.0 },
};

export function resolveBillCommission(
  configs: BillCommissionConfig[] = [],
  params: {
    serviceType?: string;
    categoryId?: string | null;
    billerId?: string | null;
    amount: number;
    customerServiceFee?: number;
  }
): CommissionResolution {
  const serviceType = params.serviceType || (params.categoryId === "google_play" ? "google_play_recharge" : "utility_bill");
  const amount = Number(params.amount) || 0;
  const customerFee = Number(params.customerServiceFee) || 0;

  let matchedConfig: BillCommissionConfig | null = null;
  let source: CommissionResolution["source"] = "fallback";

  // 1. Specific Biller Override
  if (params.billerId) {
    const billerMatch = configs.find(
      (c) =>
        c.is_active &&
        c.service_type === serviceType &&
        c.biller_id &&
        c.biller_id.toLowerCase() === params.billerId!.toLowerCase()
    );
    if (billerMatch) {
      matchedConfig = billerMatch;
      source = "biller_override";
    }
  }

  // 2. Category Default Configuration
  if (!matchedConfig && params.categoryId) {
    const categoryMatch = configs.find(
      (c) =>
        c.is_active &&
        c.service_type === serviceType &&
        c.category_id &&
        c.category_id.toLowerCase() === params.categoryId!.toLowerCase() &&
        !c.biller_id
    );
    if (categoryMatch) {
      matchedConfig = categoryMatch;
      source = "category_default";
    }
  }

  // 3. Service Level Default Configuration
  if (!matchedConfig && serviceType === "google_play_recharge") {
    const gpMatch = configs.find(
      (c) =>
        c.is_active &&
        (c.service_type === "google_play_recharge" || c.category_id === "google_play") &&
        !c.biller_id
    );
    if (gpMatch) {
      matchedConfig = gpMatch;
      source = "service_default";
    }
  }

  let commissionType: CommissionType = "flat";
  let commissionValue = 0;

  if (matchedConfig) {
    commissionType = matchedConfig.commission_type;
    commissionValue = Number(matchedConfig.commission_value) || 0;
  } else {
    // Safe Builtin Fallback
    const fallback =
      (params.categoryId && BUILTIN_CATEGORY_COMMISSIONS[params.categoryId.toLowerCase()]) ||
      BUILTIN_CATEGORY_COMMISSIONS[serviceType.toLowerCase()] ||
      { type: "flat", value: 0 };
    commissionType = fallback.type;
    commissionValue = fallback.value;
    source = "fallback";
  }

  let commissionAmount = 0;
  if (commissionType === "percentage") {
    commissionAmount = Number(((amount * commissionValue) / 100).toFixed(2));
  } else {
    commissionAmount = Number(commissionValue.toFixed(2));
  }

  // Guard against commission exceeding amount
  if (amount > 0 && commissionAmount > amount) {
    commissionAmount = amount;
  }

  const netProviderCost = Number(Math.max(0, amount - commissionAmount).toFixed(2));
  const shopNetIncome = Number((customerFee + commissionAmount).toFixed(2));
  const label =
    commissionType === "percentage"
      ? `${commissionValue.toFixed(2).replace(/\.00$/, "")}%`
      : `₹${commissionValue.toFixed(2)}`;

  return {
    config: matchedConfig,
    source,
    commissionType,
    commissionValue,
    commissionAmount,
    netProviderCost,
    shopNetIncome,
    label,
  };
}
