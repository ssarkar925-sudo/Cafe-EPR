import {
  extractAmount,
  extractReference,
  extractAccount,
  extractName,
  extractBank,
  extractMobile,
  extractStatus,
  extractCommission,
  extractFee,
  extractAadhaarLast4,
  extractPortal,
  extractTransactionDate,
} from "@/lib/scan/extract";

export type SmsCollectionResult = {
  isSms: boolean;
  bank: string | null;
  amount: number | null;
  direction: "credit" | "debit" | "unknown";
  reference: string | null;
  accountLast4: string | null;
  senderOrBeneficiary: string | null;
  availableBalance: number | null;
  date: string | null;
  rawText: string;
};

export type PortalTransactionItem = {
  externalTransactionId: string;
  transactionType: string;
  amount: number;
  fee?: number | null;
  commission?: number | null;
  status: string;
  customerName?: string | null;
  customerMobile?: string | null;
  occurredAt?: string | null;
  aadhaarLast4?: string | null;
  bank?: string | null;
};

export type PortalCollectionResult = {
  portalName: string;
  transactionCount: number;
  totalAmount: number;
  totalCommission: number;
  transactions: PortalTransactionItem[];
  rawContent: string;
};

export type WebCollectionResult = {
  success: boolean;
  url: string;
  title?: string;
  content?: string;
  error?: string;
};

// ============================================================================
// 1. Phone SMS Parser
// ============================================================================

