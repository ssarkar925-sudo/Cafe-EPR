"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AvatarModal from "./profile/avatar-modal";
import { useTheme, type AccentColor } from "./theme-provider";

export type BadgeTone = "emerald" | "amber" | "indigo" | "purple" | "rose" | "slate" | "blue";
export type NavChild = { label: string; href: string; icon?: string; badge?: { text: string; tone: BadgeTone } };
export type NavItem = {
  label: string;
  href: string;
  icon: string;
  badge?: { text: string; tone: BadgeTone };
  isSubItem?: boolean;
  isSubHeader?: boolean;
  children?: NavChild[];
};
export type NavSection = { id: string; title: string; icon: string; items: NavItem[] };

const BADGE_STYLES: Record<BadgeTone, string> = {
  emerald: "bg-emerald-500/15 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30",
  indigo: "bg-indigo-500/15 text-indigo-700 border-indigo-300 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30",
  purple: "bg-purple-500/15 text-purple-700 border-purple-300 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30",
  rose: "bg-rose-500/15 text-rose-700 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30",
  blue: "bg-blue-500/15 text-blue-700 border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30",
  slate: "bg-slate-500/15 text-slate-700 border-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/30",
};

export type AccentSidebarStyle = {
  logoBg: string;
  logoShadow: string;
  tagline: string;
  topExpandBtn: string;
  dashboardActive: string;
  dashboardIcon: string;
  dashboardPing: string;
  avatarBg: string;
};

const ACCENT_STYLES: Record<AccentColor, AccentSidebarStyle> = {
  violet: {
    logoBg: "bg-gradient-to-tr from-violet-600 to-indigo-600",
    logoShadow: "shadow-violet-500/25",
    tagline: "text-violet-600 dark:text-violet-400",
    topExpandBtn: "bg-violet-600 hover:bg-violet-500 shadow-violet-500/25",
    dashboardActive: "is-active bg-gradient-to-r from-violet-500/15 via-indigo-500/10 to-transparent text-violet-700 dark:text-violet-300 border border-violet-300/80 dark:border-violet-500/40 shadow-xs",
    dashboardIcon: "bg-violet-600 text-white shadow-xs dark:bg-violet-500",
    dashboardPing: "bg-violet-500",
    avatarBg: "bg-violet-600",
  },
  blue: {
    logoBg: "bg-gradient-to-tr from-blue-600 to-indigo-600",
    logoShadow: "shadow-blue-500/25",
    tagline: "text-blue-600 dark:text-blue-400",
    topExpandBtn: "bg-blue-600 hover:bg-blue-500 shadow-blue-500/25",
    dashboardActive: "is-active bg-gradient-to-r from-blue-500/15 via-indigo-500/10 to-transparent text-blue-700 dark:text-blue-300 border border-blue-300/80 dark:border-blue-500/40 shadow-xs",
    dashboardIcon: "bg-blue-600 text-white shadow-xs dark:bg-blue-500",
    dashboardPing: "bg-blue-500",
    avatarBg: "bg-blue-600",
  },
  emerald: {
    logoBg: "bg-gradient-to-tr from-emerald-600 to-teal-600",
    logoShadow: "shadow-emerald-500/25",
    tagline: "text-emerald-600 dark:text-emerald-400",
    topExpandBtn: "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/25",
    dashboardActive: "is-active bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-transparent text-emerald-700 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-500/40 shadow-xs",
    dashboardIcon: "bg-emerald-600 text-white shadow-xs dark:bg-emerald-500",
    dashboardPing: "bg-emerald-500",
    avatarBg: "bg-emerald-600",
  },
  amber: {
    logoBg: "bg-gradient-to-tr from-amber-600 to-orange-600",
    logoShadow: "shadow-amber-500/25",
    tagline: "text-amber-600 dark:text-amber-400",
    topExpandBtn: "bg-amber-600 hover:bg-amber-500 shadow-amber-500/25",
    dashboardActive: "is-active bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent text-amber-700 dark:text-amber-300 border border-amber-300/80 dark:border-amber-500/40 shadow-xs",
    dashboardIcon: "bg-amber-600 text-white shadow-xs dark:bg-amber-500",
    dashboardPing: "bg-amber-500",
    avatarBg: "bg-amber-600",
  },
  rose: {
    logoBg: "bg-gradient-to-tr from-rose-600 to-pink-600",
    logoShadow: "shadow-rose-500/25",
    tagline: "text-rose-600 dark:text-rose-400",
    topExpandBtn: "bg-rose-600 hover:bg-rose-500 shadow-rose-500/25",
    dashboardActive: "is-active bg-gradient-to-r from-rose-500/15 via-pink-500/10 to-transparent text-rose-700 dark:text-rose-300 border border-rose-300/80 dark:border-rose-500/40 shadow-xs",
    dashboardIcon: "bg-rose-600 text-white shadow-xs dark:bg-rose-500",
    dashboardPing: "bg-rose-500",
    avatarBg: "bg-rose-600",
  },
  cyan: {
    logoBg: "bg-gradient-to-tr from-cyan-600 to-blue-600",
    logoShadow: "shadow-cyan-500/25",
    tagline: "text-cyan-600 dark:text-cyan-400",
    topExpandBtn: "bg-cyan-600 hover:bg-cyan-500 shadow-cyan-500/25",
    dashboardActive: "is-active bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-transparent text-cyan-700 dark:text-cyan-300 border border-cyan-300/80 dark:border-cyan-500/40 shadow-xs",
    dashboardIcon: "bg-cyan-600 text-white shadow-xs dark:bg-cyan-500",
    dashboardPing: "bg-cyan-500",
    avatarBg: "bg-cyan-600",
  },
};

