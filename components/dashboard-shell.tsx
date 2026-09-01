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
  "/catalog/products": { title: "Products Catalog", desc: "Inventory catalog with stock tracking" },
  "/catalog/services": { title: "Services Catalog", desc: "Cybercafe & digital service rate card" },
  "/catalog/categories": { title: "Categories Tree", desc: "Hierarchy grouping for POS fast-keys" },
  "/catalog/brands": { title: "Brands", desc: "Product brand masters" },
  "/catalog/units": { title: "Units of Measure", desc: "Pcs, sheets, packets, kg" },
  "/business": { title: "Business Hub", desc: "AEPS, DMT, UPI & remittance operations" },
  "/business/aeps": { title: "AEPS Withdrawal", desc: "Aadhaar cash disbursements & portal float" },
  "/business/dmt": { title: "Money Transfer (DMT)", desc: "IMPS / NEFT domestic remittances" },
  "/business/upi": { title: "UPI Collections", desc: "Dynamic QR scans & counter cash-out" },
  "/business/recharge": { title: "Mobile Recharge", desc: "Prepaid, postpaid & DTH top-ups" },
  "/business/banks": { title: "Bank Accounts", desc: "Commercial banks & treasury float" },
  "/business/portals": { title: "Service Portals", desc: "PayNearby, SpiceMoney, CSC portals" },
  "/business/merchant-qrs": { title: "Merchant QRs", desc: "Active POS counter QR profiles" },
  "/finance": { title: "Finance & Accounts", desc: "Cash book, P&L, day-close & liquid float" },
  "/finance/pnl": { title: "Profit & Loss (P&L)", desc: "Operating income, COGS & net profit" },
  "/finance/expenses": { title: "Expense Ledger", desc: "Categorized store operating costs" },
  "/finance/cashbook": { title: "Daily Cash Book", desc: "Continuous cash inflow/outflow audit" },
  "/finance/journal": { title: "Double-Entry Journal", desc: "Authoritative inflow/outflow journal & postings" },
  "/finance/trial-balance": { title: "Trial Balance", desc: "Auto-computed debits, credits & account balances" },
  "/finance/accounts": { title: "Payment Accounts", desc: "Liquid accounts & float configuration" },
  "/business/bill-payment": { title: "Bill & Recharge Hub", desc: "BBPS utility bill payments & mobile top-ups" },
  "/finance/settlements": { title: "Settlements & Transfers", desc: "Bank-to-wallet & float transfers" },
  "/finance/opening-balances": { title: "Opening Balances", desc: "Seed opening liquid cash & floats" },
  "/finance/day-close": { title: "End-of-Day Close", desc: "Cash reconciliation & daily book lock" },
  "/finance/ledger": { title: "Account Ledgers", desc: "Double-entry party ledgers" },
  "/inventory": { title: "Inventory & Stock", desc: "Real-time stock valuation & reorder alerts" },
  "/inventory/movements": { title: "Stock Movements", desc: "Audit log of all stock movements" },
  "/purchases": { title: "Purchases", desc: "Vendor invoices & stock intake" },
  "/purchases/entry": { title: "Purchase Entry", desc: "Record supplier stock procurement" },
  "/suppliers": { title: "Suppliers", desc: "Vendor directory & accounts payable" },
  "/reports": { title: "Reports Studio", desc: "Sales, margins & activity reports" },
  "/reports/gst": { title: "GST Reports", desc: "GSTR-1, GSTR-3B tax summaries" },
  "/reports/tax-preparation": { title: "Tax Prep / ITR", desc: "CA-ready audited financial pack" },
  "/staff": { title: "Staff Accounts", desc: "Team roles & security permissions" },
  "/audit": { title: "Security Audit Log", desc: "Immutable operational event history" },
  "/ai": { title: "AI Control Center", desc: "Smart diagnostic & business insights" },
  "/ai/self-audit": { title: "Financial Self-Audit", desc: "Automated 14-point invariant checks" },
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

function Avatar({
  name,
  avatarUrl,
  size = "h-8 w-8",
}: {
  name: string;
  avatarUrl: string | null;
  size?: string;
}) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" className={`${size} rounded-xl object-cover`} />;
  }
  return (
    <div
      className={`${size} flex items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-black text-white shadow-sm`}
    >
      {(name || "U").slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function DashboardShell({
  name,
  email,
  role,
  shopName,
  logoUrl,
  avatarUrl,
  userId,
  children,
}: {
  name: string;
  email: string;
  role: string;
  shopName: string;
  logoUrl: string | null;
  avatarUrl: string | null;
  userId: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const meta = metaFor(pathname);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-[var(--page)] text-slate-900 dark:text-white">
      {/* Sidebar Navigation */}
      <Sidebar
        name={name}
        email={email}
        role={role}
        shopName={shopName}
        logoUrl={logoUrl}
        avatarUrl={avatarUrl}
        userId={userId}
        collapsed={collapsed}
        onToggle={toggle}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Mobile Top Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90 lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          aria-label="Open menu"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-black text-slate-900 dark:text-white">{meta.title}</p>
        </div>
        <button
          onClick={() => setSearchOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>
        <ThemeToggle />
        <Avatar name={name} avatarUrl={avatarUrl} size="h-7 w-7" />
      </header>

      {/* Desktop Main Workstation Layout */}
      <div
        className={`min-h-screen transition-all duration-300 ${
          collapsed ? "lg:pl-[88px]" : "lg:pl-[288px]"
        } lg:pr-3 lg:pt-3 lg:pb-6`}
      >
        {/* Desktop Luxury Floating Top Bar */}
        <header className="sticky top-3 z-20 hidden h-16 items-center justify-between rounded-[22px] border border-slate-200/80 bg-white/90 px-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90 lg:flex mb-4">
          {/* Breadcrumb & Title with Toggle Button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white transition cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                {collapsed ? (
                  <path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                ) : (
                  <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                )}
              </svg>
            </button>
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                <span>Café ERP</span>
                <span>/</span>
                <span className="text-blue-600 dark:text-blue-400">{meta.title}</span>
              </div>
              <h1 className="text-base font-extrabold text-slate-900 dark:text-white">
                {meta.title}
              </h1>
            </div>
          </div>

          {/* Global Quick Search Pill */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex w-96 items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-1.5 text-xs text-slate-400 shadow-xs transition hover:border-blue-400 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-blue-500"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 text-slate-400">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span className="flex-1 text-left">Search anything (invoices, items, customers)…</span>
            <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-black dark:border-white/10 dark:bg-slate-800">
              ⌘K
            </kbd>
          </button>

          {/* Right Action Tray */}
          <div className="flex items-center gap-3">
            {/* Quick POS Shortcut */}
            <Link
              href="/pos"
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-black text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700"
            >
              <span>+ New Bill</span>
              <kbd className="rounded bg-blue-700 px-1 py-0.2 text-[9px] font-bold">F2</kbd>
            </Link>

            <CloudSyncBadge />
            <ThemeToggle />
            <NotificationBell role={role} />

            <Link
              href="/settings"
              className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1 pr-2.5 transition hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <Avatar name={name} avatarUrl={avatarUrl} size="h-6 w-6" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {name || "Admin"}
              </span>
            </Link>
          </div>
        </header>

        <div className="min-h-[calc(100vh-4rem)] p-4 sm:p-5 lg:p-6">
          {children}
        </div>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
