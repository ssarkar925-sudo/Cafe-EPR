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
  products: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9",
  services: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  categories: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  inventory: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  purchases: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-8 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  suppliers: "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm11 10v-6a2 2 0 0 0-2-2h-1m3 8h-4",
  brands: "M7 7h.01M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
  billPayment: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z",
  aeps: "M4 10h16M4 14h16M6 18V7m4 11V7m4 11V7M2 7l10-5 10 5z",
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
  dayclose: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M12 12v5M9.5 14.5 12 12l2.5 2.5",
  reports: "M18 20V10M12 20V4M6 20v-6",
  gst: "M9 14l6-6m-6 0h.01M15 14h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  tax: "M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z",
  ai: "M12 2a2 2 0 0 1 2 2v1a1 1 0 0 0 1 1h1a2 2 0 0 1 2 2v1a1 1 0 0 0 1 1h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1a1 1 0 0 0-1 1v1a2 2 0 0 1-2 2h-1a1 1 0 0 0-1 1v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1a1 1 0 0 0-1-1h-1a2 2 0 0 1-2-2v-1a1 1 0 0 1-1-1H3a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1a1 1 0 0 0 1-1V9a2 2 0 0 1 2-2h1a1 1 0 0 1 1-1V4a2 2 0 0 1 2-2h2zM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z",
  audit: "M12 8v4m0 4h.01M12 3l9 5v8l-9 5-9-5V8l9-5ZM6.5 8.5 12 6l5.5 2.5M12 6v12",
  staff: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  security: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a2 2 0 0 1-1.51 1H21a2 2 0 1 1 0 4h-.09a2 2 0 0 0-1.51 1z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  chevron: "m9 18 6-6-6-6",
};

function Icon({ d, className }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d={d} /></svg>;
}