export function parsePhoneSms(text: string): SmsCollectionResult {
  const cleanText = (text || "").trim();
  const lower = cleanText.toLowerCase();

  // Basic check if text resembles a financial SMS
  const hasFinancialTerms = /\b(?:credited|debited|a\/c|bal(?:ance)?|rs\.?|inr|₹|upi|vpa|txn|rrn|utr|bank)\b/i.test(cleanText);
  if (!hasFinancialTerms) {
    return {
      isSms: false,
      bank: null,
      amount: null,
      direction: "unknown",
      reference: null,
      accountLast4: null,
      senderOrBeneficiary: null,
      availableBalance: null,
      date: null,
      rawText: cleanText,
    };
  }

  // Direction: Credit vs Debit
  let direction: "credit" | "debit" | "unknown" = "unknown";
  if (/\b(?:credited|received|deposited|added to|inward)\b/i.test(lower)) {
    direction = "credit";
  } else if (/\b(?:debited|paid|transferred|withdrawn|spent|outward)\b/i.test(lower)) {
    direction = "debit";
  }

  // Amount
  const rawAmt = extractAmount(cleanText);
  const amount = rawAmt ? parseFloat(rawAmt) : null;

  // Reference (UTR, RRN, Ref No)
  let reference = extractReference(cleanText);
  if (!reference) {
    const upiMatch = cleanText.match(/\b(?:UPI\/|Ref\/|UTR\/|RRN\/)?([0-9]{12})\b/i);
    if (upiMatch) reference = upiMatch[1];
  }

  // Bank name
  const bank = extractBank(cleanText);

  // Account last 4 digits
  let accountLast4 = extractAccount(cleanText);
  if (accountLast4 && accountLast4.length > 4) {
    accountLast4 = accountLast4.slice(-4);
  }

  // Sender or Beneficiary
  let senderOrBeneficiary = extractName(cleanText, direction === "credit" ? "from" : "to");
  if (!senderOrBeneficiary) {
    // Check patterns like "from <Name>", "by <Name>", "to <Name>"
    const partyMatch = cleanText.match(/\b(?:from|by|to|for)\s+([A-Za-z][A-Za-z\s]{2,25}?)(?:\.|\s+on|\s+ref|\s+utr|\s+avail|\s+bal|$)/i);
    if (partyMatch && !["upi", "bank", "card", "cash", "account", "transfer"].includes(partyMatch[1].trim().toLowerCase())) {
      senderOrBeneficiary = partyMatch[1].trim();
    }
  }

  // Available Balance
  let availableBalance: number | null = null;
  const balMatch = cleanText.match(/\b(?:Avail(?:able)?\s*Bal(?:ance)?|Bal(?:ance)?)\s*[#:=]?\s*[₹RsINR\.]*\s*([0-9,]+\.?[0-9]*)/i);
  if (balMatch) {
    const cleanBal = balMatch[1].replace(/,/g, "");
    const num = parseFloat(cleanBal);
    if (Number.isFinite(num)) availableBalance = num;
  }

  // Date
  let date: string | null = null;
  const dateMatch = cleanText.match(/\b([0-9]{1,2}[-\/][0-9]{1,2}[-\/][0-9]{2,4}|[0-9]{1,2}-[A-Za-z]{3}-[0-9]{2,4})\b/);
  if (dateMatch) date = dateMatch[1];

  return {
    isSms: true,
    bank,
    amount,
    direction,
    reference,
    accountLast4,
    senderOrBeneficiary,
    availableBalance,
    date,
    rawText: cleanText,
  };
}

// ============================================================================
// 2. Service Portal Receipt & Table Collector
// ============================================================================

export function parsePortalData(content: string, overridePortal?: string): PortalCollectionResult {
  const text = (content || "").trim();
  const lower = text.toLowerCase();

  // Detect Portal Brand
  let portalName = overridePortal?.trim() || "";
  if (!portalName) {
    if (/\b(?:csc\s*digipay|digipay)\b/i.test(lower)) portalName = "CSC DigiPay";
    else if (/\b(?:ezeepay|ezee\s*pay)\b/i.test(lower)) portalName = "EzeePay";
    else if (/\b(?:spice\s*money|spicemoney)\b/i.test(lower)) portalName = "Spice Money";
    else if (/\bpaymonk\b/i.test(lower)) portalName = "Paymonk";
    else if (/\b(?:airtel\s*payments?|airtel\s*csp)\b/i.test(lower)) portalName = "Airtel Payments Bank";
    else if (/\b(?:paytm\s*payments?|paytm\s*business)\b/i.test(lower)) portalName = "Paytm Business";
    else if (/\b(?:wbcedcl|electricity|discom|power)\b/i.test(lower)) portalName = "Electricity Portal";
    else if (extractPortal(text)) portalName = extractPortal(text)!;
    else portalName = "Online Service Portal";
  }

  const transactions: PortalTransactionItem[] = [];

  // Check if content is multi-line table / list
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Strategy A: Multi-row table parsing (CSV, Tab-separated, or Pipe-separated)
  const delimiter = lines.some((l) => l.includes("\t"))
    ? "\t"
    : lines.some((l) => l.includes("|"))
    ? "|"
    : lines.some((l) => l.includes(",") && (l.match(/,/g) || []).length >= 3)
    ? ","
    : null;

  if (delimiter && lines.length >= 2) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip header lines
      if (i === 0 && /\b(?:amount|date|rrn|txn|status|id|name)\b/i.test(line)) continue;

      const cols = line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));
      if (cols.length < 3) continue;

      const lineText = cols.join(" ");
      const amtStr = extractAmount(lineText);
      const amt = amtStr ? parseFloat(amtStr) : 0;
      if (amt <= 0) continue;

      const ref = extractReference(lineText) || cols[0] || `PORTAL-${Date.now()}-${i}`;
      const status = extractStatus(lineText) || "completed";
      const commStr = extractCommission(lineText);
      const feeStr = extractFee(lineText);
      const aadhaar = extractAadhaarLast4(lineText);
      const bank = extractBank(lineText);
      const mobile = extractMobile(lineText);
      const name = extractName(lineText, "to") || extractName(lineText, "from");
      const dateStr = extractTransactionDate(lineText) || extractTransactionDate(text) || new Date().toISOString().slice(0, 10);

      transactions.push({
        externalTransactionId: ref,
        transactionType: /\b(?:withdrawal|aeps|cash|cw|aadhaar\s*atm)\b/i.test(lineText) ? "AEPS Cash Withdrawal" : "Service Transaction",
        amount: amt,
        commission: commStr ? parseFloat(commStr) : null,
        fee: feeStr ? parseFloat(feeStr) : null,
        status,
        customerName: name,
        customerMobile: mobile,
        aadhaarLast4: aadhaar,
        bank,
        occurredAt: dateStr,
      });
    }
  }

  // Strategy B: Single receipt parsing (CSC DigiPay, Spice Money, EzeePay receipt paste)
  if (transactions.length === 0) {
    const rawAmt = extractAmount(text);
    const amount = rawAmt ? parseFloat(rawAmt) : 0;
    const ref = extractReference(text) || `REC-${Date.now()}`;
    const status = extractStatus(text) || "completed";
    const commStr = extractCommission(text);
    const feeStr = extractFee(text);
    const aadhaar = extractAadhaarLast4(text);
    const bank = extractBank(text);
    const mobile = extractMobile(text);
    const name = extractName(text, "to") || extractName(text, "from");
    const dateStr = extractTransactionDate(text) || new Date().toISOString().slice(0, 10);

    let txnType = "Portal Transaction";
    if (/\b(?:aeps|cash\s*withdrawal|withdrawal|aadhaar\s*atm|cw)\b/i.test(lower)) txnType = "AEPS Cash Withdrawal";
    else if (/\b(?:dmt|money\s*transfer|remittance)\b/i.test(lower)) txnType = "Domestic Money Transfer";
    else if (/\b(?:recharge|top\s*up)\b/i.test(lower)) txnType = "Mobile/DTH Recharge";
    else if (/\b(?:bill|electricity)\b/i.test(lower)) txnType = "Bill Payment";

    if (amount > 0) {
      transactions.push({
        externalTransactionId: ref,
        transactionType: txnType,
        amount,
        commission: commStr ? parseFloat(commStr) : null,
        fee: feeStr ? parseFloat(feeStr) : null,
        status,
        customerName: name,
        customerMobile: mobile,
        aadhaarLast4: aadhaar,
        bank,
        occurredAt: dateStr,
      });
    }
  }

  const totalAmount = transactions.reduce((acc, t) => acc + t.amount, 0);
  const totalCommission = transactions.reduce((acc, t) => acc + (t.commission || 0), 0);

  return {
    portalName,
    transactionCount: transactions.length,
    totalAmount,
    totalCommission,
    transactions,
    rawContent: text,
  };
}

