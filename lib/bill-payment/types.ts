export type BillerParameter = {
  key: string;
  label: string;
  type: "text" | "number" | "tel";
  placeholder: string;
  minLength?: number;
  maxLength?: number;
  regex?: string;
  required: boolean;
  hint?: string;
};

export type BillerConfig = {
  billerId: string;
  billerName: string;
  shortName: string;
  categoryId: string;
  state?: string;
  parameters: BillerParameter[];
  supportsFetch: boolean;
  supportsPayment: boolean;
  amountMode: "exact" | "range" | "ad_hoc";
  minAmount?: number;
  maxAmount?: number;
  defaultCommission: number;
  isPercentage?: boolean;
};

export type NormalizedBillResponse = {
  ok: boolean;
  configured: boolean;
  source: "bbps_live" | "payu_bbps" | "unconfigured" | "provider_error" | "timeout" | "unresolved";
  billerId?: string;
  billerName?: string;
  customerName?: string | null;
  customerIdentifier?: string | null;
  billNumber?: string | null;
  billingPeriod?: string | null;
  billDate?: string | null;
  dueDate?: string | null;
  amount?: number | null;
  minimumAmount?: number | null;
  lateFee?: number | null;
  fetchReference?: string | null;
  fetchedAt?: string | null;
  status?: "verified" | "unverified" | "error";
  error?: string | null;
};
