"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AvatarModal from "./profile/avatar-modal";

export type BadgeTone = "emerald" | "amber" | "indigo" | "purple" | "rose" | "slate" | "blue";
export type NavChild = {
  label: string;
  href: string;
  icon?: string;
  badge?: { text: string; tone: BadgeTone };
};
export type NavItem = {
  label: string;
  href: string;
  icon: string;
  badge?: { text: string; tone: BadgeTone };
  isSubHeader?: boolean;
  children?: NavChild[];
};
export type NavSection = { title: string; items: NavItem[] };

const BADGE_STYLES: Record<BadgeTone, string> = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30",
  amber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30",
  purple: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30",
  rose: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30",
  blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30",
  slate: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/30",
};

const ICONS: Record<string, string> = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  pos: "M6 6h15l-1.5 8h-13L4 3H2M9 20a1 1 0 1 0 0 .01M20 20a1 1 0 1 0 0 .01",
  invoices: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  returns: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  customers: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  dues: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 12v-2m0 0c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  aeps: "M4 10h16M4 14h16M6 18V7m4 11V7m4 11V7M2 7l10-5 10 5z",
  dmt: "M22 2 11 13M22 2 15 22l-4-9-9-4z",
  upi: "M12 18h.01M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z",
  recharge: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  billPayment: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z",
  utility: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  banks: "M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v4M12 14v4M16 14v4",
  qrs: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14h1M14 20h1M20 20h1",
  portals: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z",
  transactions: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-3 7h4m-4 4h4m-6-4h.01M9 16h.01",
  products: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9",
  services: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  categories: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  inventory: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  purchases: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-8 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  suppliers: "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm11 10v-6a2 2 0 0 0-2-2h-1m3 8h-4",
  brands: "M7 7h.01M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
  opening: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  cashbook: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  expenses: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z",
  ledger: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  settlements: "M3 7l7-4 7 4 4-2v13l-4 2-7-4-7 4V7zM10 3v13m7-11v13",
  pnl: "M3 3v18h18M7 14l4-4 3 3 5-6",
  dayclose: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M12 12v5M9.5 14.5 12 12l2.5 2.5",
  reports: "M18 20V10M12 20V4M6 20v-6",
  salesreport: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  gst: "M9 14l6-6m-6 0h.01M15 14h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  tax: "M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z",
  ai: "M12 2a2 2 0 0 1 2 2v1a1 1 0 0 0 1 1h1a2 2 0 0 1 2 2v1a1 1 0 0 0 1 1h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1a1 1 0 0 0-1 1v1a2 2 0 0 1-2 2h-1a1 1 0 0 0-1 1v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1a1 1 0 0 0-1-1h-1a2 2 0 0 1-2-2v-1a1 1 0 0 1-1-1H3a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1a1 1 0 0 0 1-1V9a2 2 0 0 1 2-2h1a1 1 0 0 0 1-1V4a2 2 0 0 1 2-2h2zM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z",
  audit: "M12 8v4m0 4h.01M12 3l9 5v8l-9 5-9-5V8l9-5ZM6.5 8.5 12 6l5.5 2.5M12 6v12",
  staff: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  security: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83-2.83l-.06.06a1.65 1.65 0 0 1-1.51 1H21a2 2 0 1 1 0 4h-.09a2 2 0 0 1-1.51 1z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  chevron: "m9 18 6-6-6-6",
};

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

