/**
 * Generic fallback adapter: matches any https report page. Reads the visible
 * transaction table with structural selectors only. Never clicks anything
 * except pagination controls, never fills inputs.
 */
export const genericAdapter = {
  name: "generic",
  match() {
    return true;
  },
  reportHint: "Open the provider report page that lists completed transactions, then run collection.",
  rowSelectorTemplate: "tr:nth-of-type({index})",
  maxRowsPerPage: 100,
  inferEventType(rowText) {
    const text = String(rowText || "").toLowerCase();
    if (/\baeps\b|\bwithdrawal\b/.test(text)) return "aeps";
    if (/\bdmt\b|\bmoney transfer\b|\bremittance\b/.test(text)) return "dmt";
    if (/\brecharge\b|\btop[\s-]?up\b|\bdth\b/.test(text)) return "recharge";
    if (/\bbill\b|\belectricity\b/.test(text)) return "bill_payment";
    if (/\bcommission\b/.test(text)) return "commission";
    if (/\bsettlement\b/.test(text)) return "settlement";
    return "bank_credit";
  },
};
