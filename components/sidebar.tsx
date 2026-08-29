"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AvatarModal from "./profile/avatar-modal";

export type BadgeTone = "emerald" | "amber" | "indigo" | "purple" | "rose" | "slate" | "blue";
export type NavItem = {
  label: string;
  href: string;
  icon: string;
  badge?: { text: string; tone: BadgeTone };
  isSubHeader?: boolean;
};
export type NavSection = { title: string; items: NavItem[] };

const BADGE_STYLES: Record<BadgeTone, string> = {
  emerald: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  amber: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  indigo: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  purple: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  rose: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  blue: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  slate: "bg-slate-500/20 text-slate-400 border-slate-500/30",
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
        "Counter",
        "Services",
        "Inventory",
        "Finance",
        "Reports",
        "Intelligence",
        "Admin",
      ])
  );

  const sections: NavSection[] = useMemo(
    () => [
      {
        title: "Counter",
        items: [
          { label: "POS & Quick Sale", href: "/pos", icon: "pos", badge: { text: "F2 Fast", tone: "emerald" } },
          { label: "Invoices & Sales", href: "/invoices", icon: "invoices" },
          { label: "Returns", href: "/returns", icon: "returns" },
          { label: "Customers", href: "/customers", icon: "customers" },
          { label: "Customer Dues", href: "/finance/ledger", icon: "dues", badge: { text: "Khata", tone: "amber" } },
        ],
      },
      {
        title: "Services",
        items: [
          { label: "AEPS Cash Out", href: "/business/aeps", icon: "aeps" },
          { label: "Money Transfer (DMT)", href: "/business/dmt", icon: "dmt" },
          { label: "UPI Collections", href: "/business/upi", icon: "upi" },
          { label: "Mobile Recharge", href: "/business/recharge", icon: "recharge" },
          // Management Sub-Section
          { label: "SERVICE MANAGEMENT", href: "#", icon: "", isSubHeader: true },
          { label: "Bank Accounts", href: "/business/banks", icon: "banks" },
          { label: "Merchant QRs", href: "/business/merchant-qrs", icon: "qrs" },
          { label: "Service Portals", href: "/business/portals", icon: "portals" },
          { label: "Transactions Log", href: "/business/aeps?tab=all", icon: "transactions" },
        ],
      },
      {
        title: "Inventory",
        items: [
          { label: "Products", href: "/catalog/products", icon: "products" },
          { label: "Services Catalog", href: "/catalog/services", icon: "services" },
          { label: "Categories", href: "/catalog/categories", icon: "categories" },
          { label: "Stock Movements", href: "/inventory", icon: "inventory" },
          { label: "Purchases Entry", href: "/purchases/entry", icon: "purchases", badge: { text: "WAC", tone: "blue" } },
          { label: "Suppliers", href: "/suppliers", icon: "suppliers" },
          { label: "Brands & Units", href: "/catalog/brands", icon: "brands" },
        ],
      },
      {
        title: "Finance",
        items: [
          { label: "Opening Position", href: "/finance/opening-balances", icon: "opening", badge: { text: "Equity", tone: "purple" } },
          { label: "Daily Cash Book", href: "/finance/cashbook", icon: "cashbook" },
          { label: "Customer Ledger", href: "/finance/ledger", icon: "ledger" },
          { label: "Expenses", href: "/finance/expenses", icon: "expenses" },
          { label: "Settlements & Float", href: "/finance/settlements", icon: "settlements" },
          { label: "Profit & Loss (P&L)", href: "/finance/pnl", icon: "pnl" },
          { label: "End-of-Day Close", href: "/finance/day-close", icon: "dayclose", badge: { text: "Lock", tone: "blue" } },
        ],
      },
      {
        title: "Reports",
        items: [
          { label: "Overview & Analytics", href: "/reports", icon: "reports" },
          { label: "Sales Analytics", href: "/reports?tab=sales", icon: "salesreport" },
          { label: "Services Analytics", href: "/reports?tab=services", icon: "services" },
          { label: "Cash & Bank Flows", href: "/reports?tab=treasury", icon: "banks" },
          { label: "Customers & Dues", href: "/reports?tab=customers", icon: "customers" },
          { label: "Expenses Breakdown", href: "/reports?tab=expenses", icon: "expenses" },
          { label: "Inventory Valuation", href: "/reports?tab=inventory", icon: "inventory" },
          { label: "GST Statutory (GSTR)", href: "/reports/gst", icon: "gst", badge: { text: "Tax", tone: "emerald" } },
          { label: "Tax Prep (ITR-3/4)", href: "/reports/tax-preparation", icon: "tax", badge: { text: "ITR", tone: "indigo" } },
        ],
      },
      {
        title: "Intelligence",
        items: [
          { label: "AI Business Advisor", href: "/ai", icon: "ai", badge: { text: "AI Pro", tone: "purple" } },
          { label: "Financial Self-Audit", href: "/ai/self-audit", icon: "audit", badge: { text: "100%", tone: "emerald" } },
        ],
      },
      {
        title: "Admin",
        items: [
          { label: "Staff Accounts", href: "/staff", icon: "staff" },
          { label: "Security & 2FA", href: "/security", icon: "security" },
          { label: "Audit Trail", href: "/audit", icon: "audit" },
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
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((it) => it.label.toLowerCase().includes(q) && !it.isSubHeader),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [sections, query]);

  function isItemActive(itemHref: string) {
    if (itemHref === "#") return false;
    if (itemHref === "/dashboard") return pathname === "/dashboard";

    const [itemPath, itemQuery] = itemHref.split("?");
    if (itemQuery) {
      // Tab-specific match
      const tabParam = new URLSearchParams(itemQuery).get("tab");
      return pathname === itemPath && searchParams?.get("tab") === tabParam;
    }

    if (pathname === itemPath) {
      // If the current URL has a tab param and our link doesn't, check if it's the default route
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

      {/* Main Sidebar Element (Floating 3D Dock) */}
      <aside
        style={{
          backgroundColor: "var(--sidebar-bg)",
          borderColor: "var(--sidebar-border)",
          color: "var(--sidebar-text)",
        }}
        className={`spatial-sidebar-dock fixed inset-y-0 left-0 lg:top-3 lg:bottom-3 lg:left-3 lg:h-[calc(100vh-24px)] lg:rounded-[24px] z-50 flex flex-col transition-all duration-300 ${
          collapsed ? "w-[72px]" : "w-[280px]"
        } ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* 1. Brand Header */}
        <div
          style={{ borderColor: "var(--sidebar-border)" }}
          className="flex h-16 shrink-0 items-center justify-between border-b px-4"
        >
          <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo" className="h-6 w-6 object-contain" />
              ) : (
                <span className="text-base font-black">☕</span>
              )}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="truncate text-sm font-black" style={{ color: "var(--sidebar-text)" }}>
                    {shopName || "Sarkar Comm"}
                  </h1>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <p className="truncate text-[10px] font-bold" style={{ color: "var(--sidebar-muted)" }}>
                  Café ERP Enterprise
                </p>
              </div>
            )}
          </Link>

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            onClick={onToggle}
            style={{ color: "var(--sidebar-muted)" }}
            className="hidden rounded-xl p-1.5 transition hover:bg-white/10 lg:flex"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icon
              d={collapsed ? "m13 17 5-5-5-5M6 17l5-5-5-5" : "m11 17-5-5 5-5m7 10-5-5 5-5"}
              className="h-4 w-4"
            />
          </button>
        </div>

        {/* 2. Fast Filter Search (when expanded) */}
        {!collapsed && (
          <div style={{ borderColor: "var(--sidebar-border)" }} className="border-b px-3 py-2.5">
            <div className="relative">
              <Icon
                d="M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 21l-4.35-4.35"
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-50"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search workspace (Ctrl+K)…"
                style={{
                  backgroundColor: "var(--sidebar-card)",
                  borderColor: "var(--sidebar-border)",
                  color: "var(--sidebar-text)",
                }}
                className="w-full rounded-xl border py-1.5 pl-8 pr-3 text-xs font-semibold shadow-xs outline-none focus:border-blue-500"
              />
            </div>
          </div>
        )}

        {/* 3. Navigation List */}
        <div className="flex-1 overflow-y-auto px-2.5 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Top-Level Standalone Dashboard Link */}
          <div className="mb-2">
            {(() => {
              const active = pathname === "/dashboard";
              return (
                <Link
                  href="/dashboard"
                  onClick={onMobileClose}
                  data-active={active ? "true" : "false"}
                  style={{
                    color: active ? "#ffffff" : "var(--sidebar-text)",
                  }}
                  className={`group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold transition-all duration-200 ${
                    active
                      ? "active-nav-link bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30 ring-1 ring-white/20"
                      : "hover:bg-slate-100/80 dark:hover:bg-white/5 active:scale-[0.98]"
                  }`}
                  title={collapsed ? "Executive Dashboard" : undefined}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 ${
                      active
                        ? "bg-white/20 text-white shadow-xs"
                        : "bg-slate-100/80 text-slate-600 group-hover:scale-105 group-hover:text-blue-600 dark:bg-white/5 dark:text-slate-400 dark:group-hover:text-white"
                    }`}
                  >
                    <Icon d={ICONS.dashboard} className="h-4 w-4" />
                  </span>
                  {!collapsed && <span className="truncate">Executive Dashboard</span>}
                </Link>
              );
            })()}
          </div>

          <div className="space-y-4">
            {filteredSections.map((section) => {
              const isOpen = openSections.has(section.title) || Boolean(query);
              return (
                <div key={section.title} className="space-y-1">
                  {!collapsed && (
                    <button
                      type="button"
                      onClick={() => toggleSection(section.title)}
                      style={{ color: "var(--sidebar-muted)" }}
                      className="flex w-full items-center justify-between px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition hover:opacity-100"
                    >
                      <span>{section.title}</span>
                      <Icon
                        d="m6 9 6 6 6-6"
                        className={`h-3 w-3 transition-transform duration-200 ${
                          isOpen ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </button>
                  )}

                  {isOpen && (
                    <div className="space-y-0.5">
                      {section.items.map((item, idx) => {
                        if (item.isSubHeader) {
                          if (collapsed) return null;
                          return (
                            <div
                              key={idx}
                              className="pt-2 pb-1 px-3 text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-white/5 mt-1"
                            >
                              {item.label}
                            </div>
                          );
                        }

                        const active = isItemActive(item.href);
                        return (
                          <Link
                            key={item.href + idx}
                            href={item.href}
                            onClick={onMobileClose}
                            data-active={active ? "true" : "false"}
                            style={{
                              color: active ? "#ffffff" : "var(--sidebar-text)",
                            }}
                            className={`group relative flex items-center gap-3 rounded-2xl px-3 py-2 text-xs font-bold transition-all duration-200 ${
                              active
                                ? "active-nav-link bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30 ring-1 ring-white/20"
                                : "hover:bg-slate-100/80 dark:hover:bg-white/5 active:scale-[0.98]"
                            }`}
                            title={collapsed ? item.label : undefined}
                          >
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 ${
                                active
                                  ? "bg-white/20 text-white shadow-xs"
                                  : "bg-slate-100/80 text-slate-600 group-hover:scale-105 group-hover:text-blue-600 dark:bg-white/5 dark:text-slate-400 dark:group-hover:text-white"
                              }`}
                            >
                              <Icon d={ICONS[item.icon] || ICONS.dashboard} className="h-4 w-4" />
                            </span>

                            {!collapsed && (
                              <div className="flex flex-1 items-center justify-between overflow-hidden">
                                <span className="truncate">{item.label}</span>
                                {item.badge && (
                                  <span
                                    className={`rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase leading-none shadow-xs ${
                                      BADGE_STYLES[item.badge.tone]
                                    }`}
                                  >
                                    {item.badge.text}
                                  </span>
                                )}
                              </div>
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
        </div>

        {/* 4. Footer User Profile & System Controls */}
        <div
          style={{ borderColor: "var(--sidebar-border)" }}
          className="shrink-0 border-t p-2.5"
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className={`flex items-center gap-2.5 rounded-2xl p-1.5 transition hover:bg-white/10 ${
                collapsed ? "w-full justify-center" : "flex-1 text-left min-w-0"
              }`}
              title="Edit Profile"
            >
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-500 text-xs font-black text-white shadow-xs">
                {currentAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentAvatar}
                    alt={name}
                    className="h-full w-full rounded-xl object-cover"
                  />
                ) : (
                  name?.charAt(0)?.toUpperCase() || "A"
                )}
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-emerald-500" />
              </div>

              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black" style={{ color: "var(--sidebar-text)" }}>
                    {name || "Admin User"}
                  </p>
                  <p className="truncate text-[10px] font-bold capitalize" style={{ color: "var(--sidebar-muted)" }}>
                    {role || "Admin"} · Enterprise
                  </p>
                </div>
              )}
            </button>

            {/* Logout Action Button */}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={loggingOut}
              style={{ color: "var(--sidebar-muted)" }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition hover:bg-rose-500/20 hover:text-rose-400 disabled:opacity-50"
              title="Sign Out (Lock Session)"
            >
              {loggingOut ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-500 border-t-transparent" />
              ) : (
                <Icon d={ICONS.logout} className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Avatar Profile Modal */}
      {profileOpen && (
        <AvatarModal
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          currentAvatar={currentAvatar}
          name={name}
          email={email}
          userId={userId}
          onAvatarUpdated={(url) => setCurrentAvatar(url)}
        />
      )}
    </>
  );
}
