/**
 * Presentation-only inventory display helpers.
 *
 * These compute NOTHING authoritative: available quantities, FIFO ranks, and
 * expiry bands are derived from server-returned rows for display. The
 * database remains the sole authority for availability, allocation order,
 * and lifecycle transitions.
 *
 * Expiry bands use the approved D6 decision (30-day watch, 7-day action).
 * They are display labels, not thresholds that change any behavior.
 */

export const EXPIRY_WATCH_DAYS = 30;
export const EXPIRY_ACTION_DAYS = 7;

export type ExpiryBand = "expired" | "action" | "watch" | "ok";

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysUntil(expiryDate: string): number {
  const [y, m, d] = expiryDate.split("-").map(Number);
  const expiry = new Date(y, (m ?? 1) - 1, d ?? 1);
  const diffMs = expiry.getTime() - startOfToday().getTime();
  return Math.floor(diffMs / 86_400_000);
}

export function expiryBand(expiryDate: string, lotStatus: string): ExpiryBand {
  if (lotStatus === "expired") return "expired";
  const days = daysUntil(expiryDate);
  if (days < 0) return "expired";
  if (days <= EXPIRY_ACTION_DAYS) return "action";
  if (days <= EXPIRY_WATCH_DAYS) return "watch";
  return "ok";
}

export function expiryBandLabel(band: ExpiryBand): string {
  switch (band) {
    case "expired":
      return "Expired";
    case "action":
      return "Action ≤7d";
    case "watch":
      return "Watch ≤30d";
    default:
      return "OK";
  }
}

/** Display-only available quantity: remaining minus active held. */
export function displayAvailable(qtyRemaining: number, activeHeld: number): number {
  return Math.max(0, qtyRemaining - activeHeld);
}

/** Display-only FIFO rank: index of the lot in received_at order (1-based). */
export function fifoRank(sortedLotIds: string[], lotId: string): number {
  const index = sortedLotIds.indexOf(lotId);
  return index < 0 ? 0 : index + 1;
}
