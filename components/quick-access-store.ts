import {
  DEFAULT_QUICK_ACCESS,
  normalizeQuickAccessItems,
  type QuickAccessItem,
} from "@/components/quick-access-registry";

export type QuickAccessDisplayMode = "full" | "icon";

export const QUICK_ACCESS_STORAGE_KEY = "cafe_erp_custom_quick_access";
export const QUICK_ACCESS_CANONICAL_KEY = "cafe_erp_quick_access_items";
export const QUICK_ACCESS_DASHBOARD_KEY = "cafe-erp-dashboard-quick-actions";
export const QUICK_ACCESS_DISPLAY_KEY = "cafe_erp_quick_access_display_mode";
export const QUICK_ACCESS_OWNER_KEY = "cafe_erp_quick_access_settings_owner_active";
export const QUICK_ACCESS_EVENT = "cafe-erp-quick-access-change";

const OLD_ID_BY_NEW_ID: Record<string, string> = {
  "new-sale": "pos",
  "quick-sale": "quick-sale",
  "customer-crm": "customers",
  "cash-book": "cashbook",
  aeps: "aeps",
  dmt: "dmt",
  expenses: "expenses",
  "day-close": "dayclose",
};

function readArray(key: string): unknown[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function emitChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(QUICK_ACCESS_EVENT));
}

export function loadQuickAccessItems(): QuickAccessItem[] {
  const keys = [QUICK_ACCESS_CANONICAL_KEY, QUICK_ACCESS_STORAGE_KEY, QUICK_ACCESS_DASHBOARD_KEY];
  for (const key of keys) {
    const normalized = normalizeQuickAccessItems(readArray(key));
    if (normalized.length > 0) return normalized;
  }
  return [...DEFAULT_QUICK_ACCESS];
}

export function saveQuickAccessItems(items: QuickAccessItem[]) {
  if (typeof window === "undefined") return;
  const normalized = normalizeQuickAccessItems(items);
  const safeItems = normalized.length > 0 ? normalized : [...DEFAULT_QUICK_ACCESS];
  try {
    window.localStorage.setItem(QUICK_ACCESS_CANONICAL_KEY, JSON.stringify(safeItems));
    window.localStorage.setItem(QUICK_ACCESS_STORAGE_KEY, JSON.stringify(safeItems));

    // Keep the older dashboard editor state synchronized for compatibility with any
    // existing dashboard card still mounted in production.
    window.localStorage.setItem(
      QUICK_ACCESS_DASHBOARD_KEY,
      JSON.stringify(
        safeItems.map((item) => ({
          ...item,
          id: OLD_ID_BY_NEW_ID[item.id] || item.id,
        })),
      ),
    );
  } catch {}
  emitChange();
}

export function loadQuickAccessDisplayMode(): QuickAccessDisplayMode {
  if (typeof window === "undefined") return "full";
  try {
    return window.localStorage.getItem(QUICK_ACCESS_DISPLAY_KEY) === "icon" ? "icon" : "full";
  } catch {
    return "full";
  }
}

export function saveQuickAccessDisplayMode(mode: QuickAccessDisplayMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUICK_ACCESS_DISPLAY_KEY, mode);
  } catch {}
  emitChange();
}

export function loadQuickAccessOwnerActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(QUICK_ACCESS_OWNER_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveQuickAccessOwnerActive(active: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUICK_ACCESS_OWNER_KEY, String(active));
  } catch {}
  emitChange();
}

export function subscribeQuickAccess(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(QUICK_ACCESS_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(QUICK_ACCESS_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
