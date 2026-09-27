"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useBodyScrollLock } from "@/components/ui/modal";
import { useTheme } from "@/components/theme-provider";
import ShopPanel from "@/components/settings/shop-panel";
import PaymentMethodsPanel from "@/components/settings/payment-methods-panel";
import QuickFavoritesPanel from "@/components/settings/quick-favorites-panel";
import AppearancePanel from "@/components/settings/appearance-panel";
import SecurityPanel from "@/components/settings/security-panel";
import BackupPanel from "@/components/settings/backup-panel";
import NotificationsPanel from "@/components/settings/notifications-panel";
import PaymentAccountsPanel from "@/components/settings/payment-accounts-panel";
import DefaultRoutingClient from "@/components/settings/default-routing-client";
import MasterClient from "@/components/business/master-client";
import RechargeProvidersPanel from "@/components/settings/recharge-providers-panel";
import { SERVICE_CATEGORIES } from "@/components/business/commission-edit-modal";
import { BillCommissionConfig, CommissionType } from "@/lib/bill-payment/commission";

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialCategory?: string;
  initialCardId?: string;
}

export type CardItem = {
  id: string;
  title: string;
  desc: string;
  icon: string;
  theme: string;
  badge?: string;
  panelKey?: string;
  directHref?: string;
};

export type CategoryGroup = {
  id: string;
  label: string;
  icon: string;
  groupName: string;
  desc: string;
  cards: CardItem[];
};

