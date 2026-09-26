"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "./sidebar";
import GlobalSearch from "./global-search";
import GlobalQuickAccess from "./global-quick-access";
import NotificationBell from "./notification-bell";
import ThemeToggle from "./theme-toggle";
import MobileBottomNav from "./mobile-bottom-nav";
import SettingsModal from "./settings/settings-modal";
import { DashboardShellProvider } from "./dashboard-shell-context";

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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pathname = usePathname();
  const isPos = pathname === "/pos";

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
        setSettingsOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname]);

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
    settingsOpen,
    setSettingsOpen,
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
        className="modern-erp erp-app-shell min-h-screen bg-[#f8fafc] text-slate-900 dark:bg-slate-950 dark:text-white"
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
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {/* MOBILE HEADER (Reference: Left hamburger, CafeERP brand, Red Bell, Avatar) */}
        {!isPos && (
          <header className="erp-mobile-header sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
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
            </div>

            <div className="flex items-center gap-2">
              <NotificationBell role={role} />
              <Avatar name={name || "Saikat Sarkar"} avatarUrl={avatarUrl} size="h-7 w-7" />
            </div>
          </header>
        )}

        <div
          style={workspaceStyle}
          className={`erp-workspace ${
            collapsed ? "lg:pl-[72px]" : "lg:pl-60 xl:pl-64"
          } ${isPos ? "is-pos" : ""} min-h-screen transition-all duration-300`}
        >
          {/* DESKTOP HEADER (Reference: Left hamburger, Wide search, Right red bell, help, theme toggle, Saikat Sarkar Owner • Admin) */}
          {!isPos && (
            <header className="erp-desktop-header sticky top-0 z-30 hidden lg:flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/95 px-6 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 transition-all duration-300">
              <div className="flex items-center gap-4 flex-1 max-w-2xl min-w-0">
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

              <div className="flex items-center gap-3 shrink-0 ml-4">
                <NotificationBell role={role} />

                <Link
                  href="/ai-agent"
                  title="Help"
                  aria-label="Help"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4.5 w-4.5">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </Link>

                <ThemeToggle />

                <div
                  onClick={() => setSettingsOpen(true)}
                  className="flex items-center gap-2.5 rounded-lg pl-2 transition hover:opacity-85 cursor-pointer"
                  title="Settings & System Control Center (Ctrl + ,)"
                >
                  <Avatar name={name || "Saikat Sarkar"} avatarUrl={avatarUrl} size="h-8 w-8" />
                  <div className="text-left hidden sm:block">
                    <span className="block text-xs font-bold text-slate-900 dark:text-white leading-tight">
                      {name || "Saikat Sarkar"}
                    </span>
                    <span className="block text-[10px] font-medium text-slate-400 leading-tight">
                      Owner • Admin
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
                </div>
              </div>
            </header>
          )}

          <div
            className={`erp-page-content ${
              isPos
                ? "relative h-[100dvh] min-h-0 p-0 overflow-hidden"
                : "min-h-[calc(100vh-4rem)] p-4 sm:p-5 lg:p-6 pb-24 lg:pb-8"
            }`}
          >
            {!isPos && <GlobalQuickAccess />}
            {children}
          </div>
        </div>

        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        {!isPos && <MobileBottomNav />}
      </div>
    </DashboardShellProvider>
  );
}
