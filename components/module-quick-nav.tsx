"use client";

import type { QuickAccessItem } from "@/components/quick-access-registry";
import { QUICK_ACCESS_CATALOG } from "@/components/quick-access-registry";

/**
 * Compatibility shell for legacy callers.
 * Quick Access is now rendered once at the application-shell level by
 * GlobalQuickAccess and owned from Settings → Theme & Display.
 */
export type QuickNavItem = QuickAccessItem;
const REQUIRED_CANONICAL_MODULES: QuickAccessItem[] = [
  { id: "bill-payment", label: "Bill Payment", href: "/business/bill-payment", icon: "bill-payment" },
  { id: "utility-bills", label: "Utility Bills", href: "/business/bill-payment?tab=utility", icon: "utility-bills" },
  { id: "journal", label: "Double-Entry Journal", href: "/finance/journal", icon: "journal" },
  { id: "trial-balance", label: "Trial Balance", href: "/finance/trial-balance", icon: "trial-balance" },
  { id: "whatsapp", label: "WhatsApp Desk", href: "/business/whatsapp", icon: "whatsapp" },
];

const MODULES_BY_ID = new Map<string, QuickAccessItem>();
for (const item of [...QUICK_ACCESS_CATALOG, ...REQUIRED_CANONICAL_MODULES]) MODULES_BY_ID.set(item.id, item);

export const ALL_AVAILABLE_MODULES: QuickAccessItem[] = [...MODULES_BY_ID.values()];

export default function ModuleQuickNav() {
  return null;
}