export const CATEGORIES: CategoryGroup[] = [
  {
    id: "business",
    label: "Business & Legal",
    icon: "🏢",
    groupName: "Store Setup",
    desc: "Store profile, official branding, tax registration, and receipt printer layouts",
    cards: [
      {
        id: "general",
        title: "Store Profile & Identity",
        desc: "Shop name, phone, address, official logo, and primary currency.",
        icon: "🏢",
        theme: "theme-blue",
        panelKey: "general",
      },
      {
        id: "receipt",
        title: "Invoice & Receipt Layout",
        desc: "A4 Tax Invoice, 80mm thermal roll, dynamic UPI QR code, and footer notes.",
        icon: "🧾",
        theme: "theme-cyan",
        panelKey: "receipt",
      },
      {
        id: "tax",
        title: "Tax & GST Configuration",
        desc: "GSTIN registration, default billing tax rates, and HSN settings.",
        icon: "📜",
        theme: "theme-indigo",
        badge: "GSTIN",
        panelKey: "tax",
      },
    ],
  },
  {
    id: "pos",
    label: "POS & Billing",
    icon: "🛒",
    groupName: "Store Setup",
    desc: "Speed-billing hotkeys, counter payment methods, and hardware checkout options",
    cards: [
      {
        id: "quick-favorites",
        title: "POS Counter Favorites",
        desc: "1-click quick-service buttons for instant counter billing.",
        icon: "⭐",
        theme: "theme-amber",
        badge: "F2 Fast",
        panelKey: "quick-favorites",
      },
      {
        id: "payment-methods",
        title: "Payment Methods Master",
        desc: "Enable / disable Cash, Card, UPI, and Wallet checkout options.",
        icon: "💳",
        theme: "theme-emerald",
        panelKey: "payment-methods",
      },
      {
        id: "counter-rules",
        title: "Counter Screen Defaults",
        desc: "Auto-print after checkout, change calculator, barcode scan rules.",
        icon: "🖥️",
        theme: "theme-blue",
        directHref: "/pos",
      },
    ],
  },
  {
    id: "catalog",
    label: "Catalog Masters",
    icon: "📦",
    groupName: "Catalog & Stock",
    desc: "Complete master directory for products, billable services, categories, and units",
    cards: [
      {
        id: "products-master",
        title: "Products Master",
        desc: "Barcodes, cost & selling prices, GST tax slabs, and stock alerts.",
        icon: "📦",
        theme: "theme-purple",
        directHref: "/catalog/products",
      },
      {
        id: "services-master",
        title: "Services Rate Card",
        desc: "Cybercafe printing, xerox, lamination, and digital seva charges.",
        icon: "🖨️",
        theme: "theme-purple",
        directHref: "/catalog/services",
      },
      {
        id: "categories-brands",
        title: "Categories & Brands",
        desc: "Organize products into hierarchical departments and brand lines.",
        icon: "🗂️",
        theme: "theme-indigo",
        directHref: "/catalog/categories",
      },
      {
        id: "uom-master",
        title: "Units of Measure (UOM)",
        desc: "Define measurement units: Pcs, Box, Kg, Pages, Sets.",
        icon: "⚖️",
        theme: "theme-cyan",
        directHref: "/catalog/units",
      },
    ],
  },
  {
    id: "inventory",
    label: "Inventory & AP",
    icon: "🏭",
    groupName: "Catalog & Stock",
    desc: "Stock valuation rules, purchase inward entries, and vendor directory",
    cards: [
      {
        id: "stock-wac",
        title: "Stock Valuation & WAC",
        desc: "Weighted average costing, low stock reorder thresholds, adjustments.",
        icon: "📊",
        theme: "theme-emerald",
        badge: "WAC Cost",
        directHref: "/inventory",
      },
      {
        id: "purchase-inward",
        title: "Purchase Inward Entry",
        desc: "Dedicated high-speed supplier invoice intake and stock updating.",
        icon: "📥",
        theme: "theme-blue",
        directHref: "/purchases/entry",
      },
      {
        id: "suppliers-master",
        title: "Suppliers & Accounts Payable",
        desc: "Vendor profiles, procurement credit ledger, and payment tracking.",
        icon: "👥",
        theme: "theme-indigo",
        directHref: "/suppliers",
      },
    ],
  },
  {
    id: "portals",
    label: "AEPS & Portals",
    icon: "🏦",
    groupName: "Fintech & Slabs",
    desc: "Commercial bank connections, B2B settlement portals, and merchant soundbox QR codes",
    cards: [
      {
        id: "aeps-banks",
        title: "AEPS Banks Master",
        desc: "Commercial bank registry used for biometric Aadhaar cash disbursement.",
        icon: "🏦",
        theme: "theme-purple",
        badge: "In-Popup CRUD",
        panelKey: "aeps-banks",
        directHref: "/business/banks",
      },
      {
        id: "portals-master",
        title: "Service Portals Master",
        desc: "Spice Money, Digipay, Ezeepay portal API connections and floats.",
        icon: "🌐",
        theme: "theme-purple",
        badge: "In-Popup CRUD",
        panelKey: "portals-master",
        directHref: "/business/portals",
      },
      {
        id: "merchant-qrs",
        title: "Merchant QRs & Soundbox",
        desc: "Counter UPI QR stands, receiver IDs, and soundbox voice alerts.",
        icon: "📱",
        theme: "theme-cyan",
        badge: "In-Popup CRUD",
        panelKey: "merchant-qrs",
        directHref: "/business/merchant-qrs",
      },
    ],
  },
  {
    id: "recharge",
    label: "Recharge & BBPS",
    icon: "⚡",
    groupName: "Fintech & Slabs",
    desc: "Prepaid operator commission slabs, utility convenience fees, and digital plans",
    cards: [
      {
        id: "recharge-slabs",
        title: "Prepaid Recharge Slabs",
        desc: "Jio, Airtel, Vi operator commissions and retailer margin slabs.",
        icon: "📶",
        theme: "theme-amber",
        badge: "Slab Editor",
        panelKey: "recharge-slabs",
        directHref: "/business/bill-payment?tab=commission",
      },
      {
        id: "bbps-comm",
        title: "BBPS Bill Commissions",
        desc: "Custom retailer commissions across 10 utility categories.",
        icon: "⚡",
        theme: "theme-indigo",
        badge: "Commission Matrix",
        panelKey: "bbps-comm",
        directHref: "/business/bill-payment?tab=commission",
      },
      {
        id: "recharge-plans",
        title: "Recharge Plan Catalog",
        desc: "Manage live validity packs, TalkTime, and 5G data tariffs.",
        icon: "📋",
        theme: "theme-amber",
        directHref: "/business/bill-payment/mobile-recharge/plans",
      },
      {
        id: "google-play",
        title: "Google Play Margin Rules",
        desc: "Retailer discount margins and customer fees for code vouchers.",
        icon: "🎮",
        theme: "theme-rose",
        directHref: "/business/bill-payment/google-play",
      },
    ],
  },
  {
    id: "finance",
    label: "Finance Defaults",
    icon: "💼",
    groupName: "Accounting & System",
    desc: "7-pool liquidity accounts, financial year opening equity, and auto-journal rules",
    cards: [
      {
        id: "payment-accounts",
        title: "Payment Accounts (7 Pools)",
        desc: "Cash drawer, bank accounts, UPI IDs, and portal float ledgers.",
        icon: "💼",
        theme: "theme-cyan",
        badge: "Live Float",
        panelKey: "payment-accounts",
        directHref: "/finance/accounts",
      },
      {
        id: "opening-equity",
        title: "Opening Balances Studio",
        desc: "Seed opening liquid cash, portal balances, and owner capital equity.",
        icon: "🌱",
        theme: "theme-purple",
        badge: "Equity",
        directHref: "/finance/opening-balances",
      },
      {
        id: "settlement-rules",
        title: "Settlement & Float Rules",
        desc: "Bank-to-portal top-up rules and cash withdrawal reconciliation.",
        icon: "🔄",
        theme: "theme-blue",
        directHref: "/finance/settlements",
      },
      {
        id: "accounting-defaults",
        title: "Accounting & Routing Defaults",
        desc: "Default clearing accounts, rounding modes, and auto-journal triggers.",
        icon: "⚙️",
        theme: "theme-emerald",
        badge: "Zero-Delta",
        panelKey: "accounting-defaults",
        directHref: "/settings/defaults",
      },
    ],
  },
  {
    id: "security",
    label: "Security & Staff",
    icon: "🛡️",
    groupName: "Accounting & System",
    desc: "Role-based access permissions, master passwords, 2FA, and tamper-proof audit trails",
    cards: [
      {
        id: "staff-rbac",
        title: "Staff & Role Permissions (RBAC)",
        desc: "Operator credentials, drawer limits, and feature permissions.",
        icon: "👥",
        theme: "theme-rose",
        badge: "RBAC",
        directHref: "/staff",
      },
      {
        id: "security-2fa",
        title: "Security Center & 2FA",
        desc: "Master password, 2FA, active sessions, and screen lock timeout.",
        icon: "🔒",
        theme: "theme-rose",
        panelKey: "security",
      },
      {
        id: "audit-logs",
        title: "System Audit Logs",
        desc: "Immutable timeline of all edits, cancellations, and financial events.",
        icon: "📜",
        theme: "theme-amber",
        directHref: "/audit",
      },
    ],
  },
  {
    id: "automations",
    label: "Automations & AI",
    icon: "🤖",
    groupName: "Accounting & System",
    desc: "WhatsApp background gateway, automated invariant self-audit, and snapshots",
    cards: [
      {
        id: "whatsapp-gw",
        title: "WhatsApp Gateway & Cloud API",
        desc: "Meta Cloud API keys, message templates, and automated bill dispatch.",
        icon: "💬",
        theme: "theme-emerald",
        badge: "Auto Dispatch",
        panelKey: "notifications",
      },
      {
        id: "appearance",
        title: "Theme & Display Preferences",
        desc: "System, Dark & Light display modes with UI density and gradient presets.",
        icon: "🎨",
        theme: "theme-purple",
        badge: "Personalize",
        panelKey: "appearance",
      },
      {
        id: "self-audit",
        title: "Financial Self-Audit",
        desc: "Automated 14-point invariant ledger verification and leak checks.",
        icon: "🛡️",
        theme: "theme-indigo",
        badge: "14 Checks",
        directHref: "/ai/self-audit",
      },
      {
        id: "backup-export",
        title: "Backup & Data Export",
        desc: "Download full database snapshots, accounting CSVs, and SQL dumps.",
        icon: "💾",
        theme: "theme-amber",
        panelKey: "backup",
      },
    ],
  },
];

