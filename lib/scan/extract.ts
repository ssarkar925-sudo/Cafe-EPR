// Scan & Fill extraction engine. Pure functions — run in the browser.
// Turns pasted SMS/portal text into the fields each module form needs,
// ignoring everything else in the message.

export type ScanMode = "aeps" | "dmt" | "upi" | "payment";

export type ScanFields = Record<string, string>;

const BANK_NAMES = [
  "State Bank of India",
  "SBI",
  "HDFC Bank",
  "HDFC",
  "ICICI Bank",
  "ICICI",
  "Axis Bank",
  "Axis",
  "Punjab National Bank",
  "PNB",
  "Bank of Baroda",
  "Union Bank of India",
  "Canara Bank",
  "IDBI Bank",
  "Kotak Mahindra Bank",
  "Kotak",
  "Yes Bank",
  "IndusInd Bank",
  "Bank of India",
  "Central Bank of India",
  "Indian Bank",
  "Indian Overseas Bank",
  "UCO Bank",
  "Bandhan Bank",
  "Federal Bank",
  "South Indian Bank",
  "DBS Bank",
  "RBL Bank",
  "AU Small Finance Bank",
];

function clean(s: string): string {
  return (s || "").replace(/\u00a0/g, " ").trim();
}

function normAmount(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const n = raw
    .replace(/[, ]/g, "")
    .replace(/^[₹]/g, "")
    .replace(/^(Rs\.?|INR)\s*/i, "");
  const m = n.match(/(\d+(?:\.\d{1,2})?)/);
  return m ? m[1] : null;
}

const firstMatch = (text: string, pattern: RegExp): string | null => {
  const m = text.match(pattern);
  return m ? clean(m[1]) : null;
};