export default function Sidebar({ name, email, role, shopName, logoUrl, avatarUrl, userId, collapsed, onToggle, mobileOpen, onMobileClose }: {
  name: string; email: string; role: string; shopName: string; logoUrl: string | null; avatarUrl: string | null; userId: string; collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onMobileClose: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(avatarUrl);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleSignOut(e?: React.MouseEvent) {
    e?.preventDefault();
    if (loggingOut) return;
    setLoggingOut(true);
    try { await createClient().auth.signOut(); } catch (err) { console.error("Sign out error:", err); }
    window.location.href = "/logout";
  }

  // Core operational modules remain directly available; Settings is reserved
  // for system configuration.
  const sections: NavSection[] = useMemo(() => [
    { title: "Operate", items: [{ label: "Dashboard", href: "/dashboard", icon: "dashboard" }] },
    { title: "1. Sales Hub", items: [
      { label: "POS Billing", href: "/pos", icon: "pos", badge: { text: "F2 Fast", tone: "emerald" } },
      { label: "Sales & Invoices", href: "/invoices", icon: "invoices" },
      { label: "Customers & Khata", href: "/customers", icon: "customers" },
      { label: "Returns & Credit", href: "/returns", icon: "returns" },
    ] },
    { title: "2. Business Services", items: [
      { label: "Bill Payment", href: "/business/bill-payment", icon: "billPayment", badge: { text: "BBPS", tone: "indigo" } },
      { label: "AEPS Cash Out", href: "/business/aeps", icon: "aeps" },
      { label: "Money Transfer (DMT)", href: "/business/dmt", icon: "dmt" },
      { label: "UPI Collections", href: "/business/upi", icon: "upi" },
      { label: "WhatsApp", href: "/business/whatsapp", icon: "whatsapp" },
    ] },
    { title: "3. Inventory & Catalog", items: [
      { label: "Inventory & Stock", href: "/inventory", icon: "inventory" },
      { label: "Stock Movements", href: "/inventory/movements", icon: "transactions" },
      { label: "Catalog", href: "/catalog", icon: "products" },
      { label: "Products", href: "/catalog/products", icon: "products" },
      { label: "Services", href: "/catalog/services", icon: "services" },
      { label: "Categories", href: "/catalog/categories", icon: "categories" },
      { label: "Brands", href: "/catalog/brands", icon: "brands" },
      { label: "Units", href: "/catalog/units", icon: "products" },
    ] },
    { title: "4. Purchasing", items: [
      { label: "Purchases", href: "/purchases", icon: "purchases" },
      { label: "Purchase Entry", href: "/purchases/entry", icon: "purchases", badge: { text: "WAC", tone: "blue" } },
      { label: "Suppliers", href: "/suppliers", icon: "suppliers" },
    ] },
    { title: "5. Finance Hub", items: [
      { label: "Finance Hub", href: "/finance", icon: "pnl", badge: { text: "Dashboard", tone: "emerald" } },
      { label: "Daily Cash Book", href: "/finance/cashbook", icon: "cashbook" },
      { label: "Double-Entry Journal", href: "/finance/journal", icon: "ledger" },
      { label: "Trial Balance", href: "/finance/trial-balance", icon: "transactions" },
      { label: "Settlements & Float", href: "/finance/settlements", icon: "settlements" },
      { label: "Expenses Ledger", href: "/finance/expenses", icon: "expenses" },
      { label: "Profit & Loss (P&L)", href: "/finance/pnl", icon: "pnl" },
      { label: "Reconciliation", href: "/finance/reconciliation", icon: "dayclose" },
      { label: "Opening Balances", href: "/finance/opening-balances", icon: "opening" },
      { label: "Day Close & Rollover", href: "/finance/day-close", icon: "dayclose" },
    ] },
    { title: "6. Reports Hub", items: [
      { label: "Reports Studio", href: "/reports", icon: "reports" },
      { label: "GST Reports", href: "/reports/gst", icon: "gst" },
      { label: "Tax Prep / ITR", href: "/reports/tax-preparation", icon: "tax" },
      { label: "Audit Log", href: "/audit", icon: "audit" },
    ] },
    { title: "7. Tools & AI", items: [
      { label: "AI Control Center", href: "/ai", icon: "ai", badge: { text: "Smart", tone: "purple" } },
      { label: "Financial Self-Audit", href: "/ai/self-audit", icon: "audit", badge: { text: "14-pt", tone: "emerald" } },
    ] },
    { title: "8. Administration", items: [
      { label: "Staff Accounts", href: "/staff", icon: "staff" },
      { label: "Security & 2FA", href: "/security", icon: "security" },
      { label: "System Settings", href: "/settings", icon: "settings" },
    ] },
  ], []);

  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(sections.map((s) => s.title)));
  function toggleSection(title: string) {
    setOpenSections((prev) => { const next = new Set(prev); next.has(title) ? next.delete(title) : next.add(title); return next; });
  }

  const filteredSections = useMemo(() => {
    if (!query.trim()) return sections;
    const q = query.toLowerCase();
    return sections.map((sec) => ({ ...sec, items: sec.items.filter((item) => item.label.toLowerCase().includes(q) || item.href.toLowerCase().includes(q)) })).filter((sec) => sec.items.length > 0);
  }, [sections, query]);

  function isItemActive(itemHref: string) {
    const [itemPath, itemQuery] = itemHref.split("?");
    if (itemPath === "/dashboard") return pathname === "/dashboard";
    if (itemQuery) return pathname === itemPath && searchParams?.get("tab") === new URLSearchParams(itemQuery).get("tab");
    return pathname === itemPath || pathname?.startsWith(`${itemPath}/`);
  }

  return (
    <>
      {mobileOpen && <div onClick={onMobileClose} className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition-opacity lg:hidden" />}
      <aside className={`fixed inset-y-0 left-0 lg:top-3 lg:bottom-3 lg:left-3 lg:h-[calc(100vh-24px)] lg:rounded-[24px] z-50 flex flex-col transition-all duration-300 shadow-2xl shadow-slate-900/10 border border-slate-200/90 bg-white/90 text-slate-800 ring-1 ring-black/5 dark:border-white/10 dark:bg-slate-900/90 dark:text-slate-100 dark:shadow-black/40 dark:ring-white/10 backdrop-blur-2xl ${collapsed ? "w-[72px]" : "w-[270px]"} ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        {collapsed ? (
          <div className="flex h-16 shrink-0 items-center justify-center border-b border-slate-200/80 dark:border-white/10 px-2 py-2">
            <button type="button" onClick={onToggle} aria-label="Expand sidebar" title="Expand sidebar" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 border border-blue-200/90 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-500/30 hover:bg-blue-100 dark:hover:bg-blue-900/60 hover:scale-105 shadow-md shadow-blue-500/10 transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5"><path d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
            </button>
          </div>
        ) : (
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 dark:border-white/10 px-4">
            <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-white/20">
                {logoUrl ? <img src={logoUrl} alt="Logo" className="h-6 w-6 object-contain" /> : <span className="text-lg font-black">☕</span>}
              </div>
              <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><span className="truncate text-sm font-black tracking-tight text-slate-900 dark:text-white">{shopName || "Cafe ERP"}</span><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /></div><span className="block truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">Daily Counter Operations</span></div>
            </Link>
            <button type="button" onClick={onToggle} aria-label="Collapse sidebar" title="Collapse sidebar" className="hidden lg:flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white transition"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4"><path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg></button>
          </div>
        )}

        {!collapsed && <div className="px-3 pt-3 pb-1"><div className="relative"><input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Jump to menu..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-slate-500" /><div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400"><Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" className="h-3.5 w-3.5" /></div>{query && <button onClick={() => setQuery("")} className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600 dark:hover:text-white">✕</button>}</div></div>}

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4 custom-scrollbar">
          {filteredSections.map((section) => { const isOpen = openSections.has(section.title); return <div key={section.title} className="space-y-1">
            {!collapsed && <button onClick={() => toggleSection(section.title)} className="flex w-full items-center justify-between px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 transition"><span>{section.title}</span><Icon d={ICONS.chevron} className={`h-3 w-3 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} /></button>}
            {(isOpen || collapsed) && <div className="space-y-0.5">{section.items.map((item) => { const isActive = isItemActive(item.href); return <Link key={item.label} href={item.href} onClick={onMobileClose} className={`group relative flex items-center justify-between rounded-xl px-2.5 py-2 text-xs font-bold transition-all duration-200 ${isActive ? "bg-gradient-to-r from-blue-50 to-indigo-50/50 text-blue-700 font-black border-l-4 border-blue-600 shadow-xs dark:from-blue-600/20 dark:to-indigo-600/10 dark:text-blue-400 dark:border-blue-500" : "text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 hover:translate-x-0.5 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white"}`}>
              <div className="flex items-center gap-2.5 min-w-0"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-110 ${isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-white"}`}><Icon d={ICONS[item.icon] || ICONS.dashboard} className="h-4 w-4" /></span>{!collapsed && <span className="truncate">{item.label}</span>}</div>
              {!collapsed && item.badge && <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold shadow-2xs ${BADGE_STYLES[item.badge.tone]}`}>{item.badge.text}</span>}
            </Link>; })}</div>}
          </div>; })}
        </div>

        <div className="border-t border-slate-200/80 dark:border-white/10 px-3 py-2 shrink-0 bg-slate-50/80 dark:bg-black/20">
          <div className="pt-1 flex items-center justify-between">
            <div onClick={() => setProfileOpen(true)} className="flex flex-1 items-center gap-2 rounded-xl p-1.5 hover:bg-slate-200/70 dark:hover:bg-white/[0.05] cursor-pointer transition min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-black text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10">{currentAvatar ? <img src={currentAvatar} alt="" className="h-8 w-8 rounded-xl object-cover" /> : (name || "Admin").slice(0, 2).toUpperCase()}</div>
              {!collapsed && <div className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-900 dark:text-white">{name || "Admin User"}</span><span className="block truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">{role || "Admin"}</span></div>}
            </div>
            {!collapsed && <div className="flex items-center gap-1"><button onClick={handleSignOut} title="Sign Out" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/20 dark:hover:text-rose-400 transition"><Icon d={ICONS.logout} className="h-4 w-4" /></button><button onClick={onToggle} title="Collapse Sidebar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition"><Icon d="M11 19l-7-7 7-7m8 14l-7-7 7-7" className="h-4 w-4" /></button></div>}
          </div>
        </div>
      </aside>

      {profileOpen && <AvatarModal open={profileOpen} userId={userId} avatarUrl={currentAvatar} name={name} email={email} onClose={() => setProfileOpen(false)} onAvatarUpdated={(url: string | null) => setCurrentAvatar(url)} />}
    </>
  );
}
