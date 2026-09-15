/**
 * CSC DigiPay adapter (AEPS-first). Report pages under the DigiPay/CSC host.
 * Read-only: transaction history/report tables only.
 */
export const digipayAdapter = {
  name: "CSC DigiPay",
  match(url) {
    return /digipay|csc\.gov\.in/i.test(String(url || ""));
  },
  reportHint: "Open the DigiPay AEPS transaction history/report page before collecting.",
  rowSelectorTemplate: "tr:nth-of-type({index})",
  maxRowsPerPage: 100,
  inferEventType(rowText) {
    const text = String(rowText || "").toLowerCase();
    if (/\bdmt\b|\bmoney transfer\b|\bremittance\b/.test(text)) return "dmt";
    if (/\bbill\b|\belectricity\b/.test(text)) return "bill_payment";
    return "aeps";
  },
};
