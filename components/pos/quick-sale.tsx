"use client";

import type { PosCustomer, PosInstrument, PosProduct, PosService } from "./pos-client";

/**
 * Legacy Quick Sale has been retired.
 * The POS is now a single standard billing workspace.
 * This compatibility stub remains only so older imports cannot break builds.
 */
export type QuickSale = Record<string, unknown>;

export default function QuickSaleModule(_props: {
  products: PosProduct[];
  services: PosService[];
  customers: PosCustomer[];
  instruments: PosInstrument[];
  initialToday?: QuickSale[];
  enabledMethods?: string[];
  canViewProfit?: boolean;
}) {
  return null;
}
