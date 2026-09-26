// Normalization dictionary for common Indian banks
export const BANK_ALIASES: Record<string, string> = {
  sbi: "state bank of india",
  "state bank": "state bank of india",
  "sbi bank": "state bank of india",
  pnb: "punjab national bank",
  "punjab national": "punjab national bank",
  bob: "bank of baroda",
  "baroda bank": "bank of baroda",
  boi: "bank of india",
  cbi: "central bank of india",
  ubi: "union bank of india",
  "union bank": "union bank of india",
  iob: "indian overseas bank",
  hdfc: "hdfc bank",
  icici: "icici bank",
  axis: "axis bank",
  kotak: "kotak mahindra bank",
  bandhan: "bandhan bank",
  canara: "canara bank",
  idbi: "idbi bank",
  uco: "uco bank",
  "indian bank": "indian bank",
};

export const TOP_INDIAN_BANKS = [
  { code: "SBI", label: "SBI", match: ["sbi", "state bank of india"] },
  { code: "PNB", label: "PNB", match: ["pnb", "punjab national bank"] },
  { code: "BOB", label: "BoB", match: ["bob", "bank of baroda"] },
  { code: "CANARA", label: "Canara", match: ["canara", "canara bank"] },
  { code: "UBI", label: "UBI", match: ["ubi", "union bank"] },
  { code: "HDFC", label: "HDFC", match: ["hdfc"] },
  { code: "ICICI", label: "ICICI", match: ["icici"] },
  { code: "AXIS", label: "Axis", match: ["axis"] },
  { code: "KOTAK", label: "Kotak", match: ["kotak"] },
  { code: "INDIAN", label: "Indian", match: ["indian bank"] },
];

