/**
 * Spice Money adapter. Report pages under the Spice Money host.
 * Read-only: transaction history/report tables only.
 */
export const spicemoneyAdapter = {
  name: "Spice Money",
  match(url) {
    return /spicemoney|spice-money/i.test(String(url || ""));
  },
  reportHint: "Open the Spice Money transaction history/report page before collecting.",
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
