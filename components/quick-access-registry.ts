export type QuickAccessItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
};

export const DEFAULT_QUICK_ACCESS: QuickAccessItem[] = [
  { id: "new-sale", label: "New Sale", href: "/pos", icon: "new-sale" },
  { id: "quick-sale", label: "Quick Sale", href: "/pos?mode=quick", icon: "quick-sale" },
  { id: "customer-crm", label: "Customer CRM", href: "/customers", icon: "customer-crm" },
  { id: "cash-book", label: "Cash Book", href: "/finance/cashbook", icon: "cash-book" },
  { id: "aeps", label: "AEPS ATM", href: "/business/aeps", icon: "aeps" },
  { id: "dmt", label: "Money Transfer", href: "/business/dmt", icon: "dmt" },
  { id: "expenses", label: "Expenses", href: "/finance/expenses", icon: "expenses" },
  { id: "day-close", label: "Day Close", href: "/finance/day-close", icon: "day-close" },
];

export const QUICK_ACCESS_CATALOG: QuickAccessItem[] = [
  ...DEFAULT_QUICK_ACCESS,
  { id: "dashboard", label: "Executive Dashboard", href: "/dashboard", icon: "dashboard" },
  { id: "invoices", label: "Invoices & Sales", href: "/invoices", icon: "invoices" },
  { id: "returns", label: "Returns & Refunds", href: "/returns", icon: "returns" },
  { id: "products", label: "Products Catalog", href: "/catalog/products", icon: "products" },
  { id: "services", label: "Services Catalog", href: "/catalog/services", icon: "services" },
  { id: "categories", label: "Categories", href: "/catalog/categories", icon: "categories" },
  { id: "purchases", label: "Purchase Entry", href: "/purchases/entry", icon: "purchases" },
  { id: "suppliers", label: "Suppliers", href: "/suppliers", icon: "suppliers" },
  { id: "bill-payment", label: "Bill Payment", href: "/business/bill-payment", icon: "bill-payment" },
  { id: "recharge", label: "Mobile Recharge", href: "/business/bill-payment?tab=recharge", icon: "recharge" },
  { id: "google-play", label: "Google Play", href: "/business/bill-payment?tab=google_play", icon: "google-play" },
  { id: "utility-bills", label: "Utility Bills", href: "/business/bill-payment?tab=utility", icon: "utility-bills" },
  { id: "upi", label: "UPI Collections", href: "/business/upi", icon: "upi" },
  { id: "whatsapp", label: "WhatsApp Desk", href: "/business/whatsapp", icon: "whatsapp" },
  { id: "finance-hub", label: "Finance Hub", href: "/finance", icon: "finance-hub" },
  { id: "journal", label: "Double-Entry Journal", href: "/finance/journal", icon: "journal" },
  { id: "trial-balance", label: "Trial Balance", href: "/finance/trial-balance", icon: "trial-balance" },
  { id: "settlements", label: "Settlements & Float", href: "/finance/settlements", icon: "settlements" },
  { id: "pnl", label: "Profit & Loss", href: "/finance/pnl", icon: "pnl" },
  { id: "reconciliation", label: "Reconciliation", href: "/finance/reconciliation", icon: "reconciliation" },
  { id: "opening", label: "Opening Balances", href: "/finance/opening-balances", icon: "opening" },
  { id: "reports", label: "Reports Hub", href: "/reports", icon: "reports" },
  { id: "gst", label: "GST Reports", href: "/reports/gst", icon: "gst" },
  { id: "tax-prep", label: "Tax Preparation / ITR", href: "/reports/tax-preparation", icon: "tax-prep" },
  { id: "audit-log", label: "Security Audit Log", href: "/audit", icon: "audit-log" },
  { id: "ai", label: "AI Advisor", href: "/ai", icon: "ai" },
  { id: "self-audit", label: "Financial Self-Audit", href: "/ai/self-audit", icon: "self-audit" },
  { id: "staff", label: "Staff Accounts", href: "/staff", icon: "staff" },
  { id: "security", label: "Security & 2FA", href: "/security", icon: "security" },
  { id: "settings", label: "System Settings", href: "/settings", icon: "settings" },
];

const BY_ID = new Map(QUICK_ACCESS_CATALOG.map((item) => [item.id, item]));

const LEGACY_ID_MAP: Record<string, string> = {
  pos: "new-sale",
  invoices: "invoices",
  customers: "customer-crm",
  cashbook: "cash-book",
  expenses: "expenses",
  dayclose: "day-close",
  aeps: "aeps",
  dmt: "dmt",
  upi: "upi",
  reports: "reports",
  audit: "self-audit",
};

export function normalizeQuickAccessItem(value: unknown): QuickAccessItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<QuickAccessItem>;
  const mappedId = typeof item.id === "string" ? (LEGACY_ID_MAP[item.id] || item.id) : "";
  const known = BY_ID.get(mappedId);
  if (known) return { ...known, ...(typeof item.label === "string" ? { label: item.label.slice(0, 40) } : {}) };
  if (typeof item.href === "string") {
    const byHref = QUICK_ACCESS_CATALOG.find((candidate) => candidate.href === item.href);
    if (byHref) return { ...byHref, ...(typeof item.label === "string" ? { label: item.label.slice(0, 40) } : {}) };
  }
  return null;
}

export function normalizeQuickAccessItems(value: unknown): QuickAccessItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: QuickAccessItem[] = [];
  for (const entry of value) {
    const normalized = normalizeQuickAccessItem(entry);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    result.push(normalized);
  }
  return result;
}

export function quickAccessItemById(id: string): QuickAccessItem | undefined {
  return BY_ID.get(id);
}