export function extractAmount(text: string): string | null {
  const patterns = [
    /(?:Amount|Transferred|Withdrawn|Received|Debited|Paid|Sent)\s*[#:=\-]?\s*[₹R]?s?\.?\s*([0-9][0-9,]*\.?[0-9]*)/i,
    /[₹]\s*([0-9][0-9,]*\.?[0-9]*)/,
    /\bRs\.?\s*([0-9][0-9,]*\.?[0-9]*)\b/i,
    /\bINR\s*([0-9][0-9,]*\.?[0-9]*)\b/i,
  ];
  for (const p of patterns) {
    const v = firstMatch(text, p);
    if (v) {
      const n = normAmount(v);
      if (n && Number(n) > 0) return n;
    }
  }
  return null;
}

export function extractReference(text: string): string | null {
  const labeled =
    firstMatch(text, /\b(?:RRN|UTR|RRN\/UTR|Reference\s*(?:No|Number|Id|ID)?|Txn(?:saction)?\s*(?:Id|ID|No|Number)?|Ref\s*(?:No|Id)?)\s*[#:=\-]?\s*([A-Za-z0-9]{8,28})\b/i) ??
    firstMatch(text, /\b(?:UTR\s*[#:=\-]?\s*([0-9]{12}))\b/i);
  if (labeled) return labeled;
  // bare 12-digit transaction id (skip when an Aadhaar is present to avoid a clash)
  if (!/\baadhaar\b/i.test(text)) {
    const bare = text.match(/(?<![0-9])([0-9]{12})(?![0-9])/);
    if (bare) return bare[1];
  }
  return null;
}

export function extractAadhaarLast4(text: string): string | null {
  const m = text.match(/\b(?:Aadhaar|AADHAAR|Aadhar)[^\d]{0,20}(?:[xX*#]+\s*)?([0-9]{4})(?![0-9])/);
  if (m) return m[1];
  const m2 = text.match(/(?:last|last4|last 4)[^\d]{0,8}(?:digit(?:s)?)?[^\d]{0,6}([0-9]{4})(?![0-9])/i);
  return m2 ? m2[1] : null;
}

export function extractMobile(text: string): string | null {
  return firstMatch(text, /\b(?:Mobile|Mob|Phone|Ph\.?|Contact|Regd\s*Mobile)\s*[#:=\-]?\s*([6-9][0-9]{9})\b/i);
}

export function extractIfsc(text: string): string | null {
  return firstMatch(text, /\b([A-Z]{4}0[A-Z0-9]{6})\b/);
}

export function extractUpiId(text: string): string | null {
  return firstMatch(text, /\b([a-zA-Z0-9._\-]{2,}@[a-zA-Z]{2,})\b/);
}

export function extractAccount(text: string): string | null {
  const labeled = firstMatch(
    text,
    /\b(?:A\/C|A\/c|Account|A\/c No|Account No|Account Number|Beneficiary A\/c)\s*[#:=\-]?\s*(?:No\.?\s*[#:=\-]?\s*)?([0-9Xx*]{6,20})\b/i
  );
  if (labeled) return labeled.replace(/x|X|\*/g, "").replace(/\s/g, "");
  const starred = text.match(/\b(?:[*xX]{2,})([0-9]{2,4})(?![0-9])/);
  return starred ? starred[1] : null;
}

export function extractName(text: string, kind: "to" | "from"): string | null {
  const labels =
    kind === "to"
      ? ["Beneficiary(?: Name)?", "Payee(?: Name)?", "Paid to", "Credit to", "Transferred to", "Account Holder"]
      : ["Sender(?: Name)?", "Payer(?: Name)?", "From Name", "From", "Debited from"];
  for (const l of labels) {
    const m = text.match(new RegExp(`\\b${l}\\s*[#:=\\-]?\\s*([A-Z][A-Za-z]+(?:\\s+[A-Za-z]+){0,4})`));
    if (m && m[1]) return clean(m[1]);
  }
  // "to <NAME>" / "from <NAME>" before a break, parenthetical, "on <date>" or end
  const generic =
    kind === "to"
      ? text.match(/(?:paid\s+to|to)\s+([A-Z][A-Za-z]+(?:\s+[A-Za-z]+){0,4})(?=\s*[,;\n(]|\s+on\b|$)/)
      : text.match(/(?:from)\s+([A-Z][A-Za-z]+(?:\s+[A-Za-z]+){0,4})(?=\s*[,;\n(]|\s+on\b|$)/);
  return generic ? clean(generic[1]) : null;
}

export function extractBank(text: string): string | null {
  const labeled = firstMatch(
    text,
    /\b(?:Bank|Bank Name|Beneficiary Bank|Customer Bank|Issuer|Issuing Bank)\s*[#:=\-]?\s*([A-Z][A-Za-z]+(?:\s+[A-Za-z]+){0,3})/i
  );
  if (labeled) return labeled;
  for (const name of BANK_NAMES) {
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) return name;
  }
  return null;
}

export function extractFee(text: string): string | null {
  const m = text.match(/\b(?:Fee|Service Fee|Charges|Charge)\s*[#:=\-]?\s*[₹R]?s?\.?\s*([0-9][0-9,]*\.?[0-9]*)/i);
  return m ? normAmount(m[1]) : null;
}

export function extractCommission(text: string): string | null {
  const m = text.match(/\b(?:Commission|Portal Commission|Income|Earned)\s*[#:=\-]?\s*[₹R]?s?\.?\s*([0-9][0-9,]*\.?[0-9]*)/i);
  return m ? normAmount(m[1]) : null;
}

export function extractStatus(text: string): string | null {
  if (/\b(?:failed|rejected|declined|unsuccessful|refunded)\b/i.test(text)) return "failed";
  if (/\b(?:pending|processing|in process|under process|initiated)\b/i.test(text)) return "pending";
  if (/\b(?:success|successful|completed|credited|debited|paid|approved)\b/i.test(text)) return "success";
  return null;
}

export function extractPortal(text: string): string | null {
  const m = text.match(/\b(?:Portal|Through|Via)\s*[#:=\-]?\s*([A-Za-z][A-Za-z .]{2,25})/i);
  return m ? clean(m[1]) : null;
}

export function extractTransactionDate(text: string): string | null {
  const m = text.match(/\b(?:on|On|Date|Dated)\s+(\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4})\b/);
  if (!m) return null;
  const [d, mon, y] = m[1].split(/[-/]/);
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const mm = months[mon.toLowerCase().slice(0, 3)];
  if (!mm) return null;
  const yy = y.length === 2 ? "20" + y : y;
  return `${yy}-${mm}-${String(d).padStart(2, "0")}`;
}

export function detectPaymentMethod(text: string): string | null {
  if (/\b(?:upi|utr\b|vpa\b|@[a-z]{2,}\b)/i.test(text)) return "upi";
  if (/\b(?:credit card|debit card|\bcards?\b|pos\b|emi\b)/i.test(text)) return "card";
  if (/\b(?:wallet|paytm wallet|phonepe wallet)\b/i.test(text)) return "wallet";
  if (/\b(?:neft|imps|rtgs|transfer|a\/c|account)\b/i.test(text)) return "bank";
  if (/\bcash\b/i.test(text)) return "cash";
  return null;
}

// ---- module level extractors -------------------------------------------------

export function extractAeps(text: string): ScanFields {
  const out: ScanFields = {};
  const amount = extractAmount(text);
  if (amount) out.amount = amount;
  const reference = extractReference(text);
  if (reference) out.reference = reference;
  const aadhaar = extractAadhaarLast4(text);
  if (aadhaar) out.aadhaar_last4 = aadhaar;
  const mobile = extractMobile(text);
  if (mobile) out.customer_mobile = mobile;
  const bank = extractBank(text);
  if (bank) out.bank_name = bank;
  const portal = extractPortal(text);
  if (portal) out.portal_name = portal;
  const fee = extractFee(text);
  if (fee) out.service_fee = fee;
  const commission = extractCommission(text);
  if (commission) out.portal_commission = commission;
  const status = extractStatus(text);
  if (status) out.status = status;
  const date = extractTransactionDate(text);
  if (date) out.transaction_date = date;
  return out;
}

export function extractDmt(text: string): ScanFields {
  const out: ScanFields = {};
  const amount = extractAmount(text);
  if (amount) out.amount = amount;
  const reference = extractReference(text);
  if (reference) out.reference = reference;
  const to = extractName(text, "to");
  if (to) out.beneficiary_name = to;
  const from = extractName(text, "from");
  if (from) out.sender_name = from;
  const mobile = extractMobile(text);
  if (mobile) out.sender_mobile = mobile;
  const ifsc = extractIfsc(text);
  if (ifsc) out.beneficiary_ifsc = ifsc;
  const upi = extractUpiId(text);
  if (upi) out.upi_id = upi;
  const acct = extractAccount(text);
  if (acct) out.beneficiary_account = acct;
  const bank = extractBank(text);
  if (bank) out.beneficiary_bank = bank;
  const fee = extractFee(text);
  if (fee) out.service_fee = fee;
  const commission = extractCommission(text);
  if (commission) out.portal_commission = commission;
  const status = extractStatus(text);
  if (status) out.status = status;
  const date = extractTransactionDate(text);
  if (date) out.transaction_date = date;
  return out;
}

export function extractUpi(text: string): ScanFields {
  const out: ScanFields = {};
  const amount = extractAmount(text);
  if (amount) out.amount = amount;
  const reference = extractReference(text);
  if (reference) out.reference = reference;
  const to = extractName(text, "to") ?? extractName(text, "from");
  if (to) out.beneficiary_name = to;
  const mobile = extractMobile(text);
  if (mobile) out.customer_mobile = mobile;
  const fee = extractFee(text);
  if (fee) out.service_fee = fee;
  const status = extractStatus(text);
  if (status) out.status = status;
  const date = extractTransactionDate(text);
  if (date) out.transaction_date = date;
  return out;
}

export function extractPayment(text: string): ScanFields {
  const out: ScanFields = {};
  const amount = extractAmount(text);
  if (amount) out.amount = amount;
  const method = detectPaymentMethod(text);
  if (method) out.method = method;
  const reference = extractReference(text);
  if (reference) out.reference = reference;
  return out;
}

export function extractForMode(text: string, mode: ScanMode): ScanFields {
  switch (mode) {
    case "aeps":
      return extractAeps(text);
    case "dmt":
      return extractDmt(text);
    case "upi":
      return extractUpi(text);
    case "payment":
      return extractPayment(text);
  }
}

// Field labels + order shown in the preview / apply UI.
export const MODE_FIELDS: Record<ScanMode, { key: string; label: string }[]> = {
  aeps: [
    { key: "amount", label: "Amount" },
    { key: "aadhaar_last4", label: "Aadhaar (last 4)" },
    { key: "customer_mobile", label: "Customer mobile" },
    { key: "bank_name", label: "Bank" },
    { key: "portal_name", label: "Portal" },
    { key: "service_fee", label: "Service fee" },
    { key: "portal_commission", label: "Portal commission" },
    { key: "reference", label: "RRN / reference" },
    { key: "status", label: "Status" },
    { key: "transaction_date", label: "Date" },
  ],
  dmt: [
    { key: "amount", label: "Amount" },
    { key: "sender_name", label: "Sender" },
    { key: "sender_mobile", label: "Sender mobile" },
    { key: "beneficiary_name", label: "Beneficiary" },
    { key: "beneficiary_account", label: "Beneficiary account" },
    { key: "beneficiary_ifsc", label: "IFSC" },
    { key: "beneficiary_bank", label: "Beneficiary bank" },
    { key: "upi_id", label: "UPI ID" },
    { key: "service_fee", label: "Customer fee" },
    { key: "portal_commission", label: "Portal charge" },
    { key: "reference", label: "RRN / reference" },
    { key: "status", label: "Status" },
    { key: "transaction_date", label: "Date" },
  ],
  upi: [
    { key: "amount", label: "Amount received" },
    { key: "beneficiary_name", label: "From" },
    { key: "customer_mobile", label: "Customer mobile" },
    { key: "service_fee", label: "Service fee" },
    { key: "reference", label: "UTR / reference" },
    { key: "status", label: "Status" },
    { key: "transaction_date", label: "Date" },
  ],
  payment: [
    { key: "amount", label: "Amount paid" },
    { key: "method", label: "Method (UPI/Card/…) " },
    { key: "reference", label: "RRN / UTR" },
  ],
};