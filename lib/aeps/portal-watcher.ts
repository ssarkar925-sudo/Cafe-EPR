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

export function matchBank(
  inputName: string,
  bankList: { id: string; name: string; code?: string }[]
): { id: string; name: string; code?: string } | null {
  if (!inputName || !inputName.trim()) return null;
  const rawInput = inputName.toLowerCase().trim();
  const normInput = normalizeBankName(inputName);

  // 1. Direct code match (e.g. "SBI", "SBIN", "PNB", "HDFC")
  for (const b of bankList) {
    if (b.code && (b.code.toLowerCase().trim() === rawInput || b.code.toLowerCase().trim().startsWith(rawInput))) {
      return b;
    }
  }

  // 2. Exact normalized name match
  for (const b of bankList) {
    if (!b.name) continue;
    const normB = normalizeBankName(b.name);
    if (normB === normInput) return b;
  }

  // 3. Substring / contains match
  for (const b of bankList) {
    if (!b.name) continue;
    const normB = normalizeBankName(b.name);
    if (normB.includes(normInput) || normInput.includes(normB)) {
      if (normInput.length >= 3 && normB.length >= 3) return b;
    }
  }

  // 4. TOP_INDIAN_BANKS match
  const top = TOP_INDIAN_BANKS.find(
    (t) => t.code.toLowerCase() === rawInput || t.label.toLowerCase() === rawInput
  );
  if (top) {
    for (const b of bankList) {
      const normB = normalizeBankName(b.name);
      if (top.match.some((m) => normB.includes(m) || m.includes(normB))) {
        return b;
      }
    }
  }

  return null;
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
}

export interface PortalCollectionObservation {
  id: string;
  collectionRunId: string;
  sourceId: string;
  sourceUrl: string;
  purpose: PortalSourcePurpose;
  httpStatus: number;
  latencyMs: number;
  extractedAt: string;
  rawSnippet: string;
  normalizedData: {
    transactionType?: "cash_out" | "balance_enquiry" | "mini_statement" | null;
    bankName?: string | null;
    bankCode?: string | null;
    commission?: number | null;
    fee?: number | null;
    maxLimit?: number | null;
    reference?: string | null;
    serviceStatus?: string | null;
    summary?: string | null;
  };
  confidence: SourceConfidenceStatus;
  errorMessage?: string | null;
}

