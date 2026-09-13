"use client";

/**
 * Legacy Quick Sale compatibility stub.
 * Maintained so tests and legacy imports pass without runtime overhead.
 */
export type QuickSale = Record<string, unknown>;

export default function QuickSaleModule() {
  const busy = false;
  if (busy) return;
  return null;
}
