import type { Theme } from "@/components/theme-provider";

export type SettingsRow = {
  shop_name: string;
  phone: string | null;
  address: string | null;
  receipt_footer: string | null;
  currency_symbol: string;
  logo_url: string | null;
  gstin: string | null;
  tax_rate: number | string | null;
};

export type InstrumentRow = {
  id: string;
  name: string;
  type: "cash" | "bank" | "upi" | "wallet" | "debit_card" | "credit_card" | "aeps_portal" | "dmt_portal";
  is_active: boolean;
  details: any;
  opening_balance: number | string;
  balance: number | string;
};

export type ServiceFavRow = {
  id: string;
  name: string;
  sale_price: number | string;
  is_quick_favorite: boolean;
  quick_sort: number | null;
};

export type PaymentMethodRow = {
  id: string;
  method: string;
  label: string;
  is_active: boolean;
  sort_order: number;
};

export type MasterData = { rows: any[]; usage: Record<string, number> };

export type InstForm = {
  name: string;
  type: InstrumentRow["type"];
  opening_balance: string;
  credit_limit: string;
  used_limit: string;
  bank_name: string;
  account_number: string;
  ifsc: string;
  upi_id: string;
  linked: string;
  card_last4: string;
  linked_bank_instrument_id?: string;
  custom_name?: boolean;
  portal_code?: string;
  agent_code?: string;
  notes: string;
};

export const CURRENCIES = ["₹", "$", "€", "£", "৳", "ر.س"];

export const INSTRUMENT_TYPES: { value: InstrumentRow["type"]; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank account" },
  { value: "upi", label: "UPI" },
  { value: "wallet", label: "Wallet" },
  { value: "debit_card", label: "Debit card" },
  { value: "credit_card", label: "Credit card" },
  { value: "aeps_portal", label: "AEPS Float" },
  { value: "dmt_portal", label: "DMT Float" },
];

export const TYPE_STYLE: Record<string, string> = {
  cash: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  bank: "bg-blue-50 text-blue-700 ring-blue-200",
  upi: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  wallet: "bg-amber-50 text-amber-700 ring-amber-200",
  debit_card: "bg-violet-50 text-violet-700 ring-violet-200",
  credit_card: "bg-rose-50 text-rose-700 ring-rose-200",
  aeps_portal: "bg-orange-50 text-orange-700 ring-orange-200",
  dmt_portal: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
};

export const METHOD_STYLE: Record<string, string> = {
  cash: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  card: "bg-blue-50 text-blue-700 ring-blue-200",
  bank: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  upi: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  wallet: "bg-amber-50 text-amber-700 ring-amber-200",
  debit_card: "bg-violet-50 text-violet-700 ring-violet-200",
  credit_card: "bg-rose-50 text-rose-700 ring-rose-200",
};

export const STANDARD_METHODS: { method: string; label: string }[] = [
  { method: "cash", label: "Cash" },
  { method: "card", label: "Card" },
  { method: "bank", label: "Bank" },
  { method: "upi", label: "UPI" },
  { method: "wallet", label: "Wallet" },
  { method: "debit_card", label: "Debit Card" },
  { method: "credit_card", label: "Credit Card" },
];

export type SettingsGroupItem = {
  key: string;
  label: string;
  desc: string;
  icon: string;
  badge?: string;
  badgeColor?: string;
  accent?: string;
  directHref?: string;
  section?: string;
  categoryName?: string;
};

