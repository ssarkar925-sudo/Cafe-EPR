"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AvatarModal from "./profile/avatar-modal";

export type BadgeTone = "emerald" | "amber" | "indigo" | "purple" | "rose" | "slate" | "blue";
export type NavChild = { label: string; href: string; icon?: string; badge?: { text: string; tone: BadgeTone } };
export type NavItem = { label: string; href: string; icon: string; badge?: { text: string; tone: BadgeTone }; isSubHeader?: boolean; children?: NavChild[] };
export type NavSection = { title: string; items: NavItem[] };

const BADGE_STYLES: Record<BadgeTone, string> = {
  emerald: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  amber: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  indigo: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  purple: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  rose: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  blue: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  slate: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

const ICONS: Record<string, string> = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  pos: "M6 6h15l-1.5 8h-13L4 3H2M9 20a1 1 0 1 0 0 .01M20 20a1 1 0 1 0 0 .01",
  invoices: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  returns: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  customers: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  products: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9",
  services: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  categories: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  inventory: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  purchases: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0-4 0Zm-8 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  suppliers: "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm11 10v-6a2 2 0 0 0-2-2h-1m3 8h-4",
  brands: "M7 7h.01M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
  billPayment: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z",
  aeps: "M12 2a10 10 0 0 0-7.07 17.07l.07.07A10 10 0 1 0 12 2zm0 18a8 8 0 1 1 8-8 8.009 8.009 0 0 1-8 8zm1-13h-2v6h2zm0 8h-2v2h2z",
  dmt: "M22 2 11 13M22 2 15 22l-4-9-9-4z",
  upi: "M12 18h.01M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z",
  whatsapp: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
  pnl: "M3 3v18h18M7 14l4-4 3 3 5-6",
  cashbook: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  ledger: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  transactions: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-3 7h4m-4 4h4m-6-4h.01M9 16h.01",
  settlements: "M3 7l7-4 7 4 4-2v13l-4 2-7-4-7 4V7zM10 3v13m7-11v13",
  expenses: "M21 12V7H5a2 2 0 1 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z",
  opening: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  dayclose: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M12 12v5M9.5 14.5 12 12l2.5 2.5",
  reports: "M18 20V10M12 20V4M6 20v-6",
  gst: "M9 14l6-6m-6 0h.01M15 14h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  tax: "M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z",
  ai: "M12 2a2 2 0 0 1 2 2v1a1 1 0 0 0 1 1h1a2 2 0 0 1 2 2v1a1 1 0 0 0 1 1h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1a1 1 0 0 0-1 1v1a2 2 0 0 1-2 2h-1a1 1 0 0 0-1 1v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1a1 1 0 0 0-1-1h-1a2 2 0 0 1-2-2v-1a1 1 0 0 1-1-1H3a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1a1 1 0 0 0 1-1V9a2 2 0 0 1 1-1V4a2 2 0 0 1 2-2h2zM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z",
  audit: "M12 8v4m0 4h.01M12 3l9 5v8l-9 5-9-5V8l9-5ZM6.5 8.5 12 6l5.5 2.5M12 6v12",
  staff: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  security: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51l-.06-.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0-1.82-.33 2 2 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a2 2 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a2 2 0 0 1-1.51 1H21a2 2 0 1 1 0 4h-.09a2 2 0 0 0-1.51 1z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  chevron: "m9 18 6-6-6-6",
};

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(avatarUrl);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleSignOut(e?: React.MouseEvent) {
    e?.preventDefault();
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await createClient().auth.signOut({ scope: "local" });
    } catch {
      /* ignore */
    }
    window.location.href = "/logout";
  }

  // Exact reference layout navigation sections:
  // SALES, INVENTORY, FINANCE, BUSINESS SERVICES, REPORTS, ADMINISTRATION
  const sections: NavSection[] = useMemo(
    () => [
      {
        title: "SALES",
        items: [
          { label: "POS", href: "/pos", icon: "pos" },
          { label: "Invoices", href: "/invoices", icon: "invoices" },
          { label: "Customers", href: "/customers", icon: "customers" },
          { label: "Returns & Refunds", href: "/returns", icon: "returns" },
        ],
      },
      {
        title: "INVENTORY",
        items: [
          { label: "Products", href: "/catalog/products", icon: "products" },
          { label: "Stock", href: "/inventory", icon: "inventory" },
          { label: "Purchases", href: "/purchases", icon: "purchases" },
          { label: "Suppliers", href: "/suppliers", icon: "suppliers" },
        ],
      },
      {
        title: "FINANCE",
        items: [
          { label: "Cashbook", href: "/finance/cashbook", icon: "cashbook" },
          { label: "Ledger", href: "/finance/ledger", icon: "ledger" },
          { label: "Journal", href: "/finance/journal", icon: "ledger" },
          { label: "Reconciliation", href: "/finance/reconciliation", icon: "dayclose" },
          { label: "Day Close", href: "/finance/day-close", icon: "dayclose" },
        ],
      },
      {
        title: "BUSINESS SERVICES",
        items: [
          { label: "AEPS", href: "/business/aeps", icon: "aeps" },
          { label: "DMT", href: "/business/dmt", icon: "dmt" },
          { label: "UPI", href: "/business/upi", icon: "upi" },
          {
            label: "BBPS & Recharge",
            /* label: "Bill Payment" */
            href: "/business/bill-payment",
            icon: "billPayment",
          },
          { label: "WhatsApp", href: "/business/whatsapp", icon: "whatsapp" },
          { label: "Merchant QR", href: "/business/merchant-qrs", icon: "upi" },
        ],
      },
      {
        title: "REPORTS",
        items: [
          { label: "Sales Reports", href: "/reports", icon: "reports" },
          { label: "Financial Reports", href: "/finance/pnl", icon: "pnl" },
          { label: "Inventory Reports", href: "/inventory/movements", icon: "transactions" },
          { label: "GST & Tax", href: "/reports/gst", icon: "gst" },
        ],
      },
      {
        title: "ADMINISTRATION",
        items: [
          { label: "Staff", href: "/staff", icon: "staff" },
          { label: "Settings", href: "/settings", icon: "settings" },
          { label: "Security", href: "/security", icon: "security" },
          { label: "AI & Automation", href: "/ai-agent", icon: "ai" },
        ],
      },
    ],
    []
  );

  function isItemActive(itemHref: string) {
    const [itemPath, itemQuery] = itemHref.split("?");
    if (itemPath === "/dashboard") return pathname === "/dashboard";
    if (itemQuery) return pathname === itemPath && searchParams?.get("tab") === new URLSearchParams(itemQuery).get("tab");
    return pathname === itemPath || (itemPath !== "/" && pathname?.startsWith(`${itemPath}/`));
  }

  const isDashboardActive = pathname === "/dashboard";

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition-opacity lg:hidden"
        />
      )}

      {/* EXACT DARK LEFT SIDEBAR (bg-[#0f172a] slate-900) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-300 border-r border-slate-800 bg-[#0f172a] text-slate-300 shadow-xl ${
          collapsed ? "w-[72px]" : "w-60 xl:w-64"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* BRAND HEADER */}
        {collapsed ? (
          <div className="flex h-16 shrink-0 items-center justify-center border-b border-slate-800 px-2 py-2">
            <button
              type="button"
              onClick={onToggle}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md hover:bg-blue-500 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5">
                <path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-4">
            <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="h-5 w-5 object-contain" />
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
                    <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
                    <circle cx="12" cy="12" r="3" fill="currentColor" />
                  </svg>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-base font-bold text-white tracking-tight">
                    {shopName || "CafeERP"}
                  </span>
                </div>
                <span className="block truncate text-[10px] font-medium text-slate-400">
                  Retail • Services • Finance
                </span>
              </div>
            </Link>
            <button
              type="button"
              onClick={onToggle}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="8" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* NAVIGATION ITEMS */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-scrollbar">
          {/* Top selected Dashboard Item */}
          <div>
            <Link
              href="/dashboard"
              onClick={onMobileClose}
              title={collapsed ? "Dashboard" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                isDashboardActive
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
              }`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                <Icon d={ICONS.dashboard} className="h-4 w-4" />
              </span>
              {!collapsed && <span>Dashboard</span>}
            </Link>
          </div>

          {/* Grouped Nav Sections */}
          {sections.map((section) => (
            <div key={section.title} className="space-y-1">
              {!collapsed && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {section.title}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = isItemActive(item.href);
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={onMobileClose}
                      title={collapsed ? item.label : undefined}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition ${
                        isActive
                          ? "bg-blue-600 text-white font-semibold shadow-sm"
                          : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400 group-hover:text-white">
                          <Icon d={ICONS[item.icon] || ICONS.dashboard} className="h-4 w-4" />
                        </span>
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </div>
                      {!collapsed && item.badge && (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase ${
                            BADGE_STYLES[item.badge.tone]
                          }`}
                        >
                          {item.badge.text}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* BOTTOM USER PROFILE STRIP */}
        <div className="border-t border-slate-800 px-3 py-2.5 shrink-0 bg-[#0c1322]">
          <div className="flex items-center justify-between">
            <div
              onClick={() => setProfileOpen(true)}
              className="flex flex-1 items-center gap-2.5 rounded-lg p-1 hover:bg-slate-800/60 cursor-pointer transition min-w-0"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-sm overflow-hidden">
                {currentAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentAvatar} alt="" className="h-8 w-8 object-cover" />
                ) : (
                  (name || "Saikat Sarkar").slice(0, 2).toUpperCase()
                )}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-white">
                    {name || "Saikat Sarkar"}
                  </span>
                  <span className="block truncate text-[10px] text-slate-400 font-medium">
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
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-950/40 hover:text-rose-400 transition"
                >
                  <Icon d={ICONS.logout} className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

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
