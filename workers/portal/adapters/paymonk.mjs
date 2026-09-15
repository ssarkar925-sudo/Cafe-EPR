/**
 * Paymonk adapter. Report pages under the Paymonk host.
 * Read-only: transaction history/report tables only.
 */
export const paymonkAdapter = {
  name: "Paymonk",
  match(url) {
    return /paymonk/i.test(String(url || ""));
  },
  reportHint: "Open the Paymonk transaction history/report page before collecting.",
  rowSelectorTemplate: "tr:nth-of-type({index})",
  maxRowsPerPage: 100,
  inferEventType(rowText) {
    const text = String(rowText || "").toLowerCase();
    if (/\baeps\b|\bwithdrawal\b/.test(text)) return "aeps";
    if (/\bdmt\b|\bmoney transfer\b|\bremittance\b/.test(text)) return "dmt";
    if (/\brecharge\b|\bdth\b/.test(text)) return "recharge";
    return "bank_credit";
  },
};