export default function Sidebar({
  name,
  email,
  role,
  shopName,
  logoUrl,
  avatarUrl,
  userId,
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  name: string;
  email: string;
  role: string;
  shopName: string;
  logoUrl: string | null;
  avatarUrl: string | null;
  userId: string;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(avatarUrl);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleSignOut(e?: React.MouseEvent) {
    if (e) e.preventDefault();
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    }
    window.location.href = "/logout";
  }

  // Expanded groups by default
  const [openSections, setOpenSections] = useState<Set<string>>(
    () =>
      new Set([
        "Operate",
        "1. Sales Hub",
        "2. Operations Hub",
        "3. Business Services",
        "4. Finance Hub",
        "5. Reports Hub",
        "6. Tools & AI",
        "7. Administration",
      ])
  );

  const [openSubItems, setOpenSubItems] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (pathname?.startsWith("/business/bill-payment") || pathname?.startsWith("/business/recharge")) {
      s.add("Bill & Recharge");
    }
    if (pathname?.startsWith("/catalog")) {
      s.add("Catalog Workspace");
    }
    return s;
  });

  function toggleSubItem(label: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpenSubItems((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const sections: NavSection[] = useMemo(
    () => [
      {
        title: "Operate",
        items: [
          { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
        ],
      },
      {
        title: "1. Sales Hub",
        items: [
          { label: "POS Billing", href: "/pos", icon: "pos", badge: { text: "F2 Fast", tone: "emerald" } },
          { label: "Sales & Invoices", href: "/invoices", icon: "invoices" },
          { label: "Customers & Khata", href: "/customers", icon: "customers" },
          { label: "Returns & Credit", href: "/returns", icon: "returns" },
        ],
      },
      {
        title: "2. Operations Hub",
        items: [
          {
            label: "Catalog Workspace",
            href: "/catalog/products",
            icon: "products",
            children: [
              { label: "Products", href: "/catalog/products" },
              { label: "Services", href: "/catalog/services" },
              { label: "Categories", href: "/catalog/categories" },
              { label: "Brands", href: "/catalog/brands" },
              { label: "Units", href: "/catalog/units" },
            ],
          },
          { label: "Inventory & Stock", href: "/inventory", icon: "inventory" },
          { label: "Purchases Entry", href: "/purchases/entry", icon: "purchases", badge: { text: "WAC", tone: "blue" } },
          { label: "Suppliers", href: "/suppliers", icon: "suppliers" },
        ],
      },
      {
        title: "3. Business Services",
        items: [
          { label: "Bill Payment", href: "/business/bill-payment", icon: "billPayment", badge: { text: "BBPS", tone: "indigo" } },
          { label: "AEPS Cash Out", href: "/business/aeps", icon: "aeps" },
          { label: "Money Transfer (DMT)", href: "/business/dmt", icon: "dmt" },
          { label: "UPI Collections", href: "/business/upi", icon: "upi" },
        ],
      },
      {
        title: "4. Finance Hub",
        items: [
          { label: "Finance Hub", href: "/finance", icon: "pnl", badge: { text: "Dashboard", tone: "emerald" } },
          { label: "Daily Cash Book", href: "/finance/cashbook", icon: "cashbook" },
          { label: "Double-Entry Journal", href: "/finance/journal", icon: "ledger" },
          { label: "Trial Balance", href: "/finance/trial-balance", icon: "transactions" },
          { label: "Settlements & Float", href: "/finance/settlements", icon: "settlements" },
          { label: "Expenses Ledger", href: "/finance/expenses", icon: "expenses" },
          { label: "Profit & Loss (P&L)", href: "/finance/pnl", icon: "salesreport" },
          { label: "Reconciliation", href: "/finance/reconciliation", icon: "dayclose" },
          { label: "Opening Balances", href: "/finance/opening-balances", icon: "opening" },
          { label: "Day Close & Rollover", href: "/finance/day-close", icon: "dayclose" },
        ],
      },
      {
        title: "5. Reports Hub",
        items: [
          { label: "Reports Studio", href: "/reports", icon: "reports" },
          { label: "GST Reports", href: "/reports/gst", icon: "gst" },
          { label: "Tax Prep / ITR", href: "/reports/tax-preparation", icon: "tax" },
          { label: "Security Audit Log", href: "/audit", icon: "audit" },
        ],
      },
      {
        title: "6. Tools & AI",
        items: [
          { label: "AI Control Center", href: "/ai", icon: "ai", badge: { text: "Smart", tone: "purple" } },
          { label: "Financial Self-Audit", href: "/ai/self-audit", icon: "audit", badge: { text: "14-pt", tone: "emerald" } },
        ],
      },
      {
        title: "7. Administration",
        items: [
          { label: "Staff Accounts", href: "/staff", icon: "staff" },
          { label: "Security & 2FA", href: "/security", icon: "security" },
          { label: "System Settings", href: "/settings", icon: "settings" },
        ],
      },
    ],
    []
  );

  function toggleSection(title: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  const filteredSections = useMemo(() => {
    if (!query.trim()) return sections;
    const q = query.toLowerCase();
    return sections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.href.toLowerCase().includes(q) ||
            item.children?.some((c) => c.label.toLowerCase().includes(q) || c.href.toLowerCase().includes(q))
        ),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [sections, query]);

  function isItemActive(itemHref: string) {
    if (itemHref === "#") return false;
    if (itemHref === "/dashboard") return pathname === "/dashboard";

    const [itemPath, itemQuery] = itemHref.split("?");
    if (itemQuery) {
      const tabParam = new URLSearchParams(itemQuery).get("tab");
      return pathname === itemPath && searchParams?.get("tab") === tabParam;
    }

    if (pathname === itemPath) {
      if (!searchParams?.get("tab")) return true;
      if (itemPath === "/reports" && !searchParams?.get("tab")) return true;
      return true;
    }

    return pathname?.startsWith(itemPath) && itemPath !== "/dashboard";
  }

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition-opacity lg:hidden"
        />
      )}

      {/* Main Sidebar Element */}
      <aside
        className={`fixed inset-y-0 left-0 lg:top-3 lg:bottom-3 lg:left-3 lg:h-[calc(100vh-24px)] lg:rounded-[24px] z-50 flex flex-col transition-all duration-300 shadow-xl border border-slate-200/90 bg-white/95 text-slate-800 dark:border-white/10 dark:bg-slate-900/95 dark:text-slate-100 backdrop-blur-xl ${
          collapsed ? "w-[72px]" : "w-[270px]"
        } ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* 1. Brand Header with Dynamic Collapse / Expand Button */}
        {collapsed ? (
          <div className="flex h-16 shrink-0 flex-col items-center justify-center border-b border-slate-200/80 dark:border-white/10 px-2 py-2">
            <button
              type="button"
              onClick={onToggle}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 border border-blue-200/90 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-500/30 hover:bg-blue-100 dark:hover:bg-blue-900/60 hover:scale-105 shadow-md shadow-blue-500/10 transition z-50 cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5">
                <path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 dark:border-white/10 px-4">
            <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-white/20">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="h-6 w-6 object-contain" />
                ) : (
                  <span className="text-lg font-black">☕</span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-black tracking-tight text-slate-900 dark:text-white">
                    {shopName || "Cafe ERP"}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <span className="block truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Daily Counter Operations
                </span>
              </div>
            </Link>

            {/* Collapse Sidebar Button */}
            <button
              type="button"
              onClick={onToggle}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="hidden lg:flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white transition cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
                <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
        )}

        {/* 2. Fast Navigation Search (Expanded mode only) */}
        {!collapsed && (
          <div className="px-3 pt-3 pb-1">
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Jump to menu..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-slate-500"
              />
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
                <Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" className="h-3.5 w-3.5" />
              </div>
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {/* 3. Operational Navigation Menu */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4 custom-scrollbar">
          {filteredSections.map((section) => {
            const isOpen = openSections.has(section.title);
            return (
              <div key={section.title} className="space-y-1">
                {!collapsed && (
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="flex w-full items-center justify-between px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 transition"
                  >
                    <span>{section.title}</span>
                    <Icon
                      d={ICONS.chevron}
                      className={`h-3 w-3 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
                    />
                  </button>
                )}

                {(isOpen || collapsed) && (
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const hasChildren = Boolean(item.children && item.children.length > 0);
                      const isSubOpen = openSubItems.has(item.label);
                      const isActive = isItemActive(item.href) || (hasChildren && item.children?.some((c) => isItemActive(c.href)));

                      return (
                        <div key={item.label}>
                          {hasChildren ? (
                            <div
                              onClick={(e) => toggleSubItem(item.label, e)}
                              className={`group relative flex cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-xs font-bold transition select-none ${
                                isActive
                                  ? "bg-blue-50 text-blue-700 font-black border-l-4 border-blue-600 shadow-sm dark:bg-blue-600/15 dark:text-blue-400 dark:border-blue-500"
                                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.05] dark:hover:text-white"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-white"}`}>
                                  <Icon d={ICONS[item.icon] || ICONS.dashboard} className="h-4 w-4" />
                                </span>
                                {!collapsed && <span className="truncate">{item.label}</span>}
                              </div>

                              {!collapsed && (
                                <Icon
                                  d={ICONS.chevron}
                                  className={`h-3 w-3 transition-transform duration-200 ${isSubOpen ? "rotate-90" : ""}`}
                                />
                              )}
                            </div>
                          ) : (
                            <Link
                              href={item.href}
                              onClick={onMobileClose}
                              className={`group relative flex items-center justify-between rounded-xl px-2.5 py-2 text-xs font-bold transition ${
                                isActive
                                  ? "bg-blue-50 text-blue-700 font-black border-l-4 border-blue-600 shadow-sm dark:bg-blue-600/15 dark:text-blue-400 dark:border-blue-500"
                                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.05] dark:hover:text-white"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-white"}`}>
                                  <Icon d={ICONS[item.icon] || ICONS.dashboard} className="h-4 w-4" />
                                </span>
                                {!collapsed && <span className="truncate">{item.label}</span>}
                              </div>

                              {!collapsed && item.badge && (
                                <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold ${BADGE_STYLES[item.badge.tone]}`}>
                                  {item.badge.text}
                                </span>
                              )}
                            </Link>
                          )}

                          {/* Children dropdown */}
                          {hasChildren && isSubOpen && !collapsed && (
                            <div className="ml-5 mt-0.5 space-y-0.5 border-l border-slate-200 dark:border-white/10 pl-2">
                              {item.children?.map((child) => {
                                const isChildActive = isItemActive(child.href);
                                return (
                                  <Link
                                    key={child.label}
                                    href={child.href}
                                    onClick={onMobileClose}
                                    className={`group flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                                      isChildActive
                                        ? "bg-blue-50 text-blue-700 font-black dark:bg-blue-500/10 dark:text-blue-400"
                                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.04] dark:hover:text-slate-200"
                                    }`}
                                  >
                                    <span className="truncate">{child.label}</span>
                                    {child.badge && (
                                      <span className={`rounded px-1 py-0.2 text-[8px] font-bold ${BADGE_STYLES[child.badge.tone]}`}>
                                        {child.badge.text}
                                      </span>
                                    )}
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 4. Bottom System Controls (Settings, AI, Profile) */}
        <div className="border-t border-slate-200/80 dark:border-white/10 px-3 py-2 space-y-1 shrink-0 bg-slate-50/80 dark:bg-black/20">
          {/* AI Self-Audit */}
          <Link
            href="/ai/self-audit"
            onClick={onMobileClose}
            className={`group flex items-center justify-between rounded-xl px-2.5 py-2 text-xs font-bold transition ${
              pathname?.startsWith("/ai")
                ? "bg-purple-50 text-purple-700 border-l-4 border-purple-600 dark:bg-purple-600/20 dark:text-purple-300 dark:border-purple-500"
                : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.05] dark:hover:text-white"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-purple-600 dark:text-purple-400">
                <Icon d={ICONS.ai} className="h-4 w-4" />
              </span>
              {!collapsed && <span className="truncate">AI Self-Audit</span>}
            </div>
            {!collapsed && (
              <span className="rounded-md border border-purple-200 bg-purple-100 px-1.5 py-0.5 text-[9px] font-extrabold text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/20 dark:text-purple-300">
                100%
              </span>
            )}
          </Link>

          {/* System Settings Hub */}
          <Link
            href="/settings"
            onClick={onMobileClose}
            className={`group flex items-center justify-between rounded-xl px-2.5 py-2 text-xs font-bold transition ${
              pathname === "/settings"
                ? "bg-blue-50 text-blue-700 border-l-4 border-blue-600 dark:bg-blue-600/20 dark:text-blue-300 dark:border-blue-500"
                : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.05] dark:hover:text-white"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-blue-600 dark:text-blue-400">
                <Icon d={ICONS.settings} className="h-4 w-4" />
              </span>
              {!collapsed && <span className="truncate">System Settings</span>}
            </div>
            {!collapsed && (
              <span className="rounded-md border border-blue-200 bg-blue-100 px-1.5 py-0.5 text-[9px] font-extrabold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-300">
                Control Hub
              </span>
            )}
          </Link>

          {/* User Profile & Collapse Toggle */}
          <div className="pt-1 flex items-center justify-between">
            <div
              onClick={() => setProfileOpen(true)}
              className="flex flex-1 items-center gap-2 rounded-xl p-1.5 hover:bg-slate-200/70 dark:hover:bg-white/[0.05] cursor-pointer transition min-w-0"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-black text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10">
                {currentAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentAvatar} alt="" className="h-8 w-8 rounded-xl object-cover" />
                ) : (
                  (name || "Admin").slice(0, 2).toUpperCase()
                )}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-slate-900 dark:text-white">
                    {name || "Admin User"}
                  </span>
                  <span className="block truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
                    {role || "Admin"}
                  </span>
                </div>
              )}
            </div>

            {!collapsed && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleSignOut}
                  title="Sign Out"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/20 dark:hover:text-rose-400 transition"
                >
                  <Icon d={ICONS.logout} className="h-4 w-4" />
                </button>
                <button
                  onClick={onToggle}
                  title="Collapse Sidebar"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition"
                >
                  <Icon d="M11 19l-7-7 7-7m8 14l-7-7 7-7" className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Avatar / Profile Modal */}
      {profileOpen && (
        <AvatarModal
          open={profileOpen}
          userId={userId}
          avatarUrl={currentAvatar}
          name={name}
          email={email}
          onClose={() => setProfileOpen(false)}
          onAvatarUpdated={(url: string | null) => setCurrentAvatar(url)}
        />
      )}
    </>
  );
}
