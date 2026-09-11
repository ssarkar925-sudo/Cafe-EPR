"use client";

import type { QuickAccessItem } from "@/components/quick-access-registry";
import { QUICK_ACCESS_CATALOG } from "@/components/quick-access-registry";

/**
 * Compatibility shell for legacy callers.
 * Quick Access is now rendered once at the application-shell level by
 * GlobalQuickAccess and owned from Settings → Theme & Display.
 */
export type QuickNavItem = QuickAccessItem;
export const ALL_AVAILABLE_MODULES = QUICK_ACCESS_CATALOG;

export default function ModuleQuickNav() {
  return null;
}