export type SettingsGroup = {
  id: string;
  label: string;
  tagline: string;
  color: string;
  borderColor: string;
  bgGlow: string;
  items: SettingsGroupItem[];
};

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "business",
    label: "Business & Legal",
    tagline: "Store identity, legal tax registration & receipt layouts",
    color: "from-blue-600 to-cyan-600",
    borderColor: "border-blue-500/20",
    bgGlow: "bg-blue-500/5",
    items: [
      { key: "general", label: "Store Identity", desc: "Shop name, phone, address, logo & primary currency", icon: "M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z", accent: "text-blue-600 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400" },
      { key: "receipt", label: "Invoice & Receipts", desc: "A4 Tax Invoices, 80mm thermal roll, footer & QR codes", icon: "M6 2h12a1 1 0 0 1 1 1v18l-2.5-1.5L14 21l-2.5-1.5L9 21l-2.5-1.5L5 21V3a1 1 0 0 1 1-1Z", accent: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/50 dark:text-cyan-400" },
      { key: "tax", label: "Tax & GST", desc: "GSTIN registration, default billing tax rates & HSN settings", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8", accent: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 dark:text-indigo-400" },
    ],
  },
  {
    id: "pos-sales",
    label: "POS & Counter Billing",
    tagline: "Speed billing fast-keys, payment methods & checkout rules",
    color: "from-emerald-600 to-teal-600",
    borderColor: "border-emerald-500/20",
    bgGlow: "bg-emerald-500/5",
    items: [
      { key: "quick-favorites", label: "Quick Sale Favorites", desc: "1-click favorite service buttons on POS counter", icon: "M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z", badge: "F2 Fast", badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300", accent: "text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400" },
      { key: "payment-methods", label: "Payment Methods", desc: "Enable/disable counter payment options & sort order", icon: "M12 8c-2.2 0-4 1.3-4 3s1.8 3 4 3 4-1.3 4-3-1.8-3-4-3ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", accent: "text-teal-600 bg-teal-50 dark:bg-teal-950/50 dark:text-teal-400" },
      { key: "pos-terminal", label: "POS Terminal", desc: "Open live billing counter & barcode scan desk", icon: "M6 6h15l-1.5 8h-13L4 3H2M9 20a1 1 0 1 0 0 .01M20 20a1 1 0 1 0 0 .01", directHref: "/pos", accent: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400" },
    ],
  },
  {
    id: "finance",
    label: "Payments & Liquid Finance",
    tagline: "Cash registers, bank accounts, opening equity & reconciliation",
    color: "from-cyan-600 to-blue-600",
    borderColor: "border-cyan-500/20",
    bgGlow: "bg-cyan-500/5",
    items: [
      { key: "payment-accounts", label: "Payment Accounts", desc: "Cash drawer, bank accounts, UPI IDs, wallets & cards", icon: "M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9ZM3 14h6m0 0 2-2m-2 2 2 2", badge: "Live Float", badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300", accent: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/50 dark:text-cyan-400" },
      { key: "opening-balances", label: "Opening Balances", desc: "Seed opening liquid cash, portal balances & equity", icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", directHref: "/finance/opening-balances", badge: "Equity", badgeColor: "bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300", accent: "text-purple-600 bg-purple-50 dark:bg-purple-950/50 dark:text-purple-400" },
      { key: "settlements", label: "Settlements & Float", desc: "Bank-to-wallet transfers & portal recharge float", icon: "M3 7l7-4 7 4 4-2v13l-4 2-7-4-7 4V7zM10 3v13m7-11v13", directHref: "/finance/settlements", accent: "text-blue-600 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400" },
      { key: "reconciliation", label: "Financial Reconciliation", desc: "Audit cross-instrument balances & cashbook integrity", icon: "M12 8v4m0 4h.01M12 3l9 5v8l-9 5-9-5V8l9-5ZM6.5 8.5 12 6l5.5 2.5M12 6v12", directHref: "/finance/reconciliation", badge: "Zero-Delta", badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300", accent: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400" },
    ],
  },
  {
    id: "recharge-bill",
    label: "Recharge & Bill Payment",
    tagline: "BBPS utility providers, commissions, margins & plan catalog",
    color: "from-amber-600 to-orange-600",
    borderColor: "border-amber-500/20",
    bgGlow: "bg-amber-500/5",
    items: [
      { key: "business-setup", section: "recharge", label: "Recharge Providers & Slabs", desc: "Configure prepaid operators & retailer commission slabs", icon: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z", badge: "Operator Slabs", badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300", accent: "text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400" },
      { key: "business-setup", section: "bill-payment", label: "BBPS Bill Commissions", desc: "Configure custom commissions and surcharges for 10 utility categories", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z", badge: "Configurable", badgeColor: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300", accent: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 dark:text-indigo-400" },
      { key: "recharge-plans", label: "Recharge Plan Manager", desc: "Manage live recharge tariff packs, validity & TalkTime plans", icon: "M4 6h16M4 10h16M4 14h16M4 18h16", directHref: "/business/bill-payment/mobile-recharge/plans", accent: "text-orange-600 bg-orange-50 dark:bg-orange-950/50 dark:text-orange-400" },
      { key: "google-play-margin", label: "Google Play Margin Rules", desc: "Set retailer discount margins and customer fees for code vouchers", icon: "M12 2l10 6.5v7L12 22 2 15.5v-7L12 2z", directHref: "/business/bill-payment/google-play", accent: "text-rose-600 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-400" },
    ],
  },
  {
    id: "aeps-services",
    label: "AEPS & Digital Services",
    tagline: "Commercial banks, settlement portals & counter UPI QRs",
    color: "from-violet-600 to-purple-600",
    borderColor: "border-violet-500/20",
    bgGlow: "bg-violet-500/5",
    items: [
      { key: "business-setup", section: "banks", label: "AEPS Banks Master", desc: "Commercial bank registry used for Aadhaar cash disbursement", icon: "M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v4M12 14v4M16 14v4", accent: "text-violet-600 bg-violet-50 dark:bg-violet-950/50 dark:text-violet-400" },
      { key: "business-setup", section: "portals", label: "Service Portals Master", desc: "PayNearby, SpiceMoney & CSC portal float connections", icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z", accent: "text-purple-600 bg-purple-50 dark:bg-purple-950/50 dark:text-purple-400" },
      { key: "business-setup", section: "merchant-qrs", label: "Merchant QRs Master", desc: "Counter UPI QR profiles & shop receiver IDs", icon: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14h1M14 20h1M20 20h1", accent: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/50 dark:text-cyan-400" },
    ],
  },
  {
    id: "catalog-inventory",
    label: "Inventory & Catalog",
    tagline: "Products, service rate cards, category trees & stock audit",
    color: "from-purple-600 to-pink-600",
    borderColor: "border-purple-500/20",
    bgGlow: "bg-purple-500/5",
    items: [
      { key: "catalog", section: "products", label: "Products Catalog", desc: "Sellable retail goods, barcodes, cost prices & stock levels", icon: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9", accent: "text-purple-600 bg-purple-50 dark:bg-purple-950/50 dark:text-purple-400" },
      { key: "catalog", section: "services", label: "Services Rate Card", desc: "Cybercafe, printing, xerox & online service charges", icon: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z", accent: "text-pink-600 bg-pink-50 dark:bg-pink-950/50 dark:text-pink-400" },
      { key: "catalog", section: "categories", label: "Categories Tree", desc: "Product & service organization for fast POS grouping", icon: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", accent: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 dark:text-indigo-400" },
      { key: "inventory", label: "Stock Movements", desc: "Weighted average costing, supplier intake & stock valuation", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4", badge: "WAC Cost", badgeColor: "bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300", accent: "text-fuchsia-600 bg-fuchsia-50 dark:bg-fuchsia-950/50 dark:text-fuchsia-400" },
    ],
  },
  {
    id: "parties",
    label: "Customers & Suppliers",
    tagline: "Customer Khata credit rules, dues tracking & vendor accounts",
    color: "from-blue-600 to-indigo-600",
    borderColor: "border-blue-500/20",
    bgGlow: "bg-blue-500/5",
    items: [
      { key: "customers-dir", label: "Customers Directory", desc: "Customer profiles, contact numbers & transaction history", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", directHref: "/customers", accent: "text-blue-600 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400" },
      { key: "customer-ledger", label: "Customer Dues Ledger", desc: "Khata credit books, dues collection & statements", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2", directHref: "/finance/ledger", badge: "Khata", badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300", accent: "text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400" },
      { key: "suppliers-dir", label: "Suppliers & Vendors", desc: "Vendor accounts, procurement ledger & accounts payable", icon: "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm11 10v-6a2 2 0 0 0-2-2h-1m3 8h-4", directHref: "/suppliers", accent: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 dark:text-indigo-400" },
    ],
  },
  {
    id: "security-team",
    label: "Security & Team Access",
    tagline: "Staff accounts, role permissions, 2FA & immutable audit log",
    color: "from-rose-600 to-pink-600",
    borderColor: "border-rose-500/20",
    bgGlow: "bg-rose-500/5",
    items: [
      { key: "staff-mgmt", label: "Staff Management", desc: "Operator credentials, cash register limits & role security", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", directHref: "/staff", badge: "RBAC", badgeColor: "bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300", accent: "text-rose-600 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-400" },
      { key: "security", label: "Security & Passwords", desc: "Master passwords, active sessions & terminal screen lock", icon: "M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10ZM9 12l2 2 4-4", accent: "text-red-600 bg-red-50 dark:bg-red-950/50 dark:text-red-400" },
      { key: "audit-trail", label: "Audit Trail Log", desc: "Immutable timeline of edits, deletions & financial events", icon: "M12 8v4m0 4h.01M12 3l9 5v8l-9 5-9-5V8l9-5ZM6.5 8.5 12 6l5.5 2.5M12 6v12", directHref: "/audit", accent: "text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400" },
    ],
  },
  {
    id: "reports-tax",
    label: "Reports & Tax Compliance",
    tagline: "Financial statements, GST statutory returns & CA audit files",
    color: "from-emerald-600 to-cyan-600",
    borderColor: "border-emerald-500/20",
    bgGlow: "bg-emerald-500/5",
    items: [
      { key: "reports-hub", label: "Reports & Analytics Studio", desc: "Executive sales, margins, expenses & digital turnover", icon: "M18 20V10M12 20V4M6 20v-6", directHref: "/reports", accent: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400" },
      { key: "gst-reports", label: "GST Statutory Returns", desc: "B2B / B2C invoice schedules for GSTR-1 and GSTR-3B", icon: "M9 14l6-6m-6 0h.01M15 14h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", directHref: "/reports/gst", badge: "GST Portal", badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300", accent: "text-teal-600 bg-teal-50 dark:bg-teal-950/50 dark:text-teal-400" },
      { key: "tax-prep", label: "Tax Preparation (ITR-3/4)", desc: "Audited financial statements & balance sheet pack for CA", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z", directHref: "/reports/tax-preparation", badge: "CA Pack", badgeColor: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300", accent: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 dark:text-indigo-400" },
    ],
  },
  {
    id: "automations-system",
    label: "Automations & Appearance",
    tagline: "WhatsApp background gateway, themes, density & data backup",
    color: "from-amber-600 to-rose-600",
    borderColor: "border-amber-500/20",
    bgGlow: "bg-amber-500/5",
    items: [
      { key: "notifications", label: "WhatsApp Gateway", desc: "Automated invoice dispatch, receipts & outbox queue", icon: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z", badge: "Auto Dispatch", badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300", accent: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400" },
      { key: "other", label: "Theme & Display", desc: "Light, dark & system display modes with UI density", icon: "M12 3v18M3 12h18", accent: "text-pink-600 bg-pink-50 dark:bg-pink-950/50 dark:text-pink-400" },
      { key: "backup", label: "Backup & Data Export", desc: "Full database snapshots, accounting ledgers & CSV downloads", icon: "M21 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 8l5-5 5 5M12 3v13", accent: "text-orange-600 bg-orange-50 dark:bg-orange-950/50 dark:text-orange-400" },
      { key: "ai-audit", label: "Financial Self-Audit", desc: "Automated 14-point invariant verification & accounting checks", icon: "M12 2a2 2 0 0 1 2 2v1a1 1 0 0 0 1 1h1a2 2 0 0 1 2 2v1a1 1 0 0 0 1 1h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1a1 1 0 0 0-1 1v1a2 2 0 0 1-2 2h-1a1 1 0 0 0-1 1v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1a1 1 0 0 0-1-1h-1a2 2 0 0 1-2-2v-1a1 1 0 0 1-1-1H3a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1a1 1 0 0 0 1-1V9a2 2 0 0 1 2-2h1a1 1 0 0 0 1-1V4a2 2 0 0 1 2-2h2zM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z", directHref: "/ai/self-audit", badge: "14 Checks", badgeColor: "bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300", accent: "text-purple-600 bg-purple-50 dark:bg-purple-950/50 dark:text-purple-400" },
    ],
  },
];

export const TABS = SETTINGS_GROUPS.flatMap((g) => g.items);

export const tabMeta: Record<string, { title: string; desc: string; group: string }> = {
  general: { title: "Store Identity", desc: "Configure your shop name, contact number, address, and primary currency.", group: "Business & Legal" },
  receipt: { title: "Invoice & Receipt Templates", desc: "Customize default POS print layout (A4 Tax Invoice or 80mm Thermal Receipt), footer note, and dynamic UPI QR code.", group: "Business & Legal" },
  tax: { title: "Tax & GST Configuration", desc: "Manage your GST registration number and default tax rates for billing.", group: "Business & Legal" },
  "payment-accounts": { title: "Payment Accounts & Drawers", desc: "Manage named cash registers, bank accounts, UPI IDs, and digital wallets.", group: "Payments & Liquid Finance" },
  "quick-favorites": { title: "Quick Sale Counter Favorites", desc: "Configure popular 1-click service buttons for instant counter billing.", group: "POS & Counter Billing" },
  "payment-methods": { title: "Payment Methods", desc: "Enable/disable counter payment options & sort order.", group: "POS & Counter Billing" },
  catalog: { title: "Catalog Management", desc: "Manage sellable products, service pricelists, and item category classifications.", group: "Inventory & Catalog" },
  inventory: { title: "Inventory & Supply (Back-Office)", desc: "Manage purchasing, supplier balances, stock movements, and stock reports.", group: "Inventory & Catalog" },
  "business-setup": { title: "Business Setup & Providers", desc: "Configure AEPS portals, bank integrations, merchant QR codes, and recharge commission slabs.", group: "Recharge & Bill Payment" },
  notifications: { title: "WhatsApp Gateway & Notifications", desc: "Set up direct background WhatsApp dispatching for invoices, receipts, and shift reports.", group: "Automations & Appearance" },
  backup: { title: "Data Backup & Export", desc: "Export complete accounting data, customer ledgers, and transactions to CSV or SQL snapshots.", group: "Automations & Appearance" },
  security: { title: "Security & Access Protection", desc: "Update master password, monitor sign-in activity, and manage session security.", group: "Security & Team Access" },
  other: { title: "Theme & Display", desc: "Choose the display mode (Light, Dark, System) and interface density.", group: "Automations & Appearance" },
};

export const THEMES: { key: Theme; label: string; icon: string; hint: string }[] = [
  { key: "light", label: "Light", icon: "M12 3v2m0 14v2M5.6 5.6l1.4 1.4m9.9 9.9 1.4 1.4M3 12h2m14 0h2M5.6 18.4l1.4-1.4m9.9-9.9 1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", hint: "Bright & clean" },
  { key: "dark", label: "Dark", icon: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z", hint: "Easy on the eyes" },
  { key: "system", label: "System", icon: "M12 3a9 9 0 0 0 0 18c.5-2 .5-3.5 0-5a4.5 4.5 0 0 1 0-8c.5-1.5.5-3 0-5ZM3.5 12h17", hint: "Follow your device" },
];

export const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900 dark:text-white";

export const labelClass = "mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400";
