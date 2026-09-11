"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "./sidebar";
import GlobalSearch from "./global-search";
import NotificationBell from "./notification-bell";
import ThemeToggle from "./theme-toggle";
import CloudSyncBadge from "./cloud-sync-badge";
import WhatsAppStatusBadge from "./whatsapp/whatsapp-status-badge";
import MobileBottomNav from "./mobile-bottom-nav";

const COLLAPSE_KEY = "sccomm-sidebar-collapsed";

const PAGE_META: Record<string, { title: string; desc: string; section?: string }> = {
  "/dashboard": { title: "Executive Dashboard", desc: "Real-time store metrics & counter telemetry", section: "Operate" },
  "/pos": { title: "Point of Sale", desc: "High-speed retail & services billing counter", section: "1. Sales Hub" },
  "/invoices": { title: "Invoices & Sales", desc: "Comprehensive sales ledger & customer receipts", section: "1. Sales Hub" },
  "/customers": { title: "Customer Directory", desc: "CRM, dues tracking & credit limits", section: "1. Sales Hub" },
  "/returns": { title: "Returns & Credit", desc: "Item returns, refunds & reversal vouchers", section: "1. Sales Hub" },
  "/catalog": { title: "Catalog Masters", desc: "Products, services & categorization", section: "3. Inventory & Catalog" },
  "/catalog/products": { title: "Products Catalog", desc: "Inventory catalog with stock tracking", section: "3. Inventory & Catalog" },
  "/catalog/services": { title: "Services Catalog", desc: "Cybercafe & digital service rate card", section: "3. Inventory & Catalog" },
  "/catalog/categories": { title: "Categories Tree", desc: "Hierarchy grouping for POS fast-keys", section: "3. Inventory & Catalog" },
  "/catalog/brands": { title: "Brands", desc: "Product brand masters", section: "3. Inventory & Catalog" },
  "/catalog/units": { title: "Units of Measure", desc: "Pcs, sheets, packets, kg", section: "3. Inventory & Catalog" },
  "/business": { title: "Business Hub", desc: "AEPS, DMT, UPI & remittance operations", section: "2. Business Services" },
  "/business/aeps": { title: "AEPS Withdrawal", desc: "Aadhaar cash disbursements & portal float", section: "2. Business Services" },
  "/business/dmt": { title: "Money Transfer (DMT)", desc: "IMPS / NEFT domestic remittances", section: "2. Business Services" },
  "/business/upi": { title: "UPI Collections", desc: "Dynamic QR scans & counter cash-out", section: "2. Business Services" },
  "/business/recharge": { title: "Mobile Recharge", desc: "Prepaid, postpaid & DTH top-ups", section: "2. Business Services" },
  "/business/banks": { title: "Bank Accounts", desc: "Commercial banks & treasury float", section: "2. Business Services" },
  "/business/portals": { title: "Service Portals", desc: "PayNearby, SpiceMoney, CSC portals", section: "2. Business Services" },
  "/business/merchant-qrs": { title: "Merchant QRs", desc: "Active POS counter QR profiles", section: "2. Business Services" },
};

function metaFor(pathname: string) {
  if (PAGE_META[pathname]) return PAGE_META[pathname];
  const match = Object.keys(PAGE_META).sort((a, b) => b.length - a.length).find((key) => pathname.startsWith(key));
  return match ? PAGE_META[match] : { title: "Cafe ERP", desc: "Store operations workspace", section: "System" };
}

function Avatar({ name, avatarUrl, size = "h-8 w-8" }: { name: string; avatarUrl: string | null; size?: string }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" className={`${size} rounded-xl object-cover`} />;
  }
  return <div className={`${size} flex items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-black text-white shadow-sm`}>{(name || "U").slice(0, 2).toUpperCase()}</div>;
}

