/**
 * ==============================================================================
 * CANONICAL IST DATE & TIMEZONE UTILITY (Asia/Kolkata)
 * ==============================================================================
 * Strict deterministic business-day accounting boundaries for Indian Standard Time.
 * A selected day always begins at 00:00:00.000 IST and concludes at 23:59:59.999 IST.
 * ==============================================================================
 */

export const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Returns YYYY-MM-DD for a given date in Asia/Kolkata timezone.
 */
export function getIstDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Returns YYYY-MM-DD for the previous business day in Asia/Kolkata timezone.
 */
export function getIstYesterdayDateString(date: Date = new Date()): string {
  const istDateStr = getIstDateString(date);
  const [y, m, d] = istDateStr.split("-").map(Number);
  const istDate = new Date(Date.UTC(y, m - 1, d));
  istDate.setUTCDate(istDate.getUTCDate() - 1);
  return istDate.toISOString().slice(0, 10);
}

/**
 * Returns the exact UTC ISO string bounds for a given IST business day.
 */
export function getIstDayBounds(istDateString: string): { startUtc: string; endUtc: string } {
  // 00:00:00 IST is -05:30 UTC = previous day 18:30:00 UTC
  // 23:59:59.999 IST is +18:29:59.999 UTC
  const [y, m, d] = istDateString.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 5.5 * 3600 * 1000);
  const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - 5.5 * 3600 * 1000);
  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  };
}