export default function SettingsModal({ open, onClose, initialCategory = "business", initialCardId }: SettingsModalProps) {
  const router = useRouter();
  const supabase = createClient();
  const { showToast, toastView } = useToast();
  const { displayMode } = useTheme();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useBodyScrollLock(open && mounted);

  const [activeSubmodule, setActiveSubmodule] = useState<CardItem | null>(null);

  const targetCard = useMemo(() => {
    if (activeSubmodule) return activeSubmodule;
    if (initialCardId) {
      for (const cat of CATEGORIES) {
        const found = cat.cards.find((c) => c.id === initialCardId);
        if (found) return found;
      }
    }
    return CATEGORIES[0].cards[0];
  }, [activeSubmodule, initialCardId]);

  // Handle initialCardId
  useEffect(() => {
    if (open && initialCardId) {
      for (const cat of CATEGORIES) {
        const found = cat.cards.find((c) => c.id === initialCardId);
        if (found) {
          setActiveSubmodule(found);
          break;
        }
      }
    } else if (!open) {
      setActiveSubmodule(null);
    }
  }, [open, initialCardId]);

  // Shop form state
  const [shopName, setShopName] = useState("Cafe ERP");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [footer, setFooter] = useState("");
  const [currency, setCurrency] = useState("₹");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [gstin, setGstin] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [upiId, setUpiId] = useState("");
  const [saving, setSaving] = useState(false);

  // Dynamic deep-panel datasets
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [instruments, setInstruments] = useState<any[]>([]);
  const [bankRows, setBankRows] = useState<any[]>([]);
  const [portalRows, setPortalRows] = useState<any[]>([]);
  const [merchantQrRows, setMerchantQrRows] = useState<any[]>([]);
  const [rechargeProviders, setRechargeProviders] = useState<any[]>([]);
  const [rechargeSlabs, setRechargeSlabs] = useState<any[]>([]);
  const [bbpsConfigs, setBbpsConfigs] = useState<Record<string, { type: CommissionType; val: string }>>({});
  const [bbpsSaving, setBbpsSaving] = useState(false);

  // Load shop settings and shared data when modal opens
  useEffect(() => {
    if (!open) {
      setActiveSubmodule(null);
      return;
    }

    async function loadInitial() {
      try {
        const { data: sData } = await supabase.from("settings").select("*").limit(1).maybeSingle();
        if (sData) {
          setShopName(sData.shop_name || "Cafe ERP");
          setPhone(sData.phone || "");
          setAddress(sData.address || "");
          setFooter(sData.receipt_footer || "");
          setCurrency(sData.currency_symbol || "₹");
          setLogoUrl(sData.logo_url || null);
          setGstin(sData.gstin || "");
          setTaxRate(sData.tax_rate != null ? String(Number(sData.tax_rate)) : "0");
          setUpiId(sData.upi_id || "");
        }
      } catch {
        /* ignore */
      }
    }
    loadInitial();
  }, [open, supabase]);

  // Load specific datasets when targetCard panel is selected
  useEffect(() => {
    if (!open || !targetCard) return;

    const key = targetCard.panelKey || targetCard.id;

    if (key === "payment-methods" && paymentMethods.length === 0) {
      supabase.from("payment_methods").select("*").order("sort_order").then(({ data }) => {
        if (data) setPaymentMethods(data);
      });
    } else if (key === "quick-favorites" && services.length === 0) {
      supabase.from("services").select("*").eq("is_active", true).order("name").then(({ data }) => {
        if (data) setServices(data);
      });
    } else if (key === "payment-accounts" && instruments.length === 0) {
      supabase.from("payment_instruments").select("*").order("name").then(({ data }) => {
        if (data) setInstruments(data);
      });
    } else if (key === "aeps-banks") {
      supabase.from("aeps_banks").select("*").order("name").then(({ data }) => {
        if (data) setBankRows(data);
      });
    } else if (key === "portals-master") {
      supabase.from("service_portals").select("*").order("name").then(({ data }) => {
        if (data) setPortalRows(data);
      });
    } else if (key === "merchant-qrs") {
      supabase.from("merchant_qrs").select("*").order("name").then(({ data }) => {
        if (data) setMerchantQrRows(data);
      });
    } else if (key === "recharge-slabs") {
      Promise.all([
        supabase.from("recharge_providers").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("recharge_commission_slabs").select("*").order("provider_id").order("min_amount"),
      ]).then(([{ data: pData }, { data: sData }]) => {
        if (pData) setRechargeProviders(pData);
        if (sData) setRechargeSlabs(sData);
      });
    } else if (key === "bbps-comm") {
      supabase.from("bill_payment_commission_config").select("*").then(({ data }) => {
        const map: Record<string, { type: CommissionType; val: string }> = {};
        SERVICE_CATEGORIES.forEach((cat) => {
          map[cat.id] = { type: "flat", val: "5.00" };
        });
        if (data) {
          data.forEach((row: any) => {
            const cid = row.category_id || (row.service_type === "google_play_recharge" ? "google_play" : null);
            if (cid) {
              map[cid] = {
                type: row.commission_type || "flat",
                val: String(row.commission_value || "5.00"),
              };
            }
          });
        }
        setBbpsConfigs(map);
      });
    }
  }, [open, targetCard, paymentMethods.length, services.length, instruments.length, supabase]);

  // Handle escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") {
        if (activeSubmodule) {
          setActiveSubmodule(null);
        } else {
          onClose();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, activeSubmodule, onClose]);

  // Save shop form
  async function handleSaveShopForm(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      localStorage.setItem("sccomm-shop-upi-id", upiId.trim());
    } catch {}

    const payload: any = {
      id: 1,
      shop_name: shopName.trim() || "Cafe ERP",
      phone,
      address,
      receipt_footer: footer,
      currency_symbol: currency,
      logo_url: logoUrl,
      gstin: gstin.trim() || null,
      tax_rate: Number(taxRate) || 0,
      upi_id: upiId.trim() || null,
    };

    let { error } = await supabase.from("settings").upsert(payload).single();
    if (error && error.message?.includes("upi_id")) {
      delete payload.upi_id;
      const res = await supabase.from("settings").upsert(payload).single();
      error = res.error;
    }

    setSaving(false);
    if (error) {
      showToast("error", error.message);
    } else {
      showToast("success", "Settings saved successfully.");
      setActiveSubmodule(null);
      router.refresh();
    }
  }

  // Save BBPS Category Commission
  async function handleSaveBbpsCommission(catId: string, serviceType: string) {
    const config = bbpsConfigs[catId];
    if (!config) return;
    setBbpsSaving(true);

    const payload = {
      category_id: catId === "google_play" ? null : catId,
      service_type: serviceType,
      commission_type: config.type,
      commission_value: Number(config.val) || 0,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("bill_payment_commission_config").upsert(payload, {
      onConflict: catId === "google_play" ? "service_type" : "category_id",
    });

    setBbpsSaving(false);
    if (error) {
      showToast("error", error.message || "Failed to save commission.");
    } else {
      showToast("success", `Updated commission for ${catId}.`);
    }
  }

  if (!open || !mounted) return null;

  const modalNode = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/75 backdrop-blur-md transition-opacity duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {toastView}
      {/* Focused Card Popup Modal - Zero Sidebar */}
      <div
        className="relative flex h-auto max-h-[92dvh] w-full max-w-3xl sm:max-w-4xl flex-col overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-6 sm:py-4 shrink-0 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex items-center gap-3 min-w-0">
            {targetCard.id === "appearance" ? (
              <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-500 text-white shadow-md shadow-violet-500/25">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4 4 4 0 014-4c.7 0 1.37.18 1.95.49a5.98 5.98 0 018.1-8.1A6 6 0 1119 16c0 .41-.04.82-.12 1.22A4 4 0 0115 21H7z" />
                  <circle cx="12" cy="7" r="1.5" fill="#f59e0b" />
                  <circle cx="8" cy="11" r="1.5" fill="#06b6d4" />
                  <circle cx="15" cy="12" r="1.5" fill="#ec4899" />
                </svg>
              </div>
            ) : (
              <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-200/80 text-xl shadow-2xs dark:bg-indigo-950/40 dark:border-indigo-800">
                <span>{targetCard.icon}</span>
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-white truncate">
                  {targetCard.title}
                </h2>
                {targetCard.badge && (
                  <span className="hidden sm:inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-blue-700 dark:bg-blue-950/70 dark:text-blue-300">
                    {targetCard.badge}
                  </span>
                )}
              </div>
              <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                {targetCard.desc}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-3">
            {targetCard.directHref && (
              <Link
                href={targetCard.directHref}
                onClick={onClose}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-slate-50 transition dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400"
              >
                <span>Standalone Workspace</span>
                <span>↗</span>
              </Link>
            )}

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition"
              aria-label="Close"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body: 100% Full Width (Zero Sidebar) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          {/* 1. STORE PROFILE, INVOICE & TAX FORMS */}
          {targetCard.panelKey === "general" ||
          targetCard.panelKey === "receipt" ||
          targetCard.panelKey === "tax" ? (
            <form onSubmit={handleSaveShopForm} className="space-y-4">
              <ShopPanel
                tab={targetCard.panelKey}
                form={{
                  shopName,
                  setShopName,
                  phone,
                  setPhone,
                  address,
                  setAddress,
                  footer,
                  setFooter,
                  currency,
                  setCurrency,
                  gstin,
                  setGstin,
                  taxRate,
                  setTaxRate,
                  logoUrl,
                  setLogoUrl,
                  upiId,
                  setUpiId,
                }}
              />
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
                  ) : targetCard.panelKey === "payment-methods" ? (
                    /* 2. PAYMENT METHODS MASTER */
                    <div className="space-y-4">
                      <PaymentMethodsPanel initialPaymentMethods={paymentMethods} active={true} />
                    </div>
                  ) : targetCard.panelKey === "quick-favorites" ? (
                    /* 3. POS COUNTER FAVORITES */
                    <div className="space-y-4">
                      <QuickFavoritesPanel initialServices={services} active={true} />
                    </div>
                  ) : targetCard.panelKey === "payment-accounts" ? (
                    /* 4. PAYMENT ACCOUNTS & LIQUIDITY POOLS */
                    <div className="space-y-4">
                      <PaymentAccountsPanel initialInstruments={instruments} active={true} />
                    </div>
                  ) : targetCard.panelKey === "accounting-defaults" ? (
                    /* 5. ACCOUNTING DEFAULTS & ROUTING */
                    <div className="space-y-4">
                      <DefaultRoutingClient />
                    </div>
                  ) : targetCard.panelKey === "aeps-banks" ? (
                    /* 6. AEPS BANKS MASTER */
                    <div className="space-y-4">
                      <MasterClient
                        title="AEPS Banks Master"
                        desc="Commercial bank registry used for biometric Aadhaar cash disbursement."
                        table="aeps_banks"
                        fields={[
                          { key: "name", label: "Bank Name", required: true, placeholder: "State Bank of India" },
                          { key: "code", label: "Bank Code / Shortname", placeholder: "SBI" },
                        ]}
                        rows={bankRows}
                        embedded={true}
                      />
                    </div>
                  ) : targetCard.panelKey === "portals-master" ? (
                    /* 7. SERVICE PORTALS MASTER */
                    <div className="space-y-4">
                      <MasterClient
                        title="Service Portals Master"
                        desc="B2B settlement portals and external gateway float connections."
                        table="service_portals"
                        fields={[
                          { key: "name", label: "Portal Name", required: true, placeholder: "Spice Money / Digipay" },
                          { key: "code", label: "Portal Identifier Key", placeholder: "spicemoney" },
                        ]}
                        rows={portalRows}
                        embedded={true}
                      />
                    </div>
                  ) : targetCard.panelKey === "merchant-qrs" ? (
                    /* 8. MERCHANT QRS & SOUNDBOX */
                    <div className="space-y-4">
                      <MasterClient
                        title="Merchant QRs & Soundbox"
                        desc="Counter UPI QR stands, receiver IDs, and soundbox voice alerts."
                        table="merchant_qrs"
                        fields={[
                          { key: "name", label: "Account / Stand Name", required: true, placeholder: "Counter Stand 01" },
                          { key: "upi_id", label: "Merchant UPI ID", required: true, placeholder: "merchant@bankupi" },
                        ]}
                        rows={merchantQrRows}
                        embedded={true}
                      />
                    </div>
                  ) : targetCard.panelKey === "recharge-slabs" ? (
                    /* 9. RECHARGE SLABS & OPERATOR COMMISSIONS */
                    <div className="space-y-4">
                      <RechargeProvidersPanel
                        initialProviders={rechargeProviders}
                        initialSlabs={rechargeSlabs}
                      />
                    </div>
                  ) : targetCard.panelKey === "bbps-comm" ? (
                    /* 10. BBPS COMMISSIONS MATRIX */
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-4">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                            BBPS Utility Categories Commission Matrix
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Configure your retailer commission or convenience fee per biller category.
                          </p>
                        </div>

                        <div className="space-y-2.5">
                          {SERVICE_CATEGORIES.map((cat) => {
                            const cfg = bbpsConfigs[cat.id] || { type: "flat", val: "5.00" };
                            return (
                              <div
                                key={cat.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                                    {cat.name}
                                  </div>
                                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                                    {cat.serviceType}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <select
                                    value={cfg.type}
                                    onChange={(e) => {
                                      const nextType = e.target.value as CommissionType;
                                      setBbpsConfigs((prev) => ({
                                        ...prev,
                                        [cat.id]: { ...cfg, type: nextType },
                                      }));
                                    }}
                                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 outline-none"
                                  >
                                    <option value="flat">Flat (₹)</option>
                                    <option value="percent">Percent (%)</option>
                                  </select>

                                  <input
                                    type="number"
                                    step="0.01"
                                    value={cfg.val}
                                    onChange={(e) => {
                                      const nextVal = e.target.value;
                                      setBbpsConfigs((prev) => ({
                                        ...prev,
                                        [cat.id]: { ...cfg, val: nextVal },
                                      }));
                                    }}
                                    className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white outline-none"
                                    placeholder="5.00"
                                  />

                                  <button
                                    type="button"
                                    disabled={bbpsSaving}
                                    onClick={() => handleSaveBbpsCommission(cat.id, cat.serviceType)}
                                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : targetCard.panelKey === "appearance" ? (
                    /* 11. THEME & DISPLAY PREFERENCES */
                    <div className="space-y-4">
                      <AppearancePanel active={true} />
                    </div>
                  ) : targetCard.panelKey === "security" ? (
                    /* 12. SECURITY & 2FA */
                    <div className="space-y-4">
                      <SecurityPanel active={true} />
                    </div>
                  ) : targetCard.panelKey === "notifications" ? (
                    /* 13. WHATSAPP GATEWAY */
                    <div className="space-y-4">
                      <NotificationsPanel active={true} />
                    </div>
                  ) : targetCard.panelKey === "backup" ? (
                    /* 14. DATA BACKUP & SQL EXPORT */
                    <div className="space-y-4">
                      <BackupPanel active={true} />
                    </div>
                  ) : (
                    /* Fallback for deep table workspaces */
                    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                      <span className="text-3xl mb-2">{targetCard.icon}</span>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {targetCard.title}
                      </h4>
                      <p className="max-w-md mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {targetCard.desc}
                      </p>
                      {targetCard.directHref && (
                        <Link
                          href={targetCard.directHref}
                          onClick={onClose}
                          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700"
                        >
                          Launch {targetCard.title} ↗
                        </Link>
                      )}
                    </div>
                  )}
        </div>

        {/* Modal Footer (Responsive: theme status, Esc hint & Done button) */}
        <div className="flex h-12 shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50/80 px-4 sm:px-6 text-[11px] sm:text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
          <div className="flex items-center gap-2 sm:gap-3">
            <span>Theme: <strong className="capitalize">{displayMode}</strong></span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">Settings Hub Active</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-slate-400">
              Press <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Esc</kbd> to close
            </span>
            <button
              type="button"
              onClick={onClose}
              className="font-bold text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Done ✕
            </button>
          </div>
        </div>

      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
}