// ============================================================================
// 3. SSRF-Protected Web Scraping & URL Content Collector
// ============================================================================

export function isPrivateIpOrHost(hostname: string): boolean {
  const cleanHost = hostname.trim().toLowerCase();
  if (
    cleanHost === "localhost" ||
    cleanHost === "127.0.0.1" ||
    cleanHost === "0.0.0.0" ||
    cleanHost === "::1" ||
    cleanHost.endsWith(".local") ||
    cleanHost.endsWith(".internal") ||
    cleanHost.endsWith(".corp")
  ) {
    return true;
  }

  // IPv4 private blocks
  const ipv4Match = cleanHost.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link local / metadata)
    if (a === 127) return true; // 127.0.0.0/8
  }

  return false;
}

export async function fetchWebsiteData(rawUrl: string): Promise<WebCollectionResult> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch {
    return { success: false, url: rawUrl, error: "Invalid URL provided." };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return { success: false, url: rawUrl, error: "Only http and https URLs are permitted." };
  }

  if (isPrivateIpOrHost(parsedUrl.hostname)) {
    return { success: false, url: rawUrl, error: "Access to private/local network addresses is restricted for security." };
  }

  try {
    const response = await fetch(parsedUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "CafeERP-AI-Assistant/2.0 (+https://cafeerp.local)",
        Accept: "text/html,application/xhtml+xml,application/xml,text/plain,application/json;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return {
        success: false,
        url: rawUrl,
        error: `Website returned HTTP status ${response.status} (${response.statusText}).`,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    const rawBody = await response.text();

    // If JSON
    if (contentType.includes("application/json") || rawBody.trim().startsWith("{") || rawBody.trim().startsWith("[")) {
      try {
        const json = JSON.parse(rawBody);
        return {
          success: true,
          url: rawUrl,
          title: "JSON Data Source",
          content: JSON.stringify(json, null, 2).slice(0, 8000),
        };
      } catch {
        // continue as text
      }
    }

    // Extract title from HTML
    const titleMatch = rawBody.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : parsedUrl.hostname;

    // Convert HTML to clean readable text
    let cleanText = rawBody
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
      .replace(/<br\s*[\/]?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    // Cap content length to prevent prompt explosion
    cleanText = cleanText.slice(0, 6000);

    return {
      success: true,
      url: rawUrl,
      title,
      content: cleanText,
    };
  } catch (err) {
    return {
      success: false,
      url: rawUrl,
      error: err instanceof Error ? err.message : "Failed to fetch website content.",
    };
  }
}
