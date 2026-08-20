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

export const TABS: { key: string; label: string; icon: string }[] = [
  { key: "general", label: "General", icon: "M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" },
  { key: "receipt", label: "Receipt & Printer", icon: "M6 2h12a1 1 0 0 1 1 1v18l-2.5-1.5L14 21l-2.5-1.5L9 21l-2.5-1.5L5 21V3a1 1 0 0 1 1-1Z" },
  { key: "payment-accounts", label: "Payment Accounts", icon: "M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9ZM3 14h6m0 0 2-2m-2 2 2 2" },
  { key: "payment-methods", label: "Payment Methods", icon: "M12 8c-2.2 0-4 1.3-4 3s1.8 3 4 3 4-1.3 4-3-1.8-3-4-3ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  { key: "quick-favorites", label: "Quick Sale Favorites", icon: "M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z" },
  { key: "catalog", label: "Catalog", icon: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9" },
  { key: "business-setup", label: "Business Setup", icon: "M3 21V9l9-6 9 6v12M9 21v-6h6v6" },
  { key: "tax", label: "Tax & GST", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" },
  { key: "backup", label: "Backup & Data", icon: "M21 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 8l5-5 5 5M12 3v13" },
  { key: "notifications", label: "Notifications", icon: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" },
  { key: "security", label: "Security", icon: "M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10ZM9 12l2 2 4-4" },
  { key: "other", label: "Other Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" },
];

export const tabMeta: Record<string, { title: string; desc: string }> = {
  general: { title: "General", desc: "Shop identity and currency." },
  receipt: { title: "Receipt & Printer", desc: "Footer line printed on every 80mm receipt." },
  "payment-accounts": { title: "Payment Accounts", desc: "Named cash, bank, UPI, wallet and card accounts used at the till." },
  "payment-methods": { title: "Payment Methods", desc: "Which payment methods the till offers, and their order." },
  "quick-favorites": { title: "Quick Sale Favorites", desc: "Popular service buttons on the Quick Sale counter." },
  catalog: { title: "Catalog Management", desc: "Products, services and categories." },
  "business-setup": { title: "Business Setup", desc: "Banks, settlement portals and merchant QR codes." },
  tax: { title: "Tax & GST", desc: "GST registration shown on receipts." },
  backup: { title: "Backup & Data", desc: "Download your data as CSV." },
  notifications: { title: "Notifications", desc: "Alert channels for low stock and daily summaries." },
  security: { title: "Security", desc: "Password, sign-in attempts and account protection." },
  other: { title: "Other Settings", desc: "Appearance for this browser." },
};

export const THEMES: { key: Theme; label: string; icon: string; hint: string }[] = [
  { key: "light", label: "Light", icon: "M12 3v2m0 14v2M5.6 5.6l1.4 1.4m9.9 9.9 1.4 1.4M3 12h2m14 0h2M5.6 18.4l1.4-1.4m9.9-9.9 1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", hint: "Bright & clean" },
  { key: "dark", label: "Dark", icon: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z", hint: "Easy on the eyes" },
  { key: "system", label: "System", icon: "M12 3a9 9 0 0 0 0 18c.5-2 .5-3.5 0-5a4.5 4.5 0 0 1 0-8c.5-1.5.5-3 0-5ZM3.5 12h17", hint: "Follow your device" },
];

export const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export const labelClass = "mb-1 block text-xs font-semibold text-slate-500";