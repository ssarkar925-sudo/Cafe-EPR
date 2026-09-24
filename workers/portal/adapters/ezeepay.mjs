/**
 * EzeePay AEPS adapter. Report pages under the EzeePay host.
 * Read-only: transaction history/report tables only.
 */
export const ezeepayAdapter = {
  name: "EzeePay",
  match(url) {
    return /ezeepay|ezee-pay/i.test(String(url || ""));
  },
  reportHint: "Open the EzeePay transaction history/AEPS report page before collecting.",
  rowSelectorTemplate: "tr:nth-of-type({index})",
  maxRowsPerPage: 100,
  inferEventType(rowText) {
    const text = String(rowText || "").toLowerCase();
    if (/\baeps\b|\bcash withdrawal\b|\bcw\b|\baadhaar\b/.test(text)) return "aeps";
    if (/\bdmt\b|\bmoney transfer\b|\bremittance\b/.test(text)) return "dmt";
    if (/\brecharge\b|\bbill\b|\bbbps\b/.test(text)) return "recharge";
    if (/\bcommission\b/.test(text)) return "commission";
    return "aeps";
  },
};
