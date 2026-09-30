"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./sidebar";
import GlobalSearch from "./global-search";
import GlobalQuickAccess from "./global-quick-access";
import NotificationBell from "./notification-bell";
import ThemeToggle from "./theme-toggle";
import WhatsAppStatusBadge from "./whatsapp/whatsapp-status-badge";
import MobileBottomNav from "./mobile-bottom-nav";
import { DashboardShellProvider } from "./dashboard-shell-context";
import SAIBackgroundLayer from "@/components/sai/sai-background-layer";

const COLLAPSE_KEY = "sccomm-sidebar-collapsed";

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
    return <img src={avatarUrl} alt="" className={`${size} rounded-full object-cover`} />;
  }
  return (
    <div
      className={`${size} flex items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-xs`}
    >
      {(name || "Saikat Sarkar").slice(0, 2).toUpperCase()}
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
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const isPos = pathname === "/pos";
  const roleLabel =
    role === "admin" ? "Admin" :
    role === "manager" ? "Manager" :
    role === "staff" ? "Staff" : "User";

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (pathname?.startsWith("/pos")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        router.push("/settings");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, router]);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  const workspaceStyle = isPos
    ? ({ "--erp-sidebar-offset": collapsed ? "72px" : "256px" } as React.CSSProperties)
    : undefined;

  const shellContextValue = {
    collapsed,
    toggleSidebar: toggle,
    mobileOpen,
    setMobileOpen,
    searchOpen,
    setSearchOpen,
    name,
    email,
    role,
    shopName,
    logoUrl,
    avatarUrl,
    userId,
  };

  return (
    <DashboardShellProvider value={shellContextValue}>
      <div
        className="modern-erp erp-app-shell relative z-[1] min-h-screen text-slate-900 dark:text-white bg-transparent"
        data-module={pathname?.split("/")[1] || "dashboard"}
      >
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

        {/* MOBILE HEADER (Reference: Left hamburger, CafeERP brand, AI, Bell, Avatar) */}
        <header className="erp-mobile-header sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/85 lg:hidden">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Open menu"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
              {shopName || "CafeERP"}
            </span>
            {isPos && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                POS Live
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <NotificationBell role={role} />
            <Link
              href="/settings"
              className="flex items-center rounded-full transition active:scale-95"
              title="Settings & System Control Center"
              aria-label="Open settings"
            >
              <Avatar name={name || "Saikat Sarkar"} avatarUrl={avatarUrl} size="h-7 w-7" />
            </Link>
          </div>
        </header>

        <div
          style={workspaceStyle}
          className={`erp-workspace ${
            collapsed ? "lg:pl-[72px]" : "lg:pl-60 xl:pl-64"
          } ${isPos ? "is-pos flex flex-col h-screen overflow-hidden" : "min-h-screen"} transition-all duration-300`}
        >
          {/* DESKTOP HEADER: navigation, search, notifications, theme and authenticated-user menu. */}
          <header className="erp-desktop-header sticky top-0 z-30 hidden lg:flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/80 px-6 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/80 transition-all duration-300">
            <div className="flex items-center gap-3 sm:gap-4 flex-1 max-w-2xl min-w-0">
              <button
                type="button"
                onClick={toggle}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition shrink-0"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>

              <div
                onClick={() => setSearchOpen(true)}
                className="flex flex-1 items-center gap-2.5 rounded-lg border border-slate-200/90 bg-slate-50/90 px-3.5 py-2 text-xs text-slate-400 cursor-pointer hover:border-slate-300 hover:bg-white transition dark:border-slate-800 dark:bg-slate-800/60 dark:hover:bg-slate-800"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4 text-slate-400 shrink-0"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span className="truncate">
                  Search customers, products, invoices, or menu... (Ctrl + K)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 ml-4">
              <WhatsAppStatusBadge />

              <NotificationBell role={role} />

              <ThemeToggle />

              <Link
                href="/settings"
                className="flex items-center gap-2.5 rounded-lg pl-2 transition hover:opacity-85 cursor-pointer"
                title="Settings & System Control Center"
              >
                <Avatar name={name || "Saikat Sarkar"} avatarUrl={avatarUrl} size="h-8 w-8" />
                <div className="text-left hidden sm:block">
                  <span className="block text-xs font-bold text-slate-900 dark:text-white leading-tight">
                    {name || "Saikat Sarkar"}
                  </span>
                  <span className="block text-[10px] font-medium text-slate-400 leading-tight">
                    {roleLabel}
                  </span>
                </div>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-3.5 w-3.5 text-slate-400"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </Link>
            </div>
          </header>

          <div
            className={`erp-page-content ${
              isPos
                ? "relative flex flex-col flex-1 min-h-0 p-0 overflow-hidden"
                : "min-h-[calc(100vh-4rem)] p-4 sm:p-5 lg:p-6 pb-24 lg:pb-8"
            }`}
          >
            {!isPos && <GlobalQuickAccess />}
            {children}
          </div>
        </div>
        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
        <SAIBackgroundLayer />
        {!isPos && <MobileBottomNav />}
      </div>
    </DashboardShellProvider>
  );
}
