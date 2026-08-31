"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "./sidebar";
import GlobalSearch from "./global-search";
import NotificationBell from "./notification-bell";
import ThemeToggle from "./theme-toggle";
import CloudSyncBadge from "./cloud-sync-badge";

const COLLAPSE_KEY = "sccomm-sidebar-collapsed";

const PAGE_META: Record<string, { title: string; desc: string }> = {
  "/dashboard": { title: "Executive Dashboard", desc: "Real-time store metrics & counter telemetry" },
  "/pos": { title: "Point of Sale", desc: "High-speed retail & services billing counter" },
  "/invoices": { title: "Invoices & Sales", desc: "Comprehensive sales ledger & customer receipts" },
  "/customers": { title: "Customer Directory", desc: "CRM, dues tracking & credit limits" },
  "/returns": { title: "Returns & Credit", desc: "Item returns, refunds & reversal vouchers" },
  "/catalog": { title: "Catalog Masters", desc: "Products, services & categorization" },
  "/business": { title: "Business Hub", desc: "AEPS, DMT, UPI & business service operations" },
  "/finance": { title: "Finance & Accounts", desc: "Cash book, P&L, day-close & liquid float" },
  "/inventory": { title: "Inventory & Stock", desc: "Real-time stock valuation & reorder alerts" },
  "/purchases": { title: "Purchases", desc: "Vendor invoices & stock intake" },
  "/suppliers": { title: "Suppliers", desc: "Vendor directory & accounts payable" },
  "/reports": { title: "Reports Studio", desc: "Sales, margins & activity reports" },
  "/staff": { title: "Staff Accounts", desc: "Team roles & security permissions" },
  "/audit": { title: "Security Audit Log", desc: "Immutable operational event history" },
  "/ai": { title: "AI Control Center", desc: "Smart diagnostic & business insights" },
  "/security": { title: "Security & 2FA", desc: "Credentials, TOTP 2FA & terminal auto-lock" },
  "/settings": { title: "System Settings", desc: "Store profile, themes & automation" },
};

function metaFor(pathname: string) {
  const exact = PAGE_META[pathname];
  if (exact) return exact;
  for (const key of Object.keys(PAGE_META)) {
    if (pathname.startsWith(key + "/")) return PAGE_META[key];
  }
  return { title: "Café ERP", desc: "Enterprise Cybercafe & Retail ERP" };
}

function Avatar({ name, avatarUrl, size = "h-8 w-8" }: { name: string; avatarUrl: string | null; size?: string }) {
  if (avatarUrl) return <img src={avatarUrl} alt="" className={`${size} rounded-xl object-cover`} />;
  return <div className={`${size} flex items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-black text-white shadow-sm`}>{(name || "U").slice(0, 2).toUpperCase()}</div>;
}

export default function DashboardShell({ name, email, role, shopName, logoUrl, avatarUrl, userId, children }: { name: string; email: string; role: string; shopName: string; logoUrl: string | null; avatarUrl: string | null; userId: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const meta = metaFor(pathname);

  useEffect(() => { try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch {} }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(v => !v); } }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  function toggle() { setCollapsed(c => { const next = !c; try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch {} return next; }); }

  return <div className="min-h-screen bg-[var(--page)] text-slate-900 dark:text-white">
    <Sidebar name={name} email={email} role={role} shopName={shopName} logoUrl={logoUrl} avatarUrl={avatarUrl} userId={userId} collapsed={collapsed} onToggle={toggle} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90 lg:hidden">
      <button onClick={() => setMobileOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10" aria-label="Open menu">☰</button>
      <div className="min-w-0 flex-1"><p className="truncate text-xs font-black">{meta.title}</p></div>
      <button onClick={() => setSearchOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10" aria-label="Search">⌕</button>
      <ThemeToggle /><Avatar name={name} avatarUrl={avatarUrl} size="h-7 w-7" />
    </header>
    <div className={`min-h-screen transition-all duration-300 ${collapsed ? "lg:pl-[88px]" : "lg:pl-[288px]"} lg:pr-3 lg:pt-3 lg:pb-6`}>
      <header className="sticky top-3 z-20 hidden h-16 items-center justify-between rounded-[22px] border border-slate-200/80 bg-white/90 px-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90 lg:flex mb-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">{collapsed ? "›" : "‹"}</button>
          <div><div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400"><span>Café ERP</span><span>/</span><span className="text-blue-600 dark:text-blue-400">{meta.title}</span></div><h1 className="text-base font-extrabold">{meta.title}</h1></div>
        </div>
        <button type="button" onClick={() => setSearchOpen(true)} className="flex w-96 items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-1.5 text-xs text-slate-400 hover:border-blue-400 dark:border-white/10 dark:bg-white/[0.03]"><span>⌕</span><span className="flex-1 text-left">Search anything (invoices, items, customers)…</span><kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-black dark:border-white/10 dark:bg-slate-800">⌘K</kbd></button>
        <div className="flex items-center gap-3"><Link href="/pos" className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-black text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700">+ New Bill <kbd className="rounded bg-blue-700 px-1 py-0.2 text-[9px]">F2</kbd></Link><CloudSyncBadge /><ThemeToggle /><NotificationBell role={role} /><Link href="/settings" className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1 pr-2.5 dark:border-white/10 dark:bg-white/[0.04]"><Avatar name={name} avatarUrl={avatarUrl} size="h-6 w-6" /><span className="text-xs font-bold">{name || "Admin"}</span></Link></div>
      </header>
      <div className="min-h-[calc(100vh-4rem)] p-4 sm:p-5 lg:p-6">{children}</div>
    </div>
    <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
  </div>;
}