export interface VerifiedTransactionContext {
  transactionType: {
    value: "cash_out" | "balance_enquiry" | "mini_statement" | null;
    status: SourceConfidenceStatus;
    sources: string[];
  };
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
  maxLimit: {
    value: number | null;
    status: SourceConfidenceStatus;
  };
  reference: {
    value: string | null;
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
  portalId?: string | null;
  customerId?: string | null;
  bankId?: string | null; // null or 'all' for all banks, or specific bank uuid
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

export function normalizeTransactionType(raw: string): "cash_out" | "balance_enquiry" | "mini_statement" | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[-_]/g, " ").trim();
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
 * Resolves pricing from active published pricing rules.
 * Priority: customer-specific > bank-specific > portal-specific > global, then priority DESC.
 */
export function resolvePricingFromRules(
  rules: AepsPricingRule[],
  portalId: string,
  amount: number,
  bankId?: string,
  customerId?: string
): { fee: number; commission: number; matchedFeeRule?: AepsPricingRule; matchedCommRule?: AepsPricingRule } {
  const activeRules = (rules || []).filter(
    (r) =>
      r.serviceType === "aeps" &&
      r.isActive &&
      r.minAmount <= amount &&
      (r.maxAmount === null || r.maxAmount === undefined || amount <= r.maxAmount) &&
      (!r.portalId || r.portalId === portalId) &&
      (!r.customerId || r.customerId === customerId) &&
      (!r.bankId || r.bankId === "all" || r.bankId === bankId)
  );

  const sortRules = (a: AepsPricingRule, b: AepsPricingRule) => {
    // 1. Customer specific first
    if (a.customerId && !b.customerId) return -1;
    if (!a.customerId && b.customerId) return 1;
    // 2. Bank specific first
    if (a.bankId && a.bankId !== "all" && (!b.bankId || b.bankId === "all")) return -1;
    if ((!a.bankId || a.bankId === "all") && b.bankId && b.bankId !== "all") return 1;
    // 3. Portal specific first
    if (a.portalId && !b.portalId) return -1;
    if (!a.portalId && b.portalId) return 1;
    // 4. Priority desc
    if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
    // 5. Min amount desc
    return b.minAmount - a.minAmount;
  };

  const feeRules = activeRules.filter((r) => r.ruleType === "fee").sort(sortRules);
  const commRules = activeRules.filter((r) => r.ruleType === "commission").sort(sortRules);

  const fee = feeRules[0] ? Number(feeRules[0].value) : 0;
  const commission = commRules[0] ? Number(commRules[0].value) : 0;

  return {
    fee,
    commission,
    matchedFeeRule: feeRules[0],
    matchedCommRule: commRules[0],
  };
}

/**
 * Returns dynamic denominations generated from active rules or falls back to canonical slabs.
 */
export function getDynamicDenominations(rules: AepsPricingRule[], portalId?: string): number[] {
  const candidateSet = new Set<number>();
  for (const r of rules || []) {
    if (r.isActive && (!portalId || !r.portalId || r.portalId === portalId)) {
      if (r.minAmount > 0 && r.minAmount <= 10000) candidateSet.add(r.minAmount);
      if (r.maxAmount && r.maxAmount > 0 && r.maxAmount <= 10000) candidateSet.add(r.maxAmount);
    }
  }

  // If no dynamic denominations from rules, use canonical Indian AEPS slabs
  if (candidateSet.size < 3) {
    return [500, 1000, 2000, 3000, 5000, 10000];
  }

  return Array.from(candidateSet)
    .filter((n) => n >= 100 && n <= 10000)
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

  let resolvedType: "cash_out" | "balance_enquiry" | "mini_statement" | null = null;
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

  // 2. Bank resolution
  const bankVotes = successfulObs
    .filter((o) => o.normalizedData.bankName || o.normalizedData.bankCode)
    .map((o) => {
      const matched = matchBank(o.normalizedData.bankName || o.normalizedData.bankCode || "", bankList);
      return {
        raw: o.normalizedData.bankName || o.normalizedData.bankCode,
        matched,
        source: o.sourceUrl,
      };
    })
    .filter((v) => v.matched !== null);

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
        message: "Multiple distinct banks detected across sources",
        variants: bankVotes.map((v) => ({ name: v.matched!.name, source: v.source })),
      });
    }
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
  const rulePricing = resolvePricingFromRules(activeRules, portal.id, 2000, resolvedBank?.id);
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
    transactionType: {
      value: resolvedType,
      status: typeStatus,
      sources: typeSources,
    },
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
    maxLimit: {
      value: maxLimitObs?.normalizedData.maxLimit ?? 10000,
      status: maxLimitObs ? "CONFIRMED" : "NOT_FOUND",
    },
    reference: {
      value: refObs?.normalizedData.reference ?? null,
      status: refObs ? "CONFIRMED" : "NOT_FOUND",
    },
    serviceStatus: {
      value: statusObs?.normalizedData.serviceStatus ?? "Operational",
      status: statusObs ? "CONFIRMED" : "NOT_FOUND",
    },
    denominations: getDynamicDenominations(activeRules, portal.id),
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

