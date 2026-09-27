export type MobilePortalCode = "csc_digipay" | "ezeepay" | "spice_money" | "fino" | "unknown";

export interface MobileCollectedTransaction {
  portalCode: MobilePortalCode;
  portalName: string;
  packageName: string;
  sourceId?: string | null;
  externalTransactionId: string;
  externalReference?: string | null;
  status: string;
  transactionType: "cash_out" | "payment_collection" | "balance_enquiry" | "mini_statement";
  amount: number;
  fee?: number | null;
  commission?: number | null;
  occurredAt?: string | null;
  customerName?: string | null;
  customerMobile?: string | null;
  aadhaarLast4?: string | null;
  bankName?: string | null;
  rrn?: string | null;
  screenSource: "accessibility" | "ocr" | "api";
  confidence: number;
  rawData?: Record<string, unknown>;
}

export const MOBILE_PORTAL_CATALOG: Record<Exclude<MobilePortalCode, "unknown">, {
  name: string;
  searchTerms: string[];
}> = {
  csc_digipay: {
    name: "CSC DigiPay",
    searchTerms: ["digipay", "csc digipay", "csc"],
  },
  ezeepay: {
    name: "ezeepay",
    searchTerms: ["ezeepay", "ezee pay"],
  },
  spice_money: {
    name: "Spice Money",
    searchTerms: ["spice money", "spicemoney"],
  },
  fino: {
    name: "Fino",
    searchTerms: ["fino", "fino payments", "fino payment bank"],
  },
};

const BLOCKED_KEYS = /(?:otp|one\s*time\s*password|pin|mpin|password|passcode|biometric|fingerprint|face\s*id|aadhaar\s*(?:number|no\.?))/i;

function clean(value: string | null | undefined): string | null {
  const v = String(value || "").replace(/\\s+/g, " ").trim();
  return v ? v : null;
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return null;
}