export default function DashboardShell({ name, email, role, shopName, logoUrl, avatarUrl, userId, children }: { name: string; email: string; role: string; shopName: string; logoUrl: string | null; avatarUrl: string | null; userId: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const meta = metaFor(pathname);

  useEffect(() => { try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch {} }, [pathname]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen((v) => !v); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  function toggle() {
    setCollapsed((c) => { const next = !c; try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch {} return next; });
  }

  return (
    <div className="erp-app-shell min-h-screen bg-[var(--page)] text-slate-900 dark:text-white">
      <Sidebar name={name} email={email} role={role} shopName={shopName} logoUrl={logoUrl} avatarUrl={avatarUrl} userId={userId} collapsed={collapsed} onToggle={toggle} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      <header className="erp-mobile-header sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90 lg:hidden">
        <button onClick={() => setMobileOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10" aria-label="Open menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-slate-900 dark:text-white">{meta.title}</p></div>
        <Link href="/ai-agent" aria-label="Open Cafe AI Agent" title="Open Cafe AI Agent" className="flex h-8 w-8 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"><span aria-hidden="true">✦</span></Link>
        <button onClick={() => setSearchOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10" aria-label="Open search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button>
        <ThemeToggle />
        <Avatar name={name} avatarUrl={avatarUrl} size="h-7 w-7" />
      </header>

      <div className={`erp-workspace ${collapsed ? "lg:pl-[88px]" : "lg:pl-[288px]"} transition-all duration-300`}>
        <header className="erp-desktop-header hidden lg:flex h-16 items-center justify-between rounded-[22px] border border-slate-200/80 bg-white/80 px-6 shadow-md shadow-slate-900/5 backdrop-blur-2xl ring-1 ring-black/5 dark:border-white/10 dark:bg-slate-900/80 dark:shadow-black/20 dark:ring-white/10 mb-4 transition-all duration-300">
          <div className="flex items-center gap-3 shrink-0">
            <button type="button" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white transition cursor-pointer shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">{collapsed ? <path d="M13 5l7 7-7 7M5 5l7 7-7 7"/> : <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>}</svg>
            </button>
            <div className="shrink-0">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap"><span>Café ERP</span>{meta.section && meta.section !== "System" && <><span>/</span><span className="text-slate-500 dark:text-slate-400">{meta.section}</span></>}<span>/</span><span className="text-blue-600 dark:text-blue-400 font-extrabold">{meta.title}</span></div>
              <h1 className="text-base font-extrabold text-slate-900 dark:text-white whitespace-nowrap">{meta.title}</h1>
            </div>
          </div>
          <button type="button" onClick={() => setSearchOpen(true)} className="group flex flex-1 max-w-xs xl:max-w-md mx-3 items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-2 text-xs text-slate-400 shadow-inner transition hover:border-blue-500/50 hover:bg-white hover:shadow-md hover:shadow-blue-500/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-blue-400/50 dark:hover:bg-slate-800/80"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors shrink-0"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span className="flex-1 text-left truncate group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">Search anything (invoices, items, customers)…</span><kbd className="shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-black text-slate-500 shadow-2xs dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">⌘K</kbd></button>
          <div className="flex items-center gap-2.5 shrink-0">
            <Link href="/pos" className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-black text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700 shrink-0"><span>+ New Bill</span><kbd className="rounded bg-blue-700 px-1 py-0.2 text-[9px] font-bold">F2</kbd></Link>
            <Link href="/ai-agent" aria-label="Open Cafe AI Agent" title="Open Cafe AI Agent" className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700 shadow-sm transition hover:bg-indigo-100 dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20 shrink-0"><span aria-hidden="true">✦</span><span className="hidden xl:inline">Cafe AI Agent</span><span className="xl:hidden">AI</span></Link>
            <CloudSyncBadge /><WhatsAppStatusBadge /><ThemeToggle /><NotificationBell role={role} />
            <Link href="/settings" className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1 pr-2.5 transition hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.04] shrink-0"><Avatar name={name} avatarUrl={avatarUrl} size="h-6 w-6"/><span className="text-xs font-bold text-slate-800 dark:text-slate-200">{name || "Admin"}</span></Link>
          </div>
        </header>

        <div className="erp-page-content min-h-[calc(100vh-4rem)] p-4 sm:p-5 lg:px-6 lg:pt-0 pb-24 lg:pb-6">{children}</div>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <MobileBottomNav />
    </div>
  );
}
