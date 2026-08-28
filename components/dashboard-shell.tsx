"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "./sidebar";
import GlobalSearch from "./global-search";
import NotificationBell from "./notification-bell";
import ThemeToggle from "./theme-toggle";
import CloudSyncBadge from "./cloud-sync-badge";
import ModuleQuickNav from "./module-quick-nav";

const COLLAPSE_KEY = "sccomm-sidebar-collapsed";

const PAGE_META: Record<string, { title: string; desc: string }> = {
  "/dashboard": { title: "Dashboard", desc: "Business at a glance" },
  "/pos": { title: "Point of Sale", desc: "Invoice billing & quick counter" },
  "/invoices": { title: "Invoices", desc: "Every bill, every payment" },
  "/customers": { title: "Customers", desc: "CRM, dues & balances" },
  "/returns": { title: "Returns", desc: "Refunds & returns" },
  "/catalog/products": { title: "Products", desc: "Catalog with stock control" },
  "/catalog/services": { title: "Services", desc: "Service price list" },
  "/catalog/categories": { title: "Categories", desc: "Group products & services" },
  "/catalog/brands": { title: "Brands", desc: "Brand master data" },
  "/catalog/units": { title: "Units", desc: "Unit of measure master data" },
  "/business/aeps": { title: "AEPS", desc: "Aadhaar-enabled payments" },
  "/business/dmt": { title: "DMT", desc: "Domestic money transfer" },
  "/business/upi": { title: "UPI", desc: "UPI transactions" },
  "/business/banks": { title: "Banks", desc: "Bank accounts & ledgers" },
  "/business/portals": { title: "Portals", desc: "Third-party portals" },
  "/business/merchant-qrs": { title: "Merchant QRs", desc: "QR-based collections" },
  "/finance/pnl": { title: "Profit & Loss", desc: "Periodic P&L" },
  "/finance/expenses": { title: "Expenses", desc: "Outgoing cash entries" },
  "/finance/cashbook": { title: "Cash Book", desc: "Daily cash movements" },
  "/finance/settlements": { title: "Settlements", desc: "Bank & wallet settlements" },
  "/finance/opening-balances": { title: "Opening Balances", desc: "Seed cash, bank, cards & floats" },
  "/finance/day-close": { title: "Day Close", desc: "Reconcile, profit & lock the books" },
  "/finance/ledger": { title: "Ledger", desc: "Full account ledger" },
  "/reports": { title: "Reports", desc: "Sales, profit & activity" },
  "/staff": { title: "Staff", desc: "Team, roles & attendance" },
  "/audit": { title: "Audit Log", desc: "Every important action" },
  "/settings": { title: "Settings", desc: "Shop profile, receipts & accounts" },
};

function metaFor(pathname: string) {
  const exact = PAGE_META[pathname];
  if (exact) return exact;
  for (const key of Object.keys(PAGE_META)) {
    if (pathname.startsWith(key + "/")) return PAGE_META[key];
  }
  return { title: "Dashboard", desc: "" };
}

function Avatar({ name, avatarUrl, size = "h-9 w-9" }: { name: string; avatarUrl: string | null; size?: string }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" className={`${size} rounded-xl object-cover`} />;
  }
  return (
    <div className={`${size} flex items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white`}>
      {(name || "U").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
    </div>
  );
}

export default function DashboardShell({
  name, email, role, shopName, logoUrl, avatarUrl, userId, children,
}: {
  name: string; email: string; role: string; shopName: string; logoUrl: string | null; avatarUrl: string | null; userId: string; children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const meta = metaFor(pathname);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen((v) => !v); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  return (
    <div className="min-h-screen">
      <Sidebar name={name} email={email} role={role} shopName={shopName} logoUrl={logoUrl} avatarUrl={avatarUrl} userId={userId} collapsed={collapsed} onToggle={toggle} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setMobileOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100" aria-label="Open menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{meta.title}</p>{meta.desc && <p className="truncate text-[11px] text-slate-400">{meta.desc}</p>}</div>
        <button onClick={() => setSearchOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100" aria-label="Search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg></button>
        <div className="lg:hidden"><ThemeToggle /></div>
        <div className="lg:hidden"><NotificationBell role={role} /></div>
        <Avatar name={name} avatarUrl={avatarUrl} size="h-8 w-8" />
      </header>

      <main className={`transition-all duration-300 ${collapsed ? "lg:pl-[76px]" : "lg:pl-72"}`}>
        <header className="sticky top-0 z-20 hidden h-16 items-center gap-4 border-b border-slate-200 bg-white/80 px-6 backdrop-blur lg:flex dark:border-white/10 dark:bg-slate-900/80">
          <div className="w-52 shrink-0"><h1 className="truncate text-lg font-bold text-slate-900 dark:text-white">{meta.title}</h1>{meta.desc && <p className="truncate text-[11px] text-slate-400">{meta.desc}</p>}</div>
          <button onClick={() => setSearchOpen(true)} className="mx-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-500 shadow-sm transition hover:border-blue-400 hover:shadow focus:border-blue-400 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-slate-400"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-slate-400"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg><span className="flex-1 text-left text-slate-400">Search products, services, invoices, customers…</span><kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:border-white/10 dark:bg-white/5">Ctrl K</kbd></button>
          <div className="ml-auto flex shrink-0 items-center gap-2.5"><CloudSyncBadge /><ThemeToggle /><div className="hidden lg:block"><NotificationBell role={role} /></div><Link href="/settings" title="Settings" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:text-blue-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a2 2 0 0 0-1.51 1z" /></svg></Link><Link href="/settings" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 transition hover:border-blue-300" title={`${name} · ${role}`}><Avatar name={name} avatarUrl={avatarUrl} size="h-7 w-7" /><span className="hidden xl:block"><span className="block max-w-[120px] truncate text-xs font-semibold text-slate-800">{name}</span><span className="block text-[10px] font-medium uppercase tracking-wide text-slate-400">{role}</span></span></Link></div>
        </header>
        <ModuleQuickNav />
        {children}
      </main>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