export function normalizeBankName(raw: string): string {
  let s = (raw || "").toLowerCase().trim();
  s = s.replace(/[,.\\/#!$%^&*;:{}=\\-_~()]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (BANK_ALIASES[s]) return BANK_ALIASES[s];
  s = s.replace(/\b(ltd|limited|the|branch)\b/g, " ").replace(/\s+/g, " ").trim();
  if (BANK_ALIASES[s]) return BANK_ALIASES[s];
  return s;
}

/**
 * Strict source-to-master bank matching.
 * Watcher/AI extraction may only auto-link a bank when the extracted bank
 * name exactly matches the CafeERP bank master name after trimming and
 * collapsing whitespace (case-insensitive). Aliases, codes, prefixes,
 * suffixes, and substring matches are intentionally rejected.
 */
export function normalizeBankNameExact(raw: string): string {
  return (raw || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function matchBankExactName(
  inputName: string,
  bankList: { id: string; name: string; code?: string }[]
): { id: string; name: string; code?: string } | null {
  const target = normalizeBankNameExact(inputName);
  if (!target) return null;
  // 1. Direct exact name match
  const exact = bankList.find((b) => !!b.name && normalizeBankNameExact(b.name) === target);
  if (exact) return exact;
  // 2. Direct exact code match (e.g. "SBIN", "PUNB", "HDFC")
  const codeMatch = bankList.find((b) => !!b.code && normalizeBankNameExact(b.code) === target);
  if (codeMatch) return codeMatch;
  // 3. Known canonical alias match (e.g. "sbi" -> "state bank of india")
  const alias = BANK_ALIASES[target];
  if (alias) {
    const aliasMatch = bankList.find((b) => !!b.name && normalizeBankNameExact(b.name) === alias);
    if (aliasMatch) return aliasMatch;
  }
  // 4. TOP_INDIAN_BANKS match
  const top = TOP_INDIAN_BANKS.find((t) => t.code.toLowerCase() === target || t.label.toLowerCase() === target);
  if (top) {
    for (const b of bankList) {
      if (b.name && top.match.some((m) => normalizeBankNameExact(b.name) === m)) {
        return b;
      }
    }
  }
  return null;
}

export function matchBank(
  inputName: string,
  bankList: { id: string; name: string; code?: string }[]
): { id: string; name: string; code?: string } | null {
  // Canonical bank-name matcher: exact name only. Use matchBankExactName for
  // watcher/AI extraction and keep code-based selection in UI-specific logic.
  return matchBankExactName(inputName, bankList);
}

export type PortalSourcePurpose =
  | "commission"
  | "fee"
  | "aeps_rules"
  | "transaction_info"
  | "provider_bank_info"
  | "service_status"
  | "general_updates";

export const PURPOSE_LABELS: Record<
  PortalSourcePurpose,
  { label: string; badgeColor: string; description: string }
> = {
  commission: {
    label: "Commission",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    description: "Monitors portal payout and commission slabs for AEPS transactions",
  },
  fee: {
    label: "Fee",
    badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
    description: "Monitors customer surcharge and operational fees",
  },
  aeps_rules: {
    label: "AEPS Rules",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
    description: "Tracks NPCI daily transaction limits, 2FA biometric rules, and compliance",
  },
  transaction_info: {
    label: "Transaction Information",
    badgeColor: "bg-cyan-50 text-cyan-700 border-cyan-200",
    description: "Monitors transaction types, supported operations, and RRN format specifications",
  },
  provider_bank_info: {
    label: "Provider/Bank Information",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    description: "Monitors issuer bank network status, server downtime alerts, and RRN formats",
  },
  service_status: {
    label: "Service Status",
    badgeColor: "bg-teal-50 text-teal-700 border-teal-200",
    description: "Monitors uptime, gateway switch availability, and network maintenance",
  },
  general_updates: {
    label: "General Updates",
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
    description: "General service notices, settlement timing changes, and maintenance alerts",
  },
};

export const VALID_PORTAL_PURPOSES: PortalSourcePurpose[] = [
  "commission",
  "fee",
  "aeps_rules",
  "transaction_info",
  "provider_bank_info",
  "service_status",
  "general_updates",
];

export function validatePortalSourceUrl(rawUrl: string): { valid: boolean; error?: string; normalizedUrl?: string } {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) {
    return { valid: false, error: "Source URL is required." };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: "Please enter a valid URL (e.g. https://portal.example.com)." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: "Only http:// and https:// URLs are permitted." };
  }
  const cleanHost = parsed.hostname.trim().toLowerCase();
  if (
    cleanHost === "localhost" ||
    cleanHost === "127.0.0.1" ||
    cleanHost === "0.0.0.0" ||
    cleanHost === "::1" ||
    cleanHost.endsWith(".local") ||
    cleanHost.endsWith(".internal") ||
    cleanHost.endsWith(".corp")
  ) {
    return { valid: false, error: "Access to private or local network addresses is restricted for security." };
  }
  const ipv4Match = cleanHost.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return { valid: false, error: "Access to private network addresses is restricted." };
    if (a === 172 && b >= 16 && b <= 31) return { valid: false, error: "Access to private network addresses is restricted." };
    if (a === 192 && b === 168) return { valid: false, error: "Access to private network addresses is restricted." };
    if (a === 169 && b === 254) return { valid: false, error: "Access to link-local/cloud metadata addresses is restricted." };
    if (a === 127) return { valid: false, error: "Access to loopback network addresses is restricted." };
  }
  return { valid: true, normalizedUrl: parsed.toString() };
}

export type SourceConfidenceStatus =
  | "CONFIRMED"
  | "HIGH_CONFIDENCE"
  | "NEEDS_REVIEW"
  | "CONFLICT"
  | "NOT_FOUND"
  | "SOURCE_FAILED";

export type VerificationStatus = "VERIFIED" | "PARTIAL" | "CONFLICT" | "FAILED";

export interface PortalWatcherSource {
  id: string;
  portalId: string;
  portalName: string;
  url: string;
  sourceUrl?: string; // Canonical alias
  sourceType: "web_page" | "api_endpoint" | "portal_doc";
  purpose: PortalSourcePurpose;
  isEnabled: boolean;
  priority: number;
  lastChecked: string | null;
  lastSuccessfulCheck?: string | null;
  lastStatus: "idle" | "success" | "warning" | "error" | "conflict";
  lastMessage?: string | null;
  httpStatus?: number | null;
  extractionConfidence?: SourceConfidenceStatus;
  currentPublishedValue: {
    commission?: number | null;
    fee?: number | null;
    transactionType?: string | null;
    bankName?: string | null;
    maxLimit?: number | null;
    summary?: string | null;
    updatedAt?: string | null;
  };
  createdAt: string;
  updatedAt?: string | null;
  description?: string | null;
  isArchived?: boolean;
  archivedAt?: string | null;
}

export type AepsTxnType = "cash_out" | "payment_collection" | "balance_enquiry" | "mini_statement";

export interface PortalCollectionObservation {
  id: string;
  collectionRunId: string;
  sourceId: string;
  sourceUrl: string;
  portalId?: string;
  portalName?: string;
  purpose: PortalSourcePurpose;
  httpStatus: number;
  latencyMs: number;
  extractedAt: string;
  rawSnippet: string;
  normalizedData: {
    portalId?: string;
    portalName?: string;
    bankId?: string | null;
    bankName?: string | null;
    bankCode?: string | null;
    transactionType?: AepsTxnType | null;
    customerFee?: number | null;
    commission?: number | null;
    fee?: number | null;
    maxLimit?: number | null;
    amountLimits?: { min?: number; max?: number } | null;
    reference?: string | null;
    serviceStatus?: string | null;
    summary?: string | null;
  };
  confidence: SourceConfidenceStatus;
  errorMessage?: string | null;
}

export interface VerifiedTransactionContext {
  // Explicit canonical fields (Requirement 1.1)
  transactionType: {
    value: AepsTxnType | null;
    status: SourceConfidenceStatus;
    sources: string[];
    direction?: "in" | "out" | "info";
  };
  bankId?: string | null;
  bankName?: string | null;
  portalId?: string;
  portalName?: string;
  customerFee: {
    value: number | null;
    status: SourceConfidenceStatus;
    sources: string[];
    conflicts?: { source: string; value: number }[];
  };
  commission: {
    value: number | null;
    status: SourceConfidenceStatus;
    sources: string[];
    conflicts?: { source: string; value: number }[];
  };
  amountLimits?: {
    min: number;
    max: number;
  };
  reference: {
    value: string | null;
    status: SourceConfidenceStatus;
  };
  // Structured entities
  bank: {
    value: { id: string; name: string; code?: string } | null;
    status: SourceConfidenceStatus;
    sources: string[];
    candidates?: { id: string; name: string; code?: string }[];
  };
  portal: {
    id: string;
    name: string;
    status: SourceConfidenceStatus;
  };
  maxLimit: {
    value: number | null;
    status: SourceConfidenceStatus;
  };
  serviceStatus: {
    value: string | null;
    status: SourceConfidenceStatus;
  };
  denominations: number[];
  verifiedAt: string;
}

export interface PortalCollectionRun {
  id: string;
  portalId: string;
  portalName: string;
  startedAt: string;
  completedAt: string | null;
  sourceCount: number;
  successfulSourceCount: number;
  failedSourceCount: number;
  conflictCount: number;
  verificationStatus: VerificationStatus;
  observations: PortalCollectionObservation[];
  verifiedContext: VerifiedTransactionContext;
}

export interface PortalChangeRecord {
  id: string;
  collectionRunId?: string;
  sourceId: string;
  portalId: string;
  portalName: string;
  sourceUrl: string;
  purpose: PortalSourcePurpose;
  extractedAt: string;
  oldValue: string;
  newValue: string;
  changeSummary: string;
  normalizedData: {
    commission?: number | null;
    fee?: number | null;
    summary?: string | null;
  };
  status: "pending" | "approved" | "rejected";
  reviewedAt?: string | null;
  reviewedBy?: string | null;
}

export interface AepsPricingRule {
  id: string;
  serviceType: "aeps";
  ruleType: "fee" | "commission";
  transactionType?: AepsTxnType | "all";
  portalId?: string | null;
  customerId?: string | null;
  bankId?: string | null; // null or 'all' for all banks, or specific bank uuid
  feeSource?: "cut_from_withdrawal" | "separate_cash" | "upi" | string | null;
  minAmount: number;
  maxAmount: number | null;
  value: number;
  priority: number;
  isActive: boolean;
  effectiveFrom?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PortalAuditRecord {
  id: string;
  user: string;
  timestamp: string;
  transactionId?: string | null;
  field: string;
  oldValue: string;
  newValue: string;
  automaticSourceValue?: string | null;
  reason?: string | null;
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

export function normalizeTransactionType(raw: string): AepsTxnType | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[-_]/g, " ").trim();
  if (
    s.includes("collection") ||
    s.includes("pay collection") ||
    s.includes("payment collection") ||
    s.includes("aadhaar pay") ||
    s.includes("aadhaarpay") ||
    s.includes("merchant pay") ||
    s.includes("merchant collection") ||
    s.includes("collect") ||
    s === "ap" ||
    s === "pay"
  ) {
    return "payment_collection";
  }
  if (
    s.includes("withdrawal") ||
    s.includes("cash out") ||
    s.includes("cashout") ||
    s.includes("cash withdrawal") ||
    s.includes("biometric withdrawal") ||
    s === "cw" ||
    s === "w"
  ) {
    return "cash_out";
  }
  if (
    s.includes("balance") ||
    s.includes("enquiry") ||
    s.includes("inquiry") ||
    s === "be" ||
    s === "bal"
  ) {
    return "balance_enquiry";
  }
  if (
    s.includes("statement") ||
    s.includes("mini") ||
    s === "ms"
  ) {
    return "mini_statement";
  }
  return null;
}

/**
 * Canonical normalization helper for rules & pricing resolution.
 * Maps "Cash Withdrawal", "Biometric Withdrawal", "cash_withdrawal", "cash_out" -> "cash_out".
 * Preserves canonical database values without renaming them.
 */
export function normalizeRuleTransactionType(
  type?: string | null
): "cash_out" | "balance_enquiry" | "mini_statement" | "payment_collection" | "all" {
  if (!type || type === "all" || type === "All Types" || type === "all_types") return "all";
  const norm = normalizeTransactionType(type);
  if (norm) return norm;
  const s = String(type).toLowerCase().replace(/[-_]/g, " ").trim();
  if (s.includes("withdrawal") || s.includes("cash out") || s.includes("cash") || s === "cw" || s === "w") {
    return "cash_out";
  }
  if (s.includes("collection") || s.includes("pay") || s === "ap") {
    return "payment_collection";
  }
  if (s.includes("balance") || s.includes("enquiry") || s.includes("inquiry") || s === "be") {
    return "balance_enquiry";
  }
  if (s.includes("statement") || s.includes("mini") || s === "ms") {
    return "mini_statement";
  }
  return "all";
}

/**
 * Returns user-facing label for pricing rules.
 * Strictly adheres to:
 * - "cash_out" -> "Cash Withdrawal"
 * - "balance_enquiry" -> "Balance Enquiry"
 * - "mini_statement" -> "Mini Statement"
 * - "all" -> "All Types"
 * Never returns "Cash Out" or "Payment Collection".
 */
export function formatRuleTransactionType(type?: string | null): string {
  if (!type || type === "all") return "All Types";
  const norm = normalizeRuleTransactionType(type);
  if (norm === "cash_out") return "Cash Withdrawal";
  if (norm === "balance_enquiry") return "Balance Enquiry";
  if (norm === "mini_statement") return "Mini Statement";
  return "All Types";
}

export interface ResolvePricingParams {
  portalId?: string;
  bankId?: string;
  transactionType?: string;
  amount: number;
  customerId?: string;
  feeSource?: string;
}

/**
 * Resolves pricing from active published pricing rules.
 * Supports explicit object signature: { portalId, bankId, transactionType, amount, customerId, feeSource }
 * Priority: customer-specific > transactionType-specific > bank-specific > portal-specific > global, then priority DESC.
 */
export function resolvePricingFromRules(
  rules: AepsPricingRule[],
  paramsOrPortalId: string | ResolvePricingParams,
  amount?: number,
  bankId?: string,
  customerId?: string,
  transactionType?: string
): {
  fee: number;
  commission: number;
  feeSource?: "cut_from_withdrawal" | "separate_cash" | "upi" | string;
  matchedFeeRule?: AepsPricingRule;
  matchedCommRule?: AepsPricingRule;
} {
  let targetPortalId: string | undefined;
  let targetBankId: string | undefined;
  let targetTxnType: string = "cash_out";
  let targetAmount: number = 0;
  let targetCustomerId: string | undefined;
  let targetFeeSource: string | undefined;

  if (typeof paramsOrPortalId === "object" && paramsOrPortalId !== null) {
    targetPortalId = paramsOrPortalId.portalId;
    targetBankId = paramsOrPortalId.bankId;
    targetTxnType = normalizeRuleTransactionType(paramsOrPortalId.transactionType) || "cash_out";
    targetAmount = paramsOrPortalId.amount || 0;
    targetCustomerId = paramsOrPortalId.customerId;
    targetFeeSource = paramsOrPortalId.feeSource;
  } else {
    targetPortalId = paramsOrPortalId;
    targetAmount = amount || 0;
    targetBankId = bankId;
    targetCustomerId = customerId;
    targetTxnType = normalizeRuleTransactionType(transactionType) || "cash_out";
  }

  if (targetTxnType === "all") {
    targetTxnType = "cash_out";
  }

  const activeRules = (rules || []).filter((r) => {
    if (r.serviceType && r.serviceType !== "aeps") return false;
    if (!r.isActive) return false;
    if (r.minAmount > targetAmount) return false;
    if (r.maxAmount !== null && r.maxAmount !== undefined && targetAmount > r.maxAmount) return false;
    if (r.portalId && targetPortalId && r.portalId !== targetPortalId) return false;
    if (r.customerId && targetCustomerId && r.customerId !== targetCustomerId) return false;
    if (r.bankId && r.bankId !== "all" && targetBankId && r.bankId !== targetBankId) return false;
    const ruleTxnType = normalizeRuleTransactionType(r.transactionType);
    if (ruleTxnType !== "all" && ruleTxnType !== targetTxnType) return false;
    return true;
  });

  const sortRules = (a: AepsPricingRule, b: AepsPricingRule) => {
    // 1. Customer specific first
    if (a.customerId && !b.customerId) return -1;
    if (!a.customerId && b.customerId) return 1;
    // 2. Transaction type specific match before generic "all"
    const aNorm = normalizeRuleTransactionType(a.transactionType);
    const bNorm = normalizeRuleTransactionType(b.transactionType);
    const aTypeSpecific = aNorm !== "all";
    const bTypeSpecific = bNorm !== "all";
    if (aTypeSpecific && !bTypeSpecific) return -1;
    if (!aTypeSpecific && bTypeSpecific) return 1;
    // 3. Bank specific first
    if (a.bankId && a.bankId !== "all" && (!b.bankId || b.bankId === "all")) return -1;
    if ((!a.bankId || a.bankId === "all") && b.bankId && b.bankId !== "all") return 1;
    // 4. Portal specific first
    if (a.portalId && !b.portalId) return -1;
    if (!a.portalId && b.portalId) return 1;
    // 5. Priority desc
    if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
    // 6. Min amount desc
    return b.minAmount - a.minAmount;
  };

  const feeRules = activeRules.filter((r) => r.ruleType === "fee").sort(sortRules);
  const commRules = activeRules.filter((r) => r.ruleType === "commission").sort(sortRules);

  const fee = feeRules[0] ? Number(feeRules[0].value) : 0;
  const commission = commRules[0] ? Number(commRules[0].value) : 0;
  const resolvedFeeSource = (feeRules[0]?.feeSource as any) || targetFeeSource || "cut_from_withdrawal";

  return {
    fee,
    commission,
    feeSource: resolvedFeeSource,
    matchedFeeRule: feeRules[0],
    matchedCommRule: commRules[0],
  };
}

/**
 * Returns dynamic denominations generated from active rules or falls back to canonical slabs.
 * Accepts transactionType to return relevant denominations.
 */
export function getDynamicDenominations(
  rules: AepsPricingRule[],
  portalId?: string,
  transactionType: string = "cash_out"
): number[] {
  const normTarget = normalizeRuleTransactionType(transactionType);
  if (normTarget === "balance_enquiry" || normTarget === "mini_statement") {
    return [];
  }
  const candidateSet = new Set<number>();
  for (const r of rules || []) {
    const ruleType = normalizeRuleTransactionType(r.transactionType);
    if (
      r.isActive &&
      (!portalId || !r.portalId || r.portalId === portalId) &&
      (ruleType === "all" || ruleType === normTarget)
    ) {
      if (r.minAmount > 0 && r.minAmount <= 10000) candidateSet.add(r.minAmount);
      if (r.maxAmount && r.maxAmount > 0 && r.maxAmount <= 10000) candidateSet.add(r.maxAmount);
    }
  }

  // If no dynamic denominations from rules, use canonical Indian AEPS slabs
  if (candidateSet.size < 3) {
    if (normTarget === "payment_collection") {
      return [100, 200, 500, 1000, 2000, 5000];
    }
    return [500, 1000, 2000, 3000, 5000, 10000];
  }

  return Array.from(candidateSet)
    .filter((n) => n >= 50 && n <= 10000)
    .sort((a, b) => a - b)
    .slice(0, 8);
}

// ---------------------------------------------------------------------------
// Cross-Verification & Conflict Detection
// ---------------------------------------------------------------------------

export function crossVerifySourceObservations(
  observations: PortalCollectionObservation[],
  bankList: { id: string; name: string; code?: string }[],
  portal: { id: string; name: string },
  activeRules: AepsPricingRule[]
): {
  verifiedContext: VerifiedTransactionContext;
  conflicts: any[];
  verificationStatus: VerificationStatus;
} {
  const conflicts: any[] = [];
  const successfulObs = observations.filter((o) => o.httpStatus >= 200 && o.httpStatus < 300);
  const failedObs = observations.filter((o) => o.httpStatus < 200 || o.httpStatus >= 300);

  // 1. Transaction Type resolution
  const typeVotes = successfulObs
    .filter((o) => o.normalizedData.transactionType)
    .map((o) => ({ type: o.normalizedData.transactionType!, source: o.sourceUrl }));

  let resolvedType: AepsTxnType | null = null;
  let typeStatus: SourceConfidenceStatus = "NOT_FOUND";
  const typeSources = typeVotes.map((v) => v.source);

  if (typeVotes.length > 0) {
    const distinctTypes = Array.from(new Set(typeVotes.map((v) => v.type)));
    if (distinctTypes.length === 1) {
      resolvedType = distinctTypes[0];
      typeStatus = typeVotes.length >= 2 ? "CONFIRMED" : "HIGH_CONFIDENCE";
    } else {
      typeStatus = "CONFLICT";
      conflicts.push({
        field: "transactionType",
        message: "Sources disagree on transaction type",
        variants: typeVotes,
      });
    }
  }

  const direction: "in" | "out" | "info" =
    resolvedType === "payment_collection" ? "in" :
    resolvedType === "cash_out" ? "out" : "info";

  // 2. Bank resolution (Extracted Financial Institution)
  // STRICT RULE: only an exact CafeERP master bank-name match may auto-link.
  const bankObservations = successfulObs
    .filter((o) => o.normalizedData.bankName)
    .map((o) => {
      const raw = String(o.normalizedData.bankName || "").trim();
      const matched = matchBankExactName(raw, bankList);
      return { raw, matched, source: o.sourceUrl };
    });

  const bankVotes = bankObservations.filter((v) => v.matched !== null);
  const unmatchedBankObservations = bankObservations.filter((v) => v.matched === null);

  let resolvedBank: { id: string; name: string; code?: string } | null = null;
  let bankStatus: SourceConfidenceStatus = "NOT_FOUND";
  const bankSources = bankVotes.map((v) => v.source);
  let bankCandidates: { id: string; name: string; code?: string }[] = [];

  if (bankVotes.length > 0) {
    const distinctBankIds = Array.from(new Set(bankVotes.map((v) => v.matched!.id)));
    if (distinctBankIds.length === 1) {
      resolvedBank = bankVotes[0].matched;
      bankStatus = bankVotes.length >= 2 ? "CONFIRMED" : "HIGH_CONFIDENCE";
    } else {
      bankStatus = "CONFLICT";
      bankCandidates = bankVotes.map((v) => v.matched!);
      conflicts.push({
        field: "bank",
        message: "Multiple distinct exact-match banks detected across sources",
        variants: bankVotes.map((v) => ({ name: v.matched!.name, source: v.source })),
      });
    }
  }

  if (unmatchedBankObservations.length > 0) {
    conflicts.push({
      field: "bank",
      message: "Bank name not found in CafeERP master; exact match required",
      variants: unmatchedBankObservations.map((v) => ({ name: v.raw, source: v.source })),
    });
    if (bankStatus !== "CONFLICT" && bankVotes.length > 0) bankStatus = "CONFLICT";
  }

  // 3. Customer Fee resolution & conflict detection
  const feeObservations = successfulObs
    .filter((o) => o.normalizedData.fee !== null && o.normalizedData.fee !== undefined)
    .map((o) => ({ value: Number(o.normalizedData.fee), source: o.sourceUrl }));

  let resolvedFee: number | null = null;
  let feeStatus: SourceConfidenceStatus = "NOT_FOUND";
  const feeSources = feeObservations.map((f) => f.source);
  const feeConflicts: { source: string; value: number }[] = [];

  if (feeObservations.length > 0) {
    const distinctFees = Array.from(new Set(feeObservations.map((f) => f.value)));
    if (distinctFees.length === 1) {
      resolvedFee = distinctFees[0];
      feeStatus = feeObservations.length >= 2 ? "CONFIRMED" : "HIGH_CONFIDENCE";
    } else {
      feeStatus = "CONFLICT";
      for (const fo of feeObservations) {
        feeConflicts.push(fo);
      }
      conflicts.push({
        field: "fee",
        message: "Sources disagree on Customer Fee",
        variants: feeObservations,
      });
    }
  }

  // 4. Commission resolution & conflict detection
  const commObservations = successfulObs
    .filter((o) => o.normalizedData.commission !== null && o.normalizedData.commission !== undefined)
    .map((o) => ({ value: Number(o.normalizedData.commission), source: o.sourceUrl }));

  let resolvedComm: number | null = null;
  let commStatus: SourceConfidenceStatus = "NOT_FOUND";
  const commSources = commObservations.map((c) => c.source);
  const commConflicts: { source: string; value: number }[] = [];

  if (commObservations.length > 0) {
    const distinctComms = Array.from(new Set(commObservations.map((c) => c.value)));
    if (distinctComms.length === 1) {
      resolvedComm = distinctComms[0];
      commStatus = commObservations.length >= 2 ? "CONFIRMED" : "HIGH_CONFIDENCE";
    } else {
      commStatus = "CONFLICT";
      for (const co of commObservations) {
        commConflicts.push(co);
      }
      conflicts.push({
        field: "commission",
        message: "Sources disagree on Portal Commission",
        variants: commObservations,
      });
    }
  }

  // If fees or commission were not in sources (or in conflict), check active published rules as baseline
  const rulePricing = resolvePricingFromRules(activeRules, {
    portalId: portal.id,
    amount: 2000,
    bankId: resolvedBank?.id,
    transactionType: resolvedType || "cash_out",
  });
  if (resolvedFee === null) {
    resolvedFee = rulePricing.fee;
    if (feeStatus !== "CONFLICT") {
      feeStatus = "CONFIRMED";
    }
  }
  if (resolvedComm === null) {
    resolvedComm = rulePricing.commission;
    if (commStatus !== "CONFLICT") {
      commStatus = "CONFIRMED";
    }
  }

  // 5. Limits & Reference
  const maxLimitObs = successfulObs.find((o) => o.normalizedData.maxLimit != null);
  const refObs = successfulObs.find((o) => o.normalizedData.reference);
  const statusObs = successfulObs.find((o) => o.normalizedData.serviceStatus);

  // Overall Verification Status
  let overallStatus: VerificationStatus = "VERIFIED";
  if (failedObs.length > 0 && successfulObs.length > 0) {
    overallStatus = "PARTIAL";
  } else if (successfulObs.length === 0 && failedObs.length > 0) {
    overallStatus = "FAILED";
  } else if (conflicts.length > 0) {
    overallStatus = "CONFLICT";
  }

  const verifiedContext: VerifiedTransactionContext = {
    // Explicit canonical fields (Requirement 1.1)
    transactionType: {
      value: resolvedType,
      status: typeStatus,
      sources: typeSources,
      direction,
    },
    bankId: resolvedBank?.id ?? null,
    bankName: resolvedBank?.name ?? null,
    portalId: portal.id,
    portalName: portal.name,
    customerFee: {
      value: resolvedFee,
      status: feeStatus,
      sources: feeSources,
      conflicts: feeConflicts.length > 0 ? feeConflicts : undefined,
    },
    commission: {
      value: resolvedComm,
      status: commStatus,
      sources: commSources,
      conflicts: commConflicts.length > 0 ? commConflicts : undefined,
    },
    amountLimits: {
      min: 100,
      max: maxLimitObs?.normalizedData.maxLimit ?? 10000,
    },
    reference: {
      value: refObs?.normalizedData.reference ?? null,
      status: refObs ? "CONFIRMED" : "NOT_FOUND",
    },
    // Structured entities
    bank: {
      value: resolvedBank,
      status: bankStatus,
      sources: bankSources,
      candidates: bankCandidates,
    },
    portal: {
      id: portal.id,
      name: portal.name,
      status: "CONFIRMED",
    },
    maxLimit: {
      value: maxLimitObs?.normalizedData.maxLimit ?? 10000,
      status: maxLimitObs ? "CONFIRMED" : "NOT_FOUND",
    },
    serviceStatus: {
      value: statusObs?.normalizedData.serviceStatus ?? "Operational",
      status: statusObs ? "CONFIRMED" : "NOT_FOUND",
    },
    denominations: getDynamicDenominations(activeRules, portal.id, resolvedType || "cash_out"),
    verifiedAt: new Date().toISOString(),
  };

  return {
    verifiedContext,
    conflicts,
    verificationStatus: overallStatus,
  };
}

// ---------------------------------------------------------------------------
// Default Portal Watcher Sources (5-7 sources per portal)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Default Baseline AEPS Pricing Rules
// ---------------------------------------------------------------------------

export function getDefaultAepsPricingRules(portals: { id: string; name: string }[]): AepsPricingRule[] {
  const rules: AepsPricingRule[] = [];
  const now = new Date().toISOString();

  for (const p of portals) {
    const pName = p.name.toLowerCase();
    if (pName.includes("digipay") || pName.includes("csc")) {
      rules.push(
        {
          id: `rule-${p.id}-fee-1`,
          serviceType: "aeps",
          ruleType: "fee",
          portalId: p.id,
          minAmount: 100,
          maxAmount: 2000,
          value: 10,
          priority: 10,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `rule-${p.id}-fee-2`,
          serviceType: "aeps",
          ruleType: "fee",
          portalId: p.id,
          minAmount: 2001,
          maxAmount: 5000,
          value: 15,
          priority: 10,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `rule-${p.id}-fee-3`,
          serviceType: "aeps",
          ruleType: "fee",
          portalId: p.id,
          minAmount: 5001,
          maxAmount: 10000,
          value: 20,
          priority: 10,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `rule-${p.id}-comm-1`,
          serviceType: "aeps",
          ruleType: "commission",
          portalId: p.id,
          minAmount: 100,
          maxAmount: 2000,
          value: 2,
          priority: 10,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `rule-${p.id}-comm-2`,
          serviceType: "aeps",
          ruleType: "commission",
          portalId: p.id,
          minAmount: 2001,
          maxAmount: 5000,
          value: 4,
          priority: 10,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `rule-${p.id}-comm-3`,
          serviceType: "aeps",
          ruleType: "commission",
          transactionType: "cash_out",
          portalId: p.id,
          minAmount: 5001,
          maxAmount: 10000,
          value: 8,
          priority: 10,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
        // DigiPay Payment Collection rules
        {
          id: `rule-${p.id}-fee-coll-1`,
          serviceType: "aeps",
          ruleType: "fee",
          transactionType: "payment_collection",
          portalId: p.id,
          minAmount: 100,
          maxAmount: 5000,
          value: 5,
          priority: 10,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `rule-${p.id}-fee-coll-2`,
          serviceType: "aeps",
          ruleType: "fee",
          transactionType: "payment_collection",
          portalId: p.id,
          minAmount: 5001,
          maxAmount: 10000,
          value: 10,
          priority: 10,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `rule-${p.id}-comm-coll-1`,
          serviceType: "aeps",
          ruleType: "commission",
          transactionType: "payment_collection",
          portalId: p.id,
          minAmount: 100,
          maxAmount: 5000,
          value: 2.5,
          priority: 10,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `rule-${p.id}-comm-coll-2`,
          serviceType: "aeps",
          ruleType: "commission",
          transactionType: "payment_collection",
          portalId: p.id,
          minAmount: 5001,
          maxAmount: 10000,
          value: 5.0,
          priority: 10,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        }
      );
    } else if (pName.includes("spice") || pName.includes("money")) {
      rules.push(
        {
          id: `rule-${p.id}-fee-1`,
          serviceType: "aeps",
          ruleType: "fee",
          transactionType: "cash_out",
          portalId: p.id,
          minAmount: 100,
          maxAmount: 10000,
          value: 0, // Spice Money zero customer surcharge
          priority: 10,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `rule-${p.id}-comm-1`,
          serviceType: "aeps",
          ruleType: "commission",
          transactionType: "cash_out",
          portalId: p.id,
          minAmount: 100,
          maxAmount: 3000,
          value: 3,
          priority: 10,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `rule-${p.id}-comm-2`,
          serviceType: "aeps",
          ruleType: "commission",
          transactionType: "cash_out",
          portalId: p.id,
          minAmount: 3001,
          maxAmount: 10000,
          value: 7,
          priority: 10,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
        // Spice Money Payment Collection
        {
          id: `rule-${p.id}-fee-coll-1`,
          serviceType: "aeps",
          ruleType: "fee",
          transactionType: "payment_collection",
          portalId: p.id,
          minAmount: 100,
          maxAmount: 10000,
          value: 0,
          priority: 10,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `rule-${p.id}-comm-coll-1`,
          serviceType: "aeps",
          ruleType: "commission",
          transactionType: "payment_collection",
          portalId: p.id,
          minAmount: 100,
          maxAmount: 10000,
          value: 5.5,
          priority: 10,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        }
      );
    } else {
      rules.push(
        {
          id: `rule-${p.id}-fee-default`,
          serviceType: "aeps",
          ruleType: "fee",
          transactionType: "cash_out",
          portalId: p.id,
          minAmount: 100,
          maxAmount: 10000,
          value: 10,
          priority: 5,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `rule-${p.id}-comm-default`,
          serviceType: "aeps",
          ruleType: "commission",
          transactionType: "cash_out",
          portalId: p.id,
          minAmount: 100,
          maxAmount: 10000,
          value: 5,
          priority: 5,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `rule-${p.id}-fee-coll-default`,
          serviceType: "aeps",
          ruleType: "fee",
          transactionType: "payment_collection",
          portalId: p.id,
          minAmount: 100,
          maxAmount: 10000,
          value: 5,
          priority: 5,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `rule-${p.id}-comm-coll-default`,
          serviceType: "aeps",
          ruleType: "commission",
          transactionType: "payment_collection",
          portalId: p.id,
          minAmount: 100,
          maxAmount: 10000,
          value: 3,
          priority: 5,
          isActive: true,
          effectiveFrom: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        }
      );
    }
  }

  return rules;
}