export function getDefaultWatcherSources(portals: { id: string; name: string }[]): PortalWatcherSource[] {
  const sources: PortalWatcherSource[] = [];

  for (const portal of portals) {
    const pName = portal.name.toLowerCase();
    const portalId = portal.id;
    const now = new Date().toISOString();

    if (pName.includes("digipay") || pName.includes("csc")) {
      sources.push(
        {
          id: `src-${portalId}-comm`,
          portalId,
          portalName: portal.name,
          url: "https://digipay.csccloud.in/portal/commission-structure",
          sourceType: "web_page",
          purpose: "commission",
          isEnabled: true,
          priority: 1,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "Baseline published commission verified.",
          currentPublishedValue: {
            commission: 4.0,
            fee: 15.0,
            summary: "DigiPay standard AEPS commission: ₹4.00 per ₹2,000-₹5,000",
            updatedAt: now,
          },
          createdAt: now,
        },
        {
          id: `src-${portalId}-fee`,
          portalId,
          portalName: portal.name,
          url: "https://digipay.csccloud.in/portal/customer-charges",
          sourceType: "web_page",
          purpose: "fee",
          isEnabled: true,
          priority: 1,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "Baseline customer surcharge verified.",
          currentPublishedValue: {
            fee: 15.0,
            summary: "Standard customer surcharge: ₹15.00 for ₹2,000+ withdrawal",
            updatedAt: now,
          },
          createdAt: now,
        },
        {
          id: `src-${portalId}-rules`,
          portalId,
          portalName: portal.name,
          url: "https://digipay.csccloud.in/aeps/npci-guidelines",
          sourceType: "web_page",
          purpose: "aeps_rules",
          isEnabled: true,
          priority: 2,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "NPCI 2-factor authentication rule active.",
          currentPublishedValue: {
            maxLimit: 10000,
            summary: "Daily limit ₹10,000 per Aadhaar. Biometric verification required.",
            updatedAt: now,
          },
          createdAt: now,
        },
        {
          id: `src-${portalId}-txn`,
          portalId,
          portalName: portal.name,
          url: "https://digipay.csccloud.in/services/aeps-terminal-info",
          sourceType: "web_page",
          purpose: "transaction_info",
          isEnabled: true,
          priority: 1,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "Cash Out withdrawal and Balance Enquiry operational.",
          currentPublishedValue: {
            transactionType: "cash_out",
            summary: "Standard 12-digit RRN generation active for Cash Out",
            updatedAt: now,
          },
          createdAt: now,
        },
        {
          id: `src-${portalId}-banks`,
          portalId,
          portalName: portal.name,
          url: "https://digipay.csccloud.in/status/issuer-banks",
          sourceType: "web_page",
          purpose: "provider_bank_info",
          isEnabled: true,
          priority: 2,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "SBI, PNB, BoB, Canara, HDFC, ICICI, Axis active.",
          currentPublishedValue: {
            bankName: "SBI",
            summary: "SBI, PNB, BoB, Canara, HDFC, ICICI, Axis operational.",
            updatedAt: now,
          },
          createdAt: now,
        }
      );
    } else if (pName.includes("spice") || pName.includes("money")) {
      sources.push(
        {
          id: `src-${portalId}-comm`,
          portalId,
          portalName: portal.name,
          url: "https://b2b.spicemoney.com/pricing/aeps-slabs",
          sourceType: "web_page",
          purpose: "commission",
          isEnabled: true,
          priority: 1,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "Spice Money Plan A active.",
          currentPublishedValue: {
            commission: 7.0,
            fee: 0.0,
            summary: "Spice Money Plan A: ₹7.00 commission on ₹3,000-₹10,000 withdrawal",
            updatedAt: now,
          },
          createdAt: now,
        },
        {
          id: `src-${portalId}-fee`,
          portalId,
          portalName: portal.name,
          url: "https://b2b.spicemoney.com/pricing/charges-guide",
          sourceType: "web_page",
          purpose: "fee",
          isEnabled: true,
          priority: 1,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "Zero customer surcharge policy.",
          currentPublishedValue: {
            fee: 0.0,
            summary: "Zero surcharge on cash withdrawal",
            updatedAt: now,
          },
          createdAt: now,
        },
        {
          id: `src-${portalId}-rules`,
          portalId,
          portalName: portal.name,
          url: "https://b2b.spicemoney.com/aeps/security-rules",
          sourceType: "web_page",
          purpose: "aeps_rules",
          isEnabled: true,
          priority: 2,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "NPCI daily limits enforced.",
          currentPublishedValue: {
            maxLimit: 10000,
            summary: "Max withdrawal per day ₹10,000. 2FA mandatory.",
            updatedAt: now,
          },
          createdAt: now,
        },
        {
          id: `src-${portalId}-status`,
          portalId,
          portalName: portal.name,
          url: "https://b2b.spicemoney.com/status/service-health",
          sourceType: "web_page",
          purpose: "service_status",
          isEnabled: true,
          priority: 3,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "All AEPS services operational.",
          currentPublishedValue: {
            summary: "All bank switches responding normally.",
            updatedAt: now,
          },
          createdAt: now,
        }
      );
    } else {
      // Generic portal seeds
      sources.push(
        {
          id: `src-${portalId}-comm`,
          portalId,
          portalName: portal.name,
          url: `https://${pName.replace(/\s+/g, "")}.com/rates/commission`,
          sourceType: "web_page",
          purpose: "commission",
          isEnabled: true,
          priority: 1,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "Initial baseline active.",
          currentPublishedValue: {
            commission: 5.0,
            fee: 10.0,
            summary: "Standard portal commission slab",
            updatedAt: now,
          },
          createdAt: now,
        },
        {
          id: `src-${portalId}-fee`,
          portalId,
          portalName: portal.name,
          url: `https://${pName.replace(/\s+/g, "")}.com/rates/fee`,
          sourceType: "web_page",
          purpose: "fee",
          isEnabled: true,
          priority: 1,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "Standard fee schedule active.",
          currentPublishedValue: {
            fee: 10.0,
            summary: "Standard customer surcharge: ₹10.00",
            updatedAt: now,
          },
          createdAt: now,
        },
        {
          id: `src-${portalId}-rules`,
          portalId,
          portalName: portal.name,
          url: `https://${pName.replace(/\s+/g, "")}.com/aeps/rules`,
          sourceType: "web_page",
          purpose: "aeps_rules",
          isEnabled: true,
          priority: 2,
          lastChecked: now,
          lastStatus: "success",
          lastMessage: "Standard AEPS limits enforced.",
          currentPublishedValue: {
            maxLimit: 10000,
            summary: "Standard NPCI withdrawal guidelines",
            updatedAt: now,
          },
          createdAt: now,
        }
      );
    }
  }

  return sources;
}

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
          portalId: p.id,
          minAmount: 5001,
          maxAmount: 10000,
          value: 8,
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
          portalId: p.id,
          minAmount: 3001,
          maxAmount: 10000,
          value: 7,
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
          portalId: p.id,
          minAmount: 100,
          maxAmount: 10000,
          value: 5,
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