function numberValue(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[₹,\\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function identifyMobilePortal(packageName: string, appLabel = ""): MobilePortalCode {
  const haystack = (packageName + " " + appLabel).toLowerCase();
  for (const [code, config] of Object.entries(MOBILE_PORTAL_CATALOG) as [Exclude<MobilePortalCode, "unknown">, typeof MOBILE_PORTAL_CATALOG[keyof typeof MOBILE_PORTAL_CATALOG]][]) {
    if (config.searchTerms.some((term) => haystack.includes(term))) return code;
  }
  return "unknown";
}

export function parseMobileTransaction(input: {
  packageName: string;
  appLabel?: string;
  screenText: string;
  sourceId?: string | null;
  capturedAt?: string | null;
  screenSource?: "accessibility" | "ocr" | "api";
}): MobileCollectedTransaction | null {
  const text = String(input.screenText || "").replace(/\\u00a0/g, " ");
  if (!text.trim() || BLOCKED_KEYS.test(text)) {
    // If a sensitive field is visible on the screen, refuse to persist the
    // screen as a transaction candidate. The collector remains read-only.
    return null;
  }

  const portalCode = identifyMobilePortal(input.packageName, input.appLabel);
  if (portalCode === "unknown") return null;

  const catalog = MOBILE_PORTAL_CATALOG[portalCode];
  const externalTransactionId = firstMatch(text, [
    /(?:transaction\\s*(?:id|no|number)|txn\\s*(?:id|no|number)|txn\\s*ref|transaction\\s*ref)\\s*[:#-]?\\s*([A-Za-z0-9-]{5,64})/i,
    /\\b(TXN[A-Z0-9-]{5,})\\b/i,
  ]);
  const rrn = firstMatch(text, [
    /(?:rrn|retrieval\\s*reference(?:\\s*number)?)\\s*[:#-]?\\s*([0-9]{6,20})/i,
  ]);
  const externalReference = firstMatch(text, [
    /(?:reference|ref(?:erence)?\\s*(?:no|number))\\s*[:#-]?\\s*([A-Za-z0-9-]{5,64})/i,
  ]);
  const amountRaw = firstMatch(text, [
    /(?:amount|txn\\s*amount|transaction\\s*amount|withdrawal\\s*amount|cash\\s*withdrawal)\\s*[:=-]?\\s*(?:₹|rs\\.?|inr)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)/i,
  ]);
  const amount = numberValue(amountRaw);
  if (!externalTransactionId || amount === null || amount <= 0) return null;

  const typeText = [
    firstMatch(text, [/(?:transaction\\s*type|type|service)\\s*[:=-]?\\s*([^\\n|]+)/i]) || "",
    text,
  ].join(" ");
  const normalized = typeText.toLowerCase();
  const transactionType: MobileCollectedTransaction["transactionType"] =
    /collection|aadhaar\\s*pay|merchant\\s*pay|collect/.test(normalized)
      ? "payment_collection"
      : /balance|enquiry|inquiry/.test(normalized)
      ? "balance_enquiry"
      : /mini\\s*statement|statement/.test(normalized)
      ? "mini_statement"
      : "cash_out";

  const status =
    firstMatch(text, [/(?:status|transaction\\s*status)\\s*[:=-]?\\s*([^\\n|]+)/i]) ||
    (/\\bsuccess(?:ful)?\\b/i.test(text) ? "SUCCESS" : /\\b(?:failed|failure)\\b/i.test(text) ? "FAILED" : "UNKNOWN");

  const customerName = firstMatch(text, [
    /(?:customer\\s*name|customer)\\s*[:=-]?\\s*([A-Za-z][A-Za-z .'-]{2,80})/i,
  ]);
  const customerMobile = firstMatch(text, [
    /(?:mobile|mobile\\s*(?:no|number)|phone)\\s*[:=-]?\\s*(\\+?91[- ]?)?([6-9]\\d{9})/i,
  ]);
  const aadhaarLast4 = firstMatch(text, [
    /(?:aadhaar|aadhar)\\s*(?:last\\s*4|xxxx|x{4,})?\\s*[:#-]?\\s*(?:x{4,}|\\*{4,})?\\s*(\\d{4})\\b/i,
  ]);
  const bankName = firstMatch(text, [
    /(?:bank\\s*name|issuer\\s*bank|customer\\s*bank|bank)\\s*[:=-]?\\s*([A-Za-z][A-Za-z &.()'-]{2,100})/i,
  ]);
  const fee = numberValue(firstMatch(text, [
    /(?:customer\\s*fee|service\\s*fee|fee|charge)\\s*[:=-]?\\s*(?:₹|rs\\.?|inr)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)/i,
  ]));
  const commission = numberValue(firstMatch(text, [
    /(?:commission|comm)\\s*[:=-]?\\s*(?:₹|rs\\.?|inr)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)/i,
  ]));
  const occurredAt = firstMatch(text, [
    /(?:date\\s*(?:and|&)\\s*time|transaction\\s*(?:date|time)|date|time)\\s*[:=-]?\\s*([^\\n|]{6,80})/i,
  ]);

  const fieldCount = [
    externalTransactionId,
    amount !== null,
    rrn || externalReference,
    customerName,
    customerMobile,
    bankName,
    fee !== null,
    commission !== null,
  ].filter(Boolean).length;
  const confidence = Math.min(0.99, Math.max(0.60, 0.60 + fieldCount * 0.05));

  return {
    portalCode,
    portalName: catalog.name,
    packageName: input.packageName,
    sourceId: input.sourceId || null,
    externalTransactionId,
    externalReference: externalReference || rrn || null,
    status: status.toUpperCase(),
    transactionType,
    amount,
    fee,
    commission,
    occurredAt: occurredAt || input.capturedAt || null,
    customerName,
    customerMobile,
    aadhaarLast4,
    bankName,
    rrn,
    screenSource: input.screenSource || "accessibility",
    confidence,
    rawData: {
      appLabel: input.appLabel || null,
      capturedAt: input.capturedAt || new Date().toISOString(),
    },
  };
}

export function transactionFingerprint(tx: Pick<MobileCollectedTransaction, "portalCode" | "externalTransactionId" | "amount" | "transactionType">): string {
  return [
    tx.portalCode,
    tx.externalTransactionId,
    Number(tx.amount).toFixed(2),
    tx.transactionType,
  ].join("|").toLowerCase();
}
