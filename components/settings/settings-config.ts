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
  type: "cash" | "bank" | "upi" | "wallet" | "debit_card" | "credit_card";
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
];

export const TYPE_STYLE: Record<string, string> = {
  cash: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  bank: "bg-blue-50 text-blue-700 ring-blue-200",
  upi: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  wallet: "bg-amber-50 text-amber-700 ring-amber-200",
  debit_card: "bg-violet-50 text-violet-700 ring-violet-200",
  credit_card: "bg-rose-50 text-rose-700 ring-rose-200",
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
};

export type SettingsGroup = {
  id: string;
  label: string;
  items: SettingsGroupItem[];
};

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "store",
    label: "Store & Receipts",
    items: [
      { key: "general", label: "Store Identity", desc: "Shop name, phone, address & currency", icon: "M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" },
      { key: "receipt", label: "Invoice & Receipts", desc: "A4 Tax Invoices, 80mm thermal roll & UPI QR", icon: "M6 2h12a1 1 0 0 1 1 1v18l-2.5-1.5L14 21l-2.5-1.5L9 21l-2.5-1.5L5 21V3a1 1 0 0 1 1-1Z" },
      { key: "tax", label: "Tax & GST", desc: "GSTIN registration & default tax rates", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" },
    ],
  },
  {
    id: "payments",
    label: "Payments & POS Desk",
    items: [
      { key: "payment-accounts", label: "Payment Accounts", desc: "Cash drawer, bank accounts, wallets & cards", icon: "M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9ZM3 14h6m0 0 2-2m-2 2 2 2" },
      { key: "payment-methods", label: "Payment Methods", desc: "Enable/disable payment options & sort order", icon: "M12 8c-2.2 0-4 1.3-4 3s1.8 3 4 3 4-1.3 4-3-1.8-3-4-3ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
      { key: "quick-favorites", label: "Quick Sale Favorites", desc: "1-click favorite service buttons on POS", icon: "M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z" },
    ],
  },
  {
    id: "business",
    label: "Business & Remittance",
    items: [
      { key: "business-setup", label: "Business Setup", desc: "Banks, AEPS portals, QR codes & Recharge slabs", badge: "Essential", badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", icon: "M3 21V9l9-6 9 6v12M9 21v-6h6v6" },
      { key: "catalog", label: "Catalog & Categories", desc: "Products, service rates & category tree", icon: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9" },
      { key: "inventory", label: "Inventory & Supply", desc: "Purchases, vendors, stock movements & valuation", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
    ],
  },
  {
    id: "channels",
    label: "Automations & Backup",
    items: [
      { key: "notifications", label: "WhatsApp & Notifications", desc: "Cloud API, local gateway & zero-click dispatch", badge: "Automated", badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", icon: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" },
      { key: "backup", label: "Backup & Data Export", desc: "Full database snapshots & CSV downloads", icon: "M21 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 8l5-5 5 5M12 3v13" },
    ],
  },
  {
    id: "system",
    label: "Security & Appearance",
    items: [
      { key: "security", label: "Security & Passwords", desc: "Sign-in locks, audit logs & credentials", icon: "M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10ZM9 12l2 2 4-4" },
      { key: "other", label: "Theme", desc: "Display mode, accent, density & Design Changes", icon: "M12 3v18M3 12h18" },
    ],
  },
];

export const TABS = SETTINGS_GROUPS.flatMap((g) => g.items);

export const tabMeta: Record<string, { title: string; desc: string; group: string }> = {
  general: { title: "Store Identity", desc: "Configure your shop name, contact number, address, and primary currency.", group: "Store & Receipts" },
  receipt: { title: "Invoice & Receipt Templates", desc: "Customize default POS print layout (A4 Tax Invoice or 80mm Thermal Receipt), footer note, and dynamic UPI QR code.", group: "Store & Receipts" },
  tax: { title: "Tax & GST Configuration", desc: "Manage your GST registration number and default tax rates for billing.", group: "Store & Receipts" },
  "payment-accounts": { title: "Payment Accounts & Drawers", desc: "Manage named cash registers, bank accounts, UPI IDs, and digital wallets.", group: "Payments & POS Desk" },
  "quick-favorites": { title: "Quick Sale Counter Favorites", desc: "Configure popular 1-click service buttons for instant counter billing.", group: "Payments & POS Desk" },
  catalog: { title: "Catalog Management", desc: "Manage sellable products, service pricelists, and item category classifications.", group: "Business & Remittance" },
  inventory: { title: "Inventory & Supply (Back-Office)", desc: "Manage purchasing, supplier balances, stock movements, and stock reports.", group: "Business & Remittance" },
  "business-setup": { title: "Business Setup & Providers", desc: "Configure AEPS portals, bank integrations, merchant QR codes, and recharge commission slabs.", group: "Business & Remittance" },
  notifications: { title: "WhatsApp Gateway & Notifications", desc: "Set up direct background WhatsApp dispatching for invoices, receipts, and shift reports.", group: "Automations & Backup" },
  backup: { title: "Data Backup & Export", desc: "Export complete accounting data, customer ledgers, and transactions to CSV or SQL snapshots.", group: "Automations & Backup" },
  security: { title: "Security & Access Protection", desc: "Update master password, monitor sign-in activity, and manage session security.", group: "Security & Appearance" },
  other: { title: "Theme & Design", desc: "Choose the display mode first, then open Design Changes when you want to change the visual language of the ERP.", group: "Security & Appearance" },
};

export const THEMES: { key: Theme; label: string; icon: string; hint: string }[] = [
  { key: "light", label: "Light", icon: "M12 3v2m0 14v2M5.6 5.6l1.4 1.4m9.9 9.9 1.4 1.4M3 12h2m14 0h2M5.6 18.4l1.4-1.4m9.9-9.9 1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", hint: "Bright & clean" },
  { key: "dark", label: "Dark", icon: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z", hint: "Easy on the eyes" },
  { key: "system", label: "System", icon: "M12 3a9 9 0 0 0 0 18c.5-2 .5-3.5 0-5a4.5 4.5 0 0 1 0-8c.5-1.5.5-3 0-5ZM3.5 12h17", hint: "Follow your device" },
];

export const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900 dark:text-white";

export const labelClass = "mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400";
