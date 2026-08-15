"use client";

import { useEffect, useState } from "react";
import Sidebar from "./sidebar";

const COLLAPSE_KEY = "sccomm-sidebar-collapsed";

export default function DashboardShell({
  name,
  email,
  role,
  shopName,
  logoUrl,
  children,
}: {
  name: string;
  email: string;
  role: string;
  shopName: string;
  logoUrl: string | null;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div className="min-h-screen">
      <Sidebar
        name={name}
        email={email}
        role={role}
        shopName={shopName}
        logoUrl={logoUrl}
        collapsed={collapsed}
        onToggle={toggle}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Mobile topbar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
          aria-label="Open menu"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{shopName}</p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
          {(name || "U").slice(0, 1).toUpperCase()}
        </div>
      </header>

      <main className={`transition-all duration-300 ${collapsed ? "lg:pl-[76px]" : "lg:pl-72"}`}>
        {children}
      </main>
    </div>
  );
}