export type DomainTheme = {
  headerText: string;
  headerDot: string;
  iconBg: string;
  hoverBg: string;
  hoverText: string;
  activeBg: string;
  activeIconBg: string;
};

const DOMAIN_THEMES: Record<string, DomainTheme> = {
  dashboard: {
    headerText: "text-indigo-600 dark:text-indigo-400",
    headerDot: "bg-indigo-500",
    iconBg: "bg-indigo-500/15 text-indigo-600 dark:bg-indigo-500/25 dark:text-indigo-400",
    hoverBg: "hover:bg-indigo-50/80 dark:hover:bg-indigo-950/40",
    hoverText: "hover:text-indigo-700 dark:hover:text-indigo-300",
    activeBg: "is-active bg-indigo-50/90 text-indigo-800 font-bold border-indigo-300/80 shadow-2xs dark:bg-indigo-950/50 dark:text-indigo-200 dark:border-indigo-500/40",
    activeIconBg: "bg-indigo-600 text-white shadow-xs dark:bg-indigo-500",
  },
  sales: {
    headerText: "text-emerald-600 dark:text-emerald-400",
    headerDot: "bg-emerald-500",
    iconBg: "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/25 dark:text-emerald-400",
    hoverBg: "hover:bg-emerald-50/80 dark:hover:bg-emerald-950/40",
    hoverText: "hover:text-emerald-700 dark:hover:text-emerald-300",
    activeBg: "is-active bg-emerald-50/90 text-emerald-800 font-bold border-emerald-300/80 shadow-2xs dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-500/40",
    activeIconBg: "bg-emerald-600 text-white shadow-xs dark:bg-emerald-500",
  },
  fintech: {
    headerText: "text-sky-600 dark:text-sky-400",
    headerDot: "bg-sky-500",
    iconBg: "bg-sky-500/15 text-sky-600 dark:bg-sky-500/25 dark:text-sky-400",
    hoverBg: "hover:bg-sky-50/80 dark:hover:bg-sky-950/40",
    hoverText: "hover:text-sky-700 dark:hover:text-sky-300",
    activeBg: "is-active bg-sky-50/90 text-sky-800 font-bold border-sky-300/80 shadow-2xs dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-500/40",
    activeIconBg: "bg-sky-600 text-white shadow-xs dark:bg-sky-500",
  },
  bbps: {
    headerText: "text-purple-600 dark:text-purple-400",
    headerDot: "bg-purple-500",
    iconBg: "bg-purple-500/15 text-purple-600 dark:bg-purple-500/25 dark:text-purple-400",
    hoverBg: "hover:bg-purple-50/80 dark:hover:bg-purple-950/40",
    hoverText: "hover:text-purple-700 dark:hover:text-purple-300",
    activeBg: "is-active bg-purple-50/90 text-purple-800 font-bold border-purple-300/80 shadow-2xs dark:bg-purple-950/50 dark:text-purple-200 dark:border-purple-500/40",
    activeIconBg: "bg-purple-600 text-white shadow-xs dark:bg-purple-500",
  },
  finance: {
    headerText: "text-amber-600 dark:text-amber-400",
    headerDot: "bg-amber-500",
    iconBg: "bg-amber-500/15 text-amber-600 dark:bg-amber-500/25 dark:text-amber-400",
    hoverBg: "hover:bg-amber-50/80 dark:hover:bg-amber-950/40",
    hoverText: "hover:text-amber-700 dark:hover:text-amber-300",
    activeBg: "is-active bg-amber-50/90 text-amber-800 font-bold border-amber-300/80 shadow-2xs dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-500/40",
    activeIconBg: "bg-amber-600 text-white shadow-xs dark:bg-amber-500",
  },
  reports: {
    headerText: "text-blue-600 dark:text-blue-400",
    headerDot: "bg-blue-500",
    iconBg: "bg-blue-500/15 text-blue-600 dark:bg-blue-500/25 dark:text-blue-400",
    hoverBg: "hover:bg-blue-50/80 dark:hover:bg-blue-950/40",
    hoverText: "hover:text-blue-700 dark:hover:text-blue-300",
    activeBg: "is-active bg-blue-50/90 text-blue-800 font-bold border-blue-300/80 shadow-2xs dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-500/40",
    activeIconBg: "bg-blue-600 text-white shadow-xs dark:bg-blue-500",
  },
  catalog: {
    headerText: "text-orange-600 dark:text-orange-400",
    headerDot: "bg-orange-500",
    iconBg: "bg-orange-500/15 text-orange-600 dark:bg-orange-500/25 dark:text-orange-400",
    hoverBg: "hover:bg-orange-50/80 dark:hover:bg-orange-950/40",
    hoverText: "hover:text-orange-700 dark:hover:text-orange-300",
    activeBg: "is-active bg-orange-50/90 text-orange-800 font-bold border-orange-300/80 shadow-2xs dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-500/40",
    activeIconBg: "bg-orange-600 text-white shadow-xs dark:bg-orange-500",
  },
  inventory: {
    headerText: "text-teal-600 dark:text-teal-400",
    headerDot: "bg-teal-500",
    iconBg: "bg-teal-500/15 text-teal-600 dark:bg-teal-500/25 dark:text-teal-400",
    hoverBg: "hover:bg-teal-50/80 dark:hover:bg-teal-950/40",
    hoverText: "hover:text-teal-700 dark:hover:text-teal-300",
    activeBg: "is-active bg-teal-50/90 text-teal-800 font-bold border-teal-300/80 shadow-2xs dark:bg-teal-950/50 dark:text-teal-200 dark:border-teal-500/40",
    activeIconBg: "bg-teal-600 text-white shadow-xs dark:bg-teal-500",
  },
  ai: {
    headerText: "text-fuchsia-600 dark:text-fuchsia-400",
    headerDot: "bg-fuchsia-500",
    iconBg: "bg-fuchsia-500/15 text-fuchsia-600 dark:bg-fuchsia-500/25 dark:text-fuchsia-400",
    hoverBg: "hover:bg-fuchsia-50/80 dark:hover:bg-fuchsia-950/40",
    hoverText: "hover:text-fuchsia-700 dark:hover:text-fuchsia-300",
    activeBg: "is-active bg-fuchsia-50/90 text-fuchsia-800 font-bold border-fuchsia-300/80 shadow-2xs dark:bg-fuchsia-950/50 dark:text-fuchsia-200 dark:border-fuchsia-500/40",
    activeIconBg: "bg-fuchsia-600 text-white shadow-xs dark:bg-fuchsia-500",
  },
  admin: {
    headerText: "text-rose-600 dark:text-rose-400",
    headerDot: "bg-rose-500",
    iconBg: "bg-rose-500/15 text-rose-600 dark:bg-rose-500/25 dark:text-rose-400",
    hoverBg: "hover:bg-rose-50/80 dark:hover:bg-rose-950/40",
    hoverText: "hover:text-rose-700 dark:hover:text-rose-300",
    activeBg: "is-active bg-rose-50/90 text-rose-800 font-bold border-rose-300/80 shadow-2xs dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-500/40",
    activeIconBg: "bg-rose-600 text-white shadow-xs dark:bg-rose-500",
  },
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
  catalog: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6zm2 0v12h12V6H6zm2 2h8v2H8V8zm0 4h8v2H8v-2z",
  inventory: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  purchases: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0-4 0Zm-8 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  suppliers: "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm11 10v-6a2 2 0 0 0-2-2h-1m3 8h-4",
  brands: "M7 7h.01M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
  units: "M3 6h18M3 12h18M3 18h18",
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
  recharge: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  googlePlay: "M5 3l14 9-14 9V3z",
};

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
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
  onOpenSettings,
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
  onOpenSettings?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { accent, gradientEnabled } = useTheme();
  const activeAccent = ACCENT_STYLES[accent] || ACCENT_STYLES.violet;
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

  // 10 DOMAINS ARCHITECTURE (With Restored Catalog & Inventory below Domain 6)
  const sections: NavSection[] = useMemo(
    () => [
      // DOMAIN 2: SALES & COUNTER POS
      {
        id: "sales",
        title: "Sales & POS",
        icon: "pos",
        items: [
          { label: "POS Billing", href: "/pos", icon: "pos", badge: { text: "Live", tone: "emerald" } },
          { label: "Invoices History", href: "/invoices", icon: "invoices" },
          { label: "Customers & Khata", href: "/customers", icon: "customers" },
          { label: "Returns & Refunds", href: "/returns", icon: "returns" },
        ],
      },
      // DOMAIN 3: FINTECH, BANKING & CYBER SERVICES
      {
        id: "fintech",
        title: "Fintech & Banking Services",
        icon: "aeps",
        items: [
          { label: "AEPS Aadhaar ATM", href: "/business/aeps", icon: "aeps", badge: { text: "Live", tone: "emerald" } },
          { label: "DMT Remittance", href: "/business/dmt", icon: "dmt" },
          { label: "UPI Collections", href: "/business/upi", icon: "upi" },
        ],
      },
      // DOMAIN 4: BBPS & UTILITY BILLS
      {
        id: "bbps",
        title: "BBPS & Utilities",
        icon: "billPayment",
        items: [
          {
            label: "Services Hub",
            /* label: "Bill Payment" */
            href: "/business/bill-payment",
            icon: "billPayment",
            badge: { text: "BBPS", tone: "indigo" },
          },
        ],
      },
      // DOMAIN 5: FINANCE & DOUBLE-ENTRY ACCOUNTING
      {
        id: "finance",
        title: "Finance & Accounting",
        icon: "cashbook",
        items: [
          { label: "Finance Hub", href: "/finance", icon: "pnl" },
          { label: "Daily Cash Book", href: "/finance/cashbook", icon: "cashbook", badge: { text: "Today", tone: "amber" } },
          { label: "Expenses & Vouchers", href: "/finance/expenses", icon: "expenses" },
          { label: "Settlements & Float", href: "/finance/settlements", icon: "settlements" },
          { label: "Day Close Register", href: "/finance/day-close", icon: "dayclose" },
          { label: "Account Ledgers", href: "/finance/ledger", icon: "ledger" },
          { label: "Double-Entry Journal", href: "/finance/journal", icon: "ledger" },
          { label: "Reconciliation", href: "/finance/reconciliation", icon: "dayclose" },
          { label: "General Ledger", href: "/finance/general-ledger", icon: "ledger" },
          { label: "Chart of Accounts", href: "/finance/accounts", icon: "opening" },
          { label: "Transactions Feed", href: "/finance/transactions", icon: "transactions" },
          { label: "Trial Balance", href: "/finance/trial-balance", icon: "pnl" },
          { label: "Opening Balances", href: "/finance/opening-balances", icon: "opening" },
        ],
      },
      // DOMAIN 6: REPORTS, ANALYTICS & TAX COMPLIANCE
      {
        id: "reports",
        title: "Reports & Tax",
        icon: "reports",
        items: [
          { label: "Reports Studio", href: "/reports", icon: "reports" },
          { label: "Income Breakdown", href: "/reports/income", icon: "pnl" },
          { label: "Profit & Loss (P&L)", href: "/finance/pnl", icon: "pnl" },
          { label: "Cash & Bank Report", href: "/reports/cash-bank", icon: "cashbook" },
          { label: "Tax Prep (Sec 44AD)", href: "/reports/tax-preparation", icon: "tax" },
          { label: "GST Compliance", href: "/reports/gst", icon: "gst" },
          { label: "Transaction Audit", href: "/reports/transaction-audit", icon: "audit" },
        ],
      },
      // DOMAIN 7: CATALOG & ITEM MASTERS (RESTORED BELOW DOMAIN 6)
      {
        id: "catalog",
        title: "Catalog Masters",
        icon: "products",
        items: [
          { label: "Catalog Hub", href: "/catalog", icon: "catalog" },
          { label: "Products Master", href: "/catalog/products", icon: "products" },
          { label: "Services Master", href: "/catalog/services", icon: "services" },
          { label: "Categories Master", href: "/catalog/categories", icon: "categories" },
          { label: "Brands Master", href: "/catalog/brands", icon: "brands" },
          { label: "Units of Measure", href: "/catalog/units", icon: "units" },
        ],
      },
      // DOMAIN 8: INVENTORY & PROCUREMENT (RESTORED BELOW DOMAIN 6)
      {
        id: "inventory",
        title: "Inventory & Stock",
        icon: "inventory",
        items: [
          { label: "Stock Inventory", href: "/inventory", icon: "inventory" },
          { label: "Stock Movements", href: "/inventory/movements", icon: "transactions" },
          { label: "Purchases List", href: "/purchases", icon: "purchases" },
          { label: "Purchase Inward Entry", href: "/purchases/entry", icon: "purchases" },
          { label: "Suppliers Directory", href: "/suppliers", icon: "suppliers" },
        ],
      },
      // DOMAIN 9: AI & INTELLIGENT AUTOMATION
      {
        id: "ai",
        title: "AI & Automation",
        icon: "ai",
        items: [
          { label: "AI Command Center", href: "/ai-agent", icon: "ai", badge: { text: "AI", tone: "purple" } },
          { label: "AI Financial Audit", href: "/ai/self-audit", icon: "audit" },
          { label: "WhatsApp Desk", href: "/business/whatsapp", icon: "whatsapp" },
        ],
      },
      // DOMAIN 10: ADMINISTRATION, SECURITY & SYSTEM
      {
        id: "admin",
        title: "Admin & Security",
        icon: "security",
        items: [
          { label: "Staff & Roles", href: "/staff", icon: "staff" },
          { label: "Security Center", href: "/security", icon: "security" },
          { label: "System Audit Logs", href: "/audit", icon: "audit" },
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

  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    return {
      sales: true,
      fintech: true,
      bbps: true,
      finance: true,
      reports: false,
      catalog: true,
      inventory: true,
      ai: false,
      admin: false,
    };
  });

  // Auto-expand the domain section containing the active path
  useEffect(() => {
    sections.forEach((sec) => {
      const hasActive = sec.items.some((it) => isItemActive(it.href));
      if (hasActive) {
        setExpandedSections((prev) => ({ ...prev, [sec.id]: true }));
      }
    });
  }, [pathname, searchParams]);

  function toggleSection(sectionId: string) {
    setExpandedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition-opacity lg:hidden"
        />
      )}

      {/* LEFT SIDEBAR (LIGHT & DARK THEMED WITH RICH AMBIENT GRADIENTS) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-300 ${
          gradientEnabled
            ? "border-r border-slate-200/80 bg-white/78 backdrop-blur-2xl text-slate-800 shadow-lg dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-200 dark:shadow-2xl"
            : "border-r border-slate-200/90 bg-gradient-to-b from-white via-slate-50/90 to-slate-100/50 text-slate-800 shadow-md dark:border-slate-800 dark:bg-gradient-to-b dark:from-[#0b101d] dark:via-[#0f172a] dark:to-[#080d19] dark:text-slate-200 dark:shadow-2xl"
        } ${
          collapsed ? "w-[72px]" : "w-60 xl:w-64"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* BRAND HEADER */}
        {collapsed ? (
          <div className="flex h-16 shrink-0 items-center justify-center border-b border-slate-200/80 dark:border-slate-800 px-2 py-2">
            <button
              type="button"
              onClick={onToggle}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${activeAccent.topExpandBtn} text-white shadow-md transition-all active:scale-95`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5">
                <path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 dark:border-slate-800 px-4">
            <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden min-w-0">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${activeAccent.logoBg} text-white shadow-md ${activeAccent.logoShadow}`}>
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
                  <span className="truncate text-base font-bold text-slate-900 dark:text-white tracking-tight">
                    {shopName || "CafeERP"}
                  </span>
                </div>
                <span className={`block truncate text-[10px] font-semibold ${activeAccent.tagline}`}>
                  Retail • Services • Finance
                </span>
              </div>
            </Link>
            <button
              type="button"
              onClick={onToggle}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white transition"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="8" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </button>

            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={onMobileClose}
              aria-label="Close sidebar"
              title="Close sidebar"
              className="flex lg:hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700/80 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* NAVIGATION ITEMS */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3.5 custom-scrollbar">
          
          {/* DOMAIN 1: TOP DASHBOARD ITEM (ENLARGED & VIBRANT WITH ANIMATED ICON) */}
          <div>
            <Link
              href="/dashboard"
              onClick={onMobileClose}
              title={collapsed ? "Dashboard" : undefined}
              className={`group flex items-center justify-between rounded-xl px-3 py-2 text-sm font-bold transition-all ${
                isDashboardActive
                  ? activeAccent.dashboardActive
                  : `text-slate-700 hover:bg-slate-100/70 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/50 dark:hover:text-white`
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-115 group-hover:rotate-6 ${
                    isDashboardActive
                      ? activeAccent.dashboardIcon
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  <Icon d={ICONS.dashboard} className="h-4 w-4" />
                </span>
                {!collapsed && <span>Dashboard</span>}
              </div>
              {!collapsed && isDashboardActive && (
                <span className={`h-2 w-2 rounded-full ${activeAccent.dashboardPing} animate-ping`} />
              )}
            </Link>
          </div>

          {/* DOMAINS 2 TO 10: COLLAPSIBLE ACCORDION GROUPS WITH BESPOKE DOMAIN COLOURS & ANIMATED ICONS */}
          {sections.map((section) => {
            const isExpanded = expandedSections[section.id] ?? false;
            const theme = DOMAIN_THEMES[section.id] || DOMAIN_THEMES.dashboard;
            return (
              <div key={section.id} className="space-y-1">
                {!collapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    className={`flex w-full items-center justify-between px-2 pt-2 pb-1 text-[11px] font-black uppercase tracking-wider ${theme.headerText} hover:opacity-85 transition`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${theme.headerDot}`} />
                      <span>{section.title}</span>
                    </div>
                    <span
                      className={`text-slate-400 dark:text-slate-500 transition-transform duration-200 ${
                        isExpanded ? "rotate-90" : "rotate-0"
                      }`}
                    >
                      ›
                    </span>
                  </button>
                ) : (
                  <div className="h-px bg-slate-200 dark:bg-slate-800/80 my-2" />
                )}

                {/* Sub-items (visible if expanded or if collapsed rail mode) */}
                {(isExpanded || collapsed) && (
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const isActive = isItemActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onMobileClose}
                          title={collapsed ? item.label : undefined}
                          className={`group flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] transition-all ${
                            isActive
                              ? `is-active font-bold border ${theme.activeBg}`
                              : `text-slate-700 font-semibold dark:text-slate-200 ${theme.hoverBg} ${theme.hoverText}`
                          } ${item.isSubItem && !collapsed ? "pl-5" : ""}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all duration-300 ${
                                isActive
                                  ? theme.activeIconBg
                                  : `${theme.iconBg} group-hover:scale-125 ${
                                      item.icon === "settings"
                                        ? "group-hover:rotate-90"
                                        : item.icon === "dmt"
                                        ? "group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                                        : item.icon === "billPayment" || item.icon === "recharge"
                                        ? "group-hover:rotate-12"
                                        : item.icon === "pos" || item.icon === "purchases"
                                        ? "group-hover:-rotate-6"
                                        : "group-hover:rotate-6"
                                    }`
                              }`}
                            >
                              {item.isSubItem ? (
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">└</span>
                              ) : (
                                <Icon d={ICONS[item.icon] || ICONS.dashboard} className="h-3.5 w-3.5" />
                              )}
                            </span>
                            {!collapsed && <span className="truncate">{item.label}</span>}
                          </div>
                          {!collapsed && item.badge && (
                            <span
                              className={`rounded-full border px-1.5 py-0.2 text-[8.5px] font-bold uppercase ${
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
                )}
              </div>
            );
          })}

          {/* DOMAIN 11: SETTINGS COMMAND TRIGGER CARD (WITH ROTATING ANIMATED GEAR) */}
          <div className="pt-2">
            <Link
              href="/settings"
              onClick={onMobileClose}
              title={collapsed ? "Settings & System Control Center" : undefined}
              className={`group flex w-full items-center justify-between rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/90 to-blue-50/80 px-3 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 hover:border-indigo-300 dark:border-indigo-500/30 dark:bg-gradient-to-r dark:from-indigo-950/40 dark:to-blue-950/30 dark:text-indigo-300 dark:hover:border-indigo-500/50 ${
                pathname === "/settings"
                  ? "is-active bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/40 dark:text-white"
                  : ""
              } ${
                collapsed ? "justify-center px-2" : ""
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs group-hover:rotate-90 transition-transform duration-500">
                  <Icon d={ICONS.settings} className="h-3.5 w-3.5" />
                </span>
                {!collapsed && <span>Settings Command</span>}
              </div>
              {!collapsed && (
                <span className="rounded-md border border-indigo-200 bg-white px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 shadow-2xs dark:border-indigo-500/30 dark:bg-indigo-950/50 dark:text-indigo-300">
                  Settings →
                </span>
              )}
            </Link>
          </div>

        </div>

        {/* BOTTOM USER PROFILE STRIP */}
        <div
          className={`border-t px-3 py-2.5 shrink-0 transition-colors ${
            gradientEnabled
              ? "border-slate-200/60 bg-white/40 dark:border-white/10 dark:bg-white/5"
              : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-[#0c1322]"
          }`}
        >
          <div className="flex items-center justify-between">
            <Link
              href="/settings"
              onClick={onMobileClose}
              title="Click to open Settings & System Control Center"
              className="flex flex-1 items-center gap-2.5 rounded-lg p-1 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 cursor-pointer transition min-w-0"
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${activeAccent.avatarBg} text-xs font-bold text-white shadow-sm overflow-hidden`}
              >
                {currentAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentAvatar} alt="" className="h-8 w-8 object-cover" />
                ) : (
                  (name || "Saikat Sarkar").slice(0, 2).toUpperCase()
                )}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">
                    {name || "Saikat Sarkar"}
                  </span>
                  <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    {role || "Super Admin"}
                  </span>
                </div>
              )}
            </Link>

            {!collapsed && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleSignOut}
                  title="Sign Out"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition"
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
