"use client";

import React, { createContext, useContext } from "react";

export interface DashboardShellContextValue {
  collapsed: boolean;
  toggleSidebar: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  name: string;
  email: string;
  role: string;
  shopName: string;
  logoUrl: string | null;
  avatarUrl: string | null;
  userId?: string;
  settingsOpen?: boolean;
  setSettingsOpen?: (open: boolean) => void;
}

const DashboardShellContext = createContext<DashboardShellContextValue | null>(null);

export function DashboardShellProvider({
  value,
  children,
}: {
  value: DashboardShellContextValue;
  children: React.ReactNode;
}) {
  return (
    <DashboardShellContext.Provider value={value}>
      {children}
    </DashboardShellContext.Provider>
  );
}

export function useDashboardShell(): DashboardShellContextValue {
  const context = useContext(DashboardShellContext);
  if (!context) {
    // Graceful fallback for components rendered outside DashboardShell
    return {
      collapsed: false,
      toggleSidebar: () => {},
      mobileOpen: false,
      setMobileOpen: () => {},
      searchOpen: false,
      setSearchOpen: () => {},
      name: "Operator",
      email: "",
      role: "admin",
      shopName: "Cafe ERP",
      logoUrl: null,
      avatarUrl: null,
    };
  }
  return context;
}
