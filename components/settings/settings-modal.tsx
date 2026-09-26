"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import ShopPanel from "@/components/settings/shop-panel";
import PaymentMethodsPanel from "@/components/settings/payment-methods-panel";
import QuickFavoritesPanel from "@/components/settings/quick-favorites-panel";
import AppearancePanel from "@/components/settings/appearance-panel";
import SecurityPanel from "@/components/settings/security-panel";
import BackupPanel from "@/components/settings/backup-panel";
import NotificationsPanel from "@/components/settings/notifications-panel";

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialCategory?: string;
}

type CardItem = {
  id: string;
  title: string;
  desc: string;
  icon: string;
  theme: string;
  badge?: string;
  panelKey?: string;
  directHref?: string;
};

type CategoryGroup = {
  id: string;
  label: string;
  icon: string;
  groupName: string;
  desc: string;
  cards: CardItem[];
};

const CATEGORIES: CategoryGroup[] = [
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
        directHref: "/business/banks",
      },
      {
        id: "portals-master",
        title: "Service Portals Master",
        desc: "Spice Money, Digipay, Ezeepay portal API connections and floats.",
        icon: "🌐",
        theme: "theme-purple",
        directHref: "/business/portals",
      },
      {
        id: "merchant-qrs",
        title: "Merchant QRs & Soundbox",
        desc: "Counter UPI QR stands, receiver IDs, and soundbox voice alerts.",
        icon: "📱",
        theme: "theme-cyan",
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
        badge: "Operator Slabs",
        directHref: "/settings?tab=business-setup&section=recharge",
      },
      {
        id: "bbps-comm",
        title: "BBPS Bill Commissions",
        desc: "Custom retailer commissions across 10 utility categories.",
        icon: "⚡",
        theme: "theme-indigo",
        badge: "Configurable",
        directHref: "/settings?tab=business-setup&section=bill-payment",
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

export default function SettingsModal({ open, onClose, initialCategory = "business" }: SettingsModalProps) {
  const router = useRouter();
  const supabase = createClient();
  const { showToast, toastView } = useToast();

  const [activeCategory, setActiveCategory] = useState<string>(initialCategory);
  const [activeSubmodule, setActiveSubmodule] = useState<CardItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Store form state for in-popup editing
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

  // Load shop settings when modal opens
  useEffect(() => {
    if (!open) {
      setActiveSubmodule(null);
      setSearchQuery("");
      return;
    }

    async function loadSettings() {
      try {
        const { data } = await supabase.from("settings").select("*").limit(1).maybeSingle();
        if (data) {
          setShopName(data.shop_name || "Cafe ERP");
          setPhone(data.phone || "");
          setAddress(data.address || "");
          setFooter(data.receipt_footer || "");
          setCurrency(data.currency_symbol || "₹");
          setLogoUrl(data.logo_url || null);
          setGstin(data.gstin || "");
          setTaxRate(data.tax_rate != null ? String(Number(data.tax_rate)) : "0");
          setUpiId(data.upi_id || "");
        }
      } catch {
        /* ignore */
      }
    }
    loadSettings();
  }, [open, supabase]);

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

  // Filter cards based on search query
  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    const matches: CardItem[] = [];
    CATEGORIES.forEach((cat) => {
      cat.cards.forEach((card) => {
        if (
          card.title.toLowerCase().includes(q) ||
          card.desc.toLowerCase().includes(q) ||
          cat.label.toLowerCase().includes(q)
        ) {
          matches.push(card);
        }
      });
    });
    return matches;
  }, [searchQuery]);

  const currentCategoryData = useMemo(() => {
    return CATEGORIES.find((c) => c.id === activeCategory) || CATEGORIES[0];
  }, [activeCategory]);

  if (!open) return null;

  return (
    <>
      {toastView}
      {/* Centered Modal Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-md transition-opacity duration-200"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Floating Modal Window - Centered Only, No Side, No Bottom */}
        <div className="relative flex h-[88vh] max-h-[760px] w-[94vw] max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900">
          
          {/* Header */}
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50/70 px-6 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-lg text-white shadow-md shadow-blue-500/20">
                ⚙️
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                  Settings &amp; System Control Center
                </h2>
                <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                  All configuration masters, commissions, accounts &amp; system parameters
                </p>
              </div>
            </div>

            {/* Header Search Box */}
            <div className="relative flex flex-1 max-w-xs items-center mx-4">
              <span className="pointer-events-none absolute left-3 text-slate-400">🔍</span>
              <input
                type="text"
                placeholder="Search settings, masters & slabs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800/80 dark:text-white dark:focus:ring-blue-900/30"
              />
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition"
              aria-label="Close"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>

          {/* Body: Left Categories + Right Main View */}
          <div className="flex flex-1 overflow-hidden">
            
            {/* Left Category Navigation */}
            <div className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
              {["Store Setup", "Catalog & Stock", "Fintech & Slabs", "Accounting & System"].map((grp) => {
                const groupCategories = CATEGORIES.filter((c) => c.groupName === grp);
                return (
                  <div key={grp} className="mb-2">
                    <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      {grp}
                    </div>
                    <div className="space-y-0.5">
                      {groupCategories.map((cat) => {
                        const isSelected = !searchQuery && activeCategory === cat.id && !activeSubmodule;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setSearchQuery("");
                              setActiveCategory(cat.id);
                              setActiveSubmodule(null);
                            }}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                              isSelected
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800/60"
                            }`}
                          >
                            <span className="flex items-center gap-2 truncate">
                              <span>{cat.icon}</span>
                              <span className="truncate">{cat.label}</span>
                            </span>
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
                                isSelected ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                              }`}
                            >
                              {cat.cards.length}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Main Pane: In-Popup Sub-Module OR Cards Grid */}
            <div className="flex flex-1 flex-col overflow-y-auto p-6">
              
              {/* SUBMODULE IN-POPUP VIEW (Opened inside modal) */}
              {activeSubmodule ? (
                <div className="flex flex-col gap-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setActiveSubmodule(null)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      ← Back to Settings
                    </button>

                    <div className="flex items-center gap-2">
                      {activeSubmodule.directHref && (
                        <Link
                          href={activeSubmodule.directHref}
                          onClick={onClose}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Open Full Workspace ↗
                        </Link>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{activeSubmodule.icon}</span>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          {activeSubmodule.title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {activeSubmodule.desc}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Render corresponding panel or quick form */}
                  {activeSubmodule.panelKey === "general" ||
                  activeSubmodule.panelKey === "receipt" ||
                  activeSubmodule.panelKey === "tax" ? (
                    <form onSubmit={handleSaveShopForm} className="space-y-4">
                      <ShopPanel
                        tab={activeSubmodule.panelKey}
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
                          onClick={() => setActiveSubmodule(null)}
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
                  ) : activeSubmodule.panelKey === "payment-methods" ? (
                    <div className="space-y-4">
                      <PaymentMethodsPanel initialPaymentMethods={[]} active={true} />
                    </div>
                  ) : activeSubmodule.panelKey === "quick-favorites" ? (
                    <div className="space-y-4">
                      <QuickFavoritesPanel initialServices={[]} active={true} />
                    </div>
                  ) : activeSubmodule.panelKey === "appearance" ? (
                    <div className="space-y-4">
                      <AppearancePanel active={true} />
                    </div>
                  ) : activeSubmodule.panelKey === "security" ? (
                    <div className="space-y-4">
                      <SecurityPanel active={true} />
                    </div>
                  ) : activeSubmodule.panelKey === "notifications" ? (
                    <div className="space-y-4">
                      <NotificationsPanel active={true} />
                    </div>
                  ) : activeSubmodule.panelKey === "backup" ? (
                    <div className="space-y-4">
                      <BackupPanel active={true} />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                      <span className="text-3xl mb-2">{activeSubmodule.icon}</span>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {activeSubmodule.title}
                      </h4>
                      <p className="max-w-md mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {activeSubmodule.desc}
                      </p>
                      {activeSubmodule.directHref && (
                        <Link
                          href={activeSubmodule.directHref}
                          onClick={onClose}
                          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700"
                        >
                          Launch {activeSubmodule.title} ↗
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* COLOR CARDS GRID VIEW */
                <div className="space-y-4">
                  {/* Category Title Header */}
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {filteredCards ? `Search Results (${filteredCards.length})` : currentCategoryData.label}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {filteredCards ? "Filtered across all setting categories" : currentCategoryData.desc}
                      </p>
                    </div>
                  </div>

                  {/* Cards Grid */}
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                    {(filteredCards || currentCategoryData.cards).map((card) => {
                      return (
                        <div
                          key={card.id}
                          onClick={() => {
                            if (card.panelKey) {
                              setActiveSubmodule(card);
                            } else if (card.directHref) {
                              onClose();
                              router.push(card.directHref);
                            }
                          }}
                          className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md cursor-pointer dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-blue-500"
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-lg transition-transform group-hover:scale-105 dark:bg-slate-800">
                                {card.icon}
                              </div>
                              {card.badge && (
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-blue-700 dark:bg-blue-950/70 dark:text-blue-300">
                                  {card.badge}
                                </span>
                              )}
                            </div>

                            <div>
                              <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400 transition-colors">
                                {card.title}
                              </h4>
                              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                                {card.desc}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 flex items-center gap-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                            <span>{card.panelKey ? "Configure In-Popup" : "Open Master"}</span>
                            <span className="transition-transform group-hover:translate-x-0.5">→</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex h-12 shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50/70 px-6 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
            <div className="flex items-center gap-3">
              <span>Theme Synced: <strong>System</strong></span>
              <span>•</span>
              <span>Fast Shortcut: <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Ctrl + ,</kbd></span>
            </div>
            <div>
              <span>Press <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Esc</kbd> to dismiss</span>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
