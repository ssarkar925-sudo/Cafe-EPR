"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRealtime } from "@/lib/supabase/realtime";
import { type VerifiedFinancialContext } from "@/lib/ai/advisor-engine";

export type DashboardClientProps = {
  data: any;
  verifiedContext?: VerifiedFinancialContext;
};

function inr(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "₹0.00";
  return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Vector icon system for quick actions and dashboard
function ActionVectorIcon({ icon, className = "h-4 w-4" }: { icon: string; className?: string }) {
  // Normalize legacy emojis or keys to vector paths
  switch (icon) {
    case "new-sale":
    case "pos":
    case "🧾":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      );
    case "quick-sale":
    case "zap":
    case "⚡":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case "customer-crm":
    case "customers":
    case "👤":
    case "👥":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "cash-book":
    case "cashbook":
    case "book":
    case "📖":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case "aeps":
    case "atm":
    case "🏧":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <circle cx="7" cy="15" r="1" />
          <circle cx="12" cy="15" r="1" />
        </svg>
      );
    case "dmt":
    case "transfer":
    case "💸":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      );
    case "expenses":
    case "trending-down":
    case "📉":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
          <polyline points="17 18 23 18 23 12" />
        </svg>
      );
    case "day-close":
    case "dayclose":
    case "lock":
    case "🔒":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case "invoices":
    case "document":
    case "📄":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case "returns":
    case "↶":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      );
    case "products":
    case "package":
    case "📦":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case "services":
    case "tag":
    case "🏷️":
    case "✦":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      );
    case "purchases":
    case "cart":
    case "🛒":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      );
    case "suppliers":
    case "truck":
    case "🚚":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      );
    case "upi":
    case "mobile":
    case "📱":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      );
    case "bill-payment":
    case "recharge":
    case "📲":
    case "💳":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      );
    case "journal":
    case "scale":
    case "⚖️":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      );
    case "trial-balance":
    case "clipboard":
    case "📋":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <path d="M9 14h6" />
          <path d="M9 18h6" />
          <path d="M9 10h6" />
        </svg>
      );
    case "banks":
    case "bank":
    case "🏛️":
    case "🏦":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <line x1="3" y1="21" x2="21" y2="21" />
          <line x1="6" y1="18" x2="6" y2="11" />
          <line x1="10" y1="18" x2="10" y2="11" />
          <line x1="14" y1="18" x2="14" y2="11" />
          <line x1="18" y1="18" x2="18" y2="11" />
          <polygon points="12 2 20 7 4 7" />
        </svg>
      );
    case "settlements":
    case "refresh":
    case "🔄":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      );
    case "pnl":
    case "trending-up":
    case "📈":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      );
    case "reports":
    case "bar-chart":
    case "📊":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case "tax-prep":
    case "tax":
    case "📑":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    case "self-audit":
    case "shield":
    case "🛡️":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "ai":
    case "sparkles":
    case "🤖":
    case "✨":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      );
    case "settings":
    case "gear":
    case "⚙️":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
  }
}

export default function DashboardClient({ data }: DashboardClientProps) {
  useRealtime(["invoices", "payments", "cash_entries", "expenses", "settlements", "transactions", "day_closes", "products", "customers", "audit_runs"]);

  const [selectedPeriod, setSelectedPeriod] = useState<"today" | "yesterday" | "week" | "month" | "ytd">("today");
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [greeting, setGreeting] = useState<string>("Good day");
  const [hoveredPoint, setHoveredPoint] = useState<{ label: string; revenue: number; expenses: number } | null>(null);
  const [quickActions, setQuickActions] = useState<Array<{ id: string; label: string; href: string; icon: string }>>([]);
  const [isQuickActionsEditorOpen, setIsQuickActionsEditorOpen] = useState(false);

  const defaultQuickActions = useMemo(() => [
    { id: "new-sale", label: "New Sale", href: "/pos", icon: "new-sale" },
    { id: "quick-sale", label: "Quick Sale", href: "/pos?mode=quick", icon: "quick-sale" },
    { id: "customer-crm", label: "Customer CRM", href: "/customers", icon: "customer-crm" },
    { id: "cash-book", label: "Cash Book", href: "/finance/cashbook", icon: "cash-book" },
    { id: "aeps", label: "AEPS ATM", href: "/business/aeps", icon: "aeps" },
    { id: "dmt", label: "Money Transfer", href: "/business/dmt", icon: "dmt" },
    { id: "expenses", label: "Expenses", href: "/finance/expenses", icon: "expenses" },
    { id: "day-close", label: "Day Close", href: "/finance/day-close", icon: "day-close" },
  ], []);

  const quickActionCatalog = useMemo(() => [
    ...defaultQuickActions,
    { id: "invoices", label: "Invoices", href: "/invoices", icon: "invoices" },
    { id: "returns", label: "Returns", href: "/returns", icon: "returns" },
    { id: "products", label: "Products Catalog", href: "/catalog/products", icon: "products" },
    { id: "services", label: "Services Rate Card", href: "/catalog/services", icon: "services" },
    { id: "purchases", label: "Purchases Entry", href: "/purchases/entry", icon: "purchases" },
    { id: "suppliers", label: "Suppliers", href: "/suppliers", icon: "suppliers" },
    { id: "upi", label: "UPI Collections", href: "/business/upi", icon: "upi" },
    { id: "bill-payment", label: "Bill & Recharge", href: "/business/bill-payment", icon: "bill-payment" },
    { id: "journal", label: "Double-Entry Journal", href: "/finance/journal", icon: "journal" },
    { id: "trial-balance", label: "Trial Balance", href: "/finance/trial-balance", icon: "trial-balance" },
    { id: "banks", label: "Bank Accounts", href: "/business/banks", icon: "banks" },
    { id: "settlements", label: "Settlements", href: "/finance/settlements", icon: "settlements" },
    { id: "pnl", label: "Profit & Loss", href: "/finance/pnl", icon: "pnl" },
    { id: "reports", label: "Reports Hub", href: "/reports", icon: "reports" },
    { id: "tax-prep", label: "Tax Prep / ITR", href: "/reports/tax-preparation", icon: "tax-prep" },
    { id: "self-audit", label: "Self-Audit", href: "/ai/self-audit", icon: "self-audit" },
    { id: "ai", label: "AI Advisor", href: "/ai", icon: "ai" },
    { id: "settings", label: "Settings", href: "/settings", icon: "settings" },
  ], [defaultQuickActions]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("cafe-erp-dashboard-quick-actions");
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter((item: any) =>
          item && typeof item.id === "string" && typeof item.label === "string" &&
          typeof item.href === "string" && typeof item.icon === "string"
        );
        setQuickActions(valid.length > 0 ? valid : defaultQuickActions);
      } else {
        setQuickActions(defaultQuickActions);
      }
    } catch {
      setQuickActions(defaultQuickActions);
    }
  }, [defaultQuickActions]);

  const saveQuickActions = (next: Array<{ id: string; label: string; href: string; icon: string }>) => {
    setQuickActions(next);
    try {
      window.localStorage.setItem("cafe-erp-dashboard-quick-actions", JSON.stringify(next));
    } catch {}
  };

  const moveQuickAction = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= quickActions.length) return;
    const next = [...quickActions];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    saveQuickActions(next);
  };

  const updateQuickAction = (id: string, patch: Partial<{ label: string; href: string; icon: string }>) => {
    saveQuickActions(quickActions.map((action) => action.id === id ? { ...action, ...patch } : action));
  };

  const addQuickAction = (id: string) => {
    const action = quickActionCatalog.find((item) => item.id === id);
    if (!action || quickActions.some((item) => item.id === id)) return;
    saveQuickActions([...quickActions, action]);
  };

  const removeQuickAction = (id: string) => {
    if (quickActions.length <= 1) return;
    saveQuickActions(quickActions.filter((action) => action.id !== id));
  };

  const resetQuickActions = () => {
    saveQuickActions(defaultQuickActions);
  };

  useEffect(() => {
    const updateDateTimeAndGreeting = () => {
      const now = new Date();
      const h = now.getHours();
      if (h < 12) {
        setGreeting("Good morning");
      } else if (h < 17) {
        setGreeting("Good afternoon");
      } else {
        setGreeting("Good evening");
      }
      setCurrentDate(now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }));
      setCurrentTime(now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };

    updateDateTimeAndGreeting();
    const timer = setInterval(updateDateTimeAndGreeting, 1000);
    return () => clearInterval(timer);
  }, []);

  const role = data.profile.role;
  const isStaff = role === "staff";
  const isAdmin = role === "admin" || !role;

  // Active Period Metrics
  const activeMetrics = useMemo(() => {
    switch (selectedPeriod) {
      case "yesterday":
        return {
          label: "Yesterday",
          revenue: data.morningBrief.yesterdayRevenue,
          expenses: data.morningBrief.yesterdayExpenses,
          profit: data.morningBrief.yesterdayProfit,
          margin: data.morningBrief.yesterdayRevenue > 0
            ? Math.round((data.morningBrief.yesterdayProfit / data.morningBrief.yesterdayRevenue) * 1000) / 10
            : 0,
          txCount: 0,
        };
      case "week":
        return {
          label: "This Week",
          revenue: data.salesPerformance.thisWeek.revenue,
          expenses: data.salesPerformance.thisWeek.revenue - data.salesPerformance.thisWeek.profit,
          profit: data.salesPerformance.thisWeek.profit,
          margin: data.salesPerformance.thisWeek.margin,
          txCount: data.salesPerformance.thisWeek.txCount,
        };
      case "month":
        return {
          label: "This Month",
          revenue: data.salesPerformance.thisMonth.revenue,
          expenses: data.salesPerformance.thisMonth.revenue - data.salesPerformance.thisMonth.profit,
          profit: data.salesPerformance.thisMonth.profit,
          margin: data.salesPerformance.thisMonth.margin,
          txCount: data.salesPerformance.thisMonth.txCount,
        };
      case "ytd":
        return {
          label: `${data.shop.fyLabel} YTD`,
          revenue: data.pnl.operatingRevenue,
          expenses: data.pnl.expenses,
          profit: data.pnl.businessProfitBeforeTax,
          margin: data.pnl.netMarginPct,
          txCount: data.salesPerformance.fyYtd.txCount,
        };
      case "today":
      default:
        return {
          label: "Today",
          revenue: data.todayMetrics.revenue,
          expenses: data.todayMetrics.expenses,
          profit: data.todayMetrics.profit,
          margin: data.todayMetrics.revenue > 0
            ? Math.round((data.todayMetrics.profit / data.todayMetrics.revenue) * 1000) / 10
            : 0,
          txCount: data.todayMetrics.transactionCount,
        };
    }
  }, [selectedPeriod, data]);

  const pools = data.liquidity.pools;
  const healthBadge = {
    operational: { label: "100% Operational", bg: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400", dot: "bg-emerald-500" },
    attention: { label: "Attention Required", bg: "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400", dot: "bg-amber-500" },
    critical: { label: "Critical Issue", bg: "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400", dot: "bg-rose-500" },
  }[data.shop.systemHealth as "operational" | "attention" | "critical"] || { label: "Operational", bg: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", dot: "bg-emerald-500" };

  // Performance Chart Points
  const chartDays = data.chartDays || [];
  const actualPeakRevenue = chartDays.length > 0 ? Math.max(0, ...chartDays.map((d: any) => Number(d.revenue || 0))) : 0;
  const chartScaleMax = actualPeakRevenue > 0 ? actualPeakRevenue : 100;
  const chartPoints = useMemo(() => {
    if (chartDays.length === 0) return "";
    return chartDays.map((d: any, idx: number) => {
      const x = (idx / (chartDays.length - 1)) * 560 + 20;
      const y = 160 - (d.revenue / chartScaleMax) * 130;
      return `${x},${y}`;
    }).join(" ");
  }, [chartDays, chartScaleMax]);

  const chartAreaPath = useMemo(() => {
    if (chartDays.length === 0) return "";
    const firstX = 20;
    const lastX = 580;
    return `M 20 160 L ${chartPoints.split(" ").join(" L ")} L ${lastX} 160 Z`;
  }, [chartDays, chartPoints]);

  const totalServiceVol = (data.serviceBreakdown?.aeps?.volume || 0) +
    (data.serviceBreakdown?.dmt?.volume || 0) +
    (data.serviceBreakdown?.upi?.volume || 0) +
    (data.serviceBreakdown?.recharge?.volume || 0);

  const aepsPct = totalServiceVol > 0 ? Math.round(((data.serviceBreakdown?.aeps?.volume || 0) / totalServiceVol) * 100) : 0;
  const dmtPct = totalServiceVol > 0 ? Math.round(((data.serviceBreakdown?.dmt?.volume || 0) / totalServiceVol) * 100) : 0;
  const upiPct = totalServiceVol > 0 ? Math.round(((data.serviceBreakdown?.upi?.volume || 0) / totalServiceVol) * 100) : 0;
  const rechargePct = totalServiceVol > 0 ? Math.round(((data.serviceBreakdown?.recharge?.volume || 0) / totalServiceVol) * 100) : 0;

  return (
    <div className="space-y-6 pb-16">
      {/* ===============================================================================
          1. REFINED EXECUTIVE HEADER (Modern Floating Frosted Glass Canvas)
      =============================================================================== */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-5 shadow-xs backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/85 sm:p-6 transition-all">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${healthBadge.bg}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${healthBadge.dot}`} />
                {healthBadge.label}
              </span>
              <span className="rounded-full border border-blue-200 bg-blue-50/80 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
                {data.shop.fyLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                {currentDate ? `${currentDate} • ${currentTime}` : "Today • Live"}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:bg-white/10 dark:text-slate-300">
                {role.toUpperCase()}
              </span>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {greeting}, {data.profile.name?.split(" ")[0] || "Saikat"}
              </p>
              <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
                Here&apos;s your business overview.
              </h1>
            </div>
          </div>

          {/* Period Selector Tabs */}
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 dark:border-white/10 dark:bg-white/[0.04] backdrop-blur-md">
            {[
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "week", label: "This Week" },
              { id: "month", label: "This Month" },
              { id: "ytd", label: "FY YTD" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedPeriod(tab.id as any)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
                  selectedPeriod === tab.id
                    ? "bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/25 scale-[1.02]"
                    : "text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-xs dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===============================================================================
          2. PRIMARY KPI ROW (5 Multi-Tone Glowing Bento Cards)
      =============================================================================== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* KPI 1: Gross Sales & Revenue (Emerald Multi-Tone Glow) */}
        <div className="bento-surface-interactive card-glow-emerald group flex flex-col justify-between p-5 rounded-2xl border border-emerald-500/25 bg-white/90 dark:bg-slate-900/90 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-500/10">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{activeMetrics.label} Revenue</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 text-emerald-600 shadow-xs dark:text-emerald-400 group-hover:scale-110 transition-transform">
              <ActionVectorIcon icon="pnl" className="h-4 w-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900 sm:text-3xl dark:text-white tracking-tight">
              {inr(activeMetrics.revenue)}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                Operating Inflow
              </span>
              <p className="text-[11px] font-medium text-slate-500 truncate dark:text-slate-400">
                {activeMetrics.txCount > 0 ? `${activeMetrics.txCount} txns` : "Verified"}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-emerald-100/60 pt-2 text-[11px] text-slate-500 dark:border-white/5">
            <span>Canonical P&amp;L</span>
            <Link href="/invoices" className="font-bold text-emerald-600 hover:underline dark:text-emerald-400">Sales →</Link>
          </div>
        </div>

        {/* KPI 2: Business Net Profit (Indigo Multi-Tone Glow) */}
        <div className="bento-surface-interactive card-glow-indigo group flex flex-col justify-between p-5 rounded-2xl border border-indigo-500/25 bg-white/90 dark:bg-slate-900/90 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">{activeMetrics.label} Net Profit</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/10 text-indigo-600 shadow-xs dark:text-indigo-400 group-hover:scale-110 transition-transform">
              <ActionVectorIcon icon="cash-book" className="h-4 w-4" />
            </div>
          </div>
          <div className="my-2">
            <div className={`text-2xl font-black sm:text-3xl tracking-tight ${activeMetrics.profit >= 0 ? "text-indigo-600 dark:text-indigo-400" : "text-rose-600 dark:text-rose-400"}`}>
              {inr(activeMetrics.profit)}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                Margin: {activeMetrics.margin}%
              </span>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Pre-Tax
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-indigo-100/60 pt-2 text-[11px] text-slate-500 dark:border-white/5">
            <span>Pre-Tax Business Profit</span>
            <Link href="/finance/pnl" className="font-bold text-indigo-600 hover:underline dark:text-indigo-400">P&amp;L View →</Link>
          </div>
        </div>

        {/* KPI 3: Operating Expenses (Rose Multi-Tone Glow) */}
        <div className="bento-surface-interactive card-glow-rose group flex flex-col justify-between p-5 rounded-2xl border border-rose-500/25 bg-white/90 dark:bg-slate-900/90 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-500/10">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">{activeMetrics.label} Expenses</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500/20 to-pink-500/10 text-rose-600 shadow-xs dark:text-rose-400 group-hover:scale-110 transition-transform">
              <ActionVectorIcon icon="expenses" className="h-4 w-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-rose-600 sm:text-3xl dark:text-rose-400 tracking-tight">
              {inr(activeMetrics.expenses)}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                Outlays
              </span>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Operational Overheads
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-rose-100/60 pt-2 text-[11px] text-slate-500 dark:border-white/5">
            <span>Overheads Ledger</span>
            <Link href="/finance/expenses" className="font-bold text-rose-600 hover:underline dark:text-rose-400">Expenses →</Link>
          </div>
        </div>

        {/* KPI 4: Liquid Float Vaults (Amber Multi-Tone Glow) */}
        <div className="bento-surface-interactive card-glow-amber group flex flex-col justify-between p-5 rounded-2xl border border-amber-500/25 bg-white/90 dark:bg-slate-900/90 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-amber-500/10">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">Total Liquid Float</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/10 text-amber-600 shadow-xs dark:text-amber-400 group-hover:scale-110 transition-transform">
              <ActionVectorIcon icon="banks" className="h-4 w-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900 sm:text-3xl dark:text-white tracking-tight">
              {inr(data.liquidity.totalLiquidAssets)}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                6 Safes
              </span>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Cash &amp; Bank Vaults
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-amber-100/60 pt-2 text-[11px] text-slate-500 dark:border-white/5">
            <span>Asset Conservation: Active</span>
            <Link href="/finance/settlements" className="font-bold text-amber-600 hover:underline dark:text-amber-400">Settlements →</Link>
          </div>
        </div>

        {/* KPI 5: Customer Receivables (Cyan Multi-Tone Glow) */}
        <div className="bento-surface-interactive card-glow-cyan group flex flex-col justify-between p-5 rounded-2xl border border-cyan-500/25 bg-white/90 dark:bg-slate-900/90 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/10">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-cyan-600 dark:text-cyan-400">Customer Dues</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/10 text-cyan-600 shadow-xs dark:text-cyan-400 group-hover:scale-110 transition-transform">
              <ActionVectorIcon icon="customers" className="h-4 w-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-cyan-700 sm:text-3xl dark:text-cyan-400 tracking-tight">
              {inr(data.customerData.totalReceivables)}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                Khata
              </span>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {data.customerData.customerCountWithDue} Accounts with Dues
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-cyan-100/60 pt-2 text-[11px] text-slate-500 dark:border-white/5">
            <span>Khata Due Ledger</span>
            <Link href="/customers" className="font-bold text-cyan-600 hover:underline dark:text-cyan-400">Customers →</Link>
          </div>
        </div>
      </div>

      {/* ===============================================================================
          3. MAIN PERFORMANCE AREA (Interactive SVG Chart & Liquid Vaults)
      =============================================================================== */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left (7 Cols): Business Performance Chart */}
        <div className="bento-surface p-6 lg:col-span-7 dark:bg-slate-900/90 flex flex-col justify-between">
          <div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Trend Analytics</span>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Revenue &amp; Inflow Horizon (14 Days)</h3>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Revenue
                </span>
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Outlays
                </span>
              </div>
            </div>

            {/* SVG Trend Visualization */}
            <div className="relative mt-4 h-48 w-full">
              {chartDays.length > 0 ? (
                <svg className="h-full w-full overflow-visible" viewBox="0 0 600 180" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines */}
                  <line x1="20" y1="30" x2="580" y2="30" stroke="currentColor" strokeOpacity="0.08" />
                  <line x1="20" y1="95" x2="580" y2="95" stroke="currentColor" strokeOpacity="0.08" />
                  <line x1="20" y1="160" x2="580" y2="160" stroke="currentColor" strokeOpacity="0.15" />

                  {/* Area Fill */}
                  <path d={chartAreaPath} fill="url(#chartGradient)" />

                  {/* Line Stroke */}
                  <polyline
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={chartPoints}
                  />

                  {/* Interactive Points */}
                  {chartDays.map((d: any, idx: number) => {
                    const x = (idx / (chartDays.length - 1)) * 560 + 20;
                    const y = 160 - (d.revenue / chartScaleMax) * 130;
                    return (
                      <g key={d.date} className="cursor-pointer group" onMouseEnter={() => setHoveredPoint(d)} onMouseLeave={() => setHoveredPoint(null)}>
                        <circle
                          cx={x}
                          cy={y}
                          r="4.5"
                          className="fill-blue-600 stroke-white stroke-2 transition-transform group-hover:scale-150 dark:stroke-slate-900"
                        />
                      </g>
                    );
                  })}
                </svg>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-400">
                  No sales recorded yet. Your daily performance trend will appear here.
                </div>
              )}

              {/* Hover Tooltip */}
              {hoveredPoint && (
                <div className="absolute top-2 right-2 rounded-xl bg-slate-950/90 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur-md pointer-events-none">
                  <div className="font-bold">{hoveredPoint.label}</div>
                  <div className="text-emerald-400">Revenue: {inr(hoveredPoint.revenue)}</div>
                  <div className="text-rose-400">Expenses: {inr(hoveredPoint.expenses)}</div>
                </div>
              )}
            </div>

            {/* X-Axis Date Labels */}
            <div className="mt-2 flex justify-between px-2 text-[10px] font-bold text-slate-400">
              {chartDays.filter((_: any, i: number) => i % 2 === 0).map((d: any) => (
                <span key={d.date}>{d.label}</span>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 p-3 text-xs dark:bg-white/5">
            <span className="text-slate-600 dark:text-slate-300">
              14-Day Peak: <strong className="text-slate-900 dark:text-white">{inr(actualPeakRevenue)}</strong>
            </span>
            <Link href="/reports" className="font-bold text-blue-600 hover:underline dark:text-blue-400">
              Comprehensive Reports Hub →
            </Link>
          </div>
        </div>

        {/* Right (5 Cols): 3D Liquid Asset Vaults */}
        <div className="bento-surface p-6 lg:col-span-5 dark:bg-slate-900/90 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Liquid Reserves</span>
                <h3 className="text-base font-black text-slate-900 dark:text-white">3D Liquid Asset Vaults</h3>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Liquid</div>
                <div className="text-base font-black text-indigo-950 dark:text-white">{inr(data.liquidity.totalLiquidAssets)}</div>
              </div>
            </div>

            {/* 6-Pool Safe Grid */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {Object.entries(pools).map(([k, p]: [string, any]) => (
                <Link key={k} href={p.href} className="vault-3d-card group p-3 transition rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-100/80 dark:border-white/5 dark:bg-white/5">
                  <div className="flex items-center justify-between text-[11px] font-black text-slate-500 dark:text-slate-400">
                    <span className="truncate">{p.label.split(" ")[0]}</span>
                    <span className="rounded-full bg-blue-500/10 px-1.5 py-0.2 text-[9px] font-bold text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">{p.pctOfTotal}%</span>
                  </div>
                  <div className="mt-1.5 text-sm font-black text-slate-900 dark:text-white">{inr(p.current)}</div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {p.movements >= 0 ? "+" : ""}{inr(p.movements)}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Credit Card Facility Note */}
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-100/60 p-3 text-xs dark:border-white/10 dark:bg-slate-800/20">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <ActionVectorIcon icon="bill-payment" className="h-3.5 w-3.5 text-slate-500" />
                Credit Facility Limit:
              </span>
              <strong className="text-slate-900 dark:text-white">{inr(data.liquidity.creditCardFacility.limit)}</strong>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Available: <strong className="text-emerald-600 dark:text-emerald-400">{inr(data.liquidity.creditCardFacility.available)}</strong></span>
              <span className="text-slate-400">Used: <strong className="text-rose-600 dark:text-rose-400">{inr(data.liquidity.creditCardFacility.used)}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* ===============================================================================
          4. DIGITAL SERVICES PERFORMANCE SURFACE
      =============================================================================== */}
      <div className="bento-surface p-6 dark:bg-slate-900/90">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 dark:border-white/5">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                <ActionVectorIcon icon="zap" className="h-4 w-4" />
              </span>
              <h3 className="text-base font-black text-slate-900 dark:text-white">Digital &amp; Cyber Services Performance</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Real-time throughput, transaction volume, and fee income across digital counters.</p>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-slate-400">Total Custodial Throughput: </span>
            <strong className="text-xs text-slate-900 dark:text-white">{inr(totalServiceVol)}</strong>
          </div>
        </div>

        {/* 4 Service Cards */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* AEPS Cash Out */}
          <Link href="/business/aeps" className="group rounded-2xl border border-blue-500/20 bg-white/90 p-4.5 transition-all duration-200 hover:-translate-y-1 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/10 dark:border-white/10 dark:bg-slate-900/90">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 group-hover:scale-110 transition-transform">
                  <ActionVectorIcon icon="aeps" className="h-4 w-4" />
                </div>
                <span>AEPS Cash Out</span>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Active</span>
            </div>
            <div className="mt-3">
              <div className="text-xl font-black text-slate-900 dark:text-white">{inr(data.serviceBreakdown?.aeps?.volume || 0)}</div>
              <p className="text-[11px] text-slate-500">{data.serviceBreakdown?.aeps?.count || 0} withdrawals processed</p>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] dark:border-white/5">
              <span className="text-slate-400">Earned Income</span>
              <strong className="text-emerald-600 dark:text-emerald-400 font-black">+{inr(data.serviceBreakdown?.aeps?.income || 0)}</strong>
            </div>
          </Link>

          {/* DMT Remittance */}
          <Link href="/business/dmt" className="group rounded-2xl border border-violet-500/20 bg-white/90 p-4.5 transition-all duration-200 hover:-translate-y-1 hover:border-violet-500 hover:shadow-lg hover:shadow-violet-500/10 dark:border-white/10 dark:bg-slate-900/90">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400 group-hover:scale-110 transition-transform">
                  <ActionVectorIcon icon="dmt" className="h-4 w-4" />
                </div>
                <span>Money Transfer (DMT)</span>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Active</span>
            </div>
            <div className="mt-3">
              <div className="text-xl font-black text-slate-900 dark:text-white">{inr(data.serviceBreakdown?.dmt?.volume || 0)}</div>
              <p className="text-[11px] text-slate-500">{data.serviceBreakdown?.dmt?.count || 0} remittances sent</p>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] dark:border-white/5">
              <span className="text-slate-400">Earned Income</span>
              <strong className="text-emerald-600 dark:text-emerald-400 font-black">+{inr(data.serviceBreakdown?.dmt?.income || 0)}</strong>
            </div>
          </Link>

          {/* UPI Collections */}
          <Link href="/business/upi" className="group rounded-2xl border border-rose-500/20 bg-white/90 p-4.5 transition-all duration-200 hover:-translate-y-1 hover:border-rose-500 hover:shadow-lg hover:shadow-rose-500/10 dark:border-white/10 dark:bg-slate-900/90">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 group-hover:scale-110 transition-transform">
                  <ActionVectorIcon icon="upi" className="h-4 w-4" />
                </div>
                <span>UPI QR Collections</span>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Active</span>
            </div>
            <div className="mt-3">
              <div className="text-xl font-black text-slate-900 dark:text-white">{inr(data.serviceBreakdown?.upi?.volume || 0)}</div>
              <p className="text-[11px] text-slate-500">{data.serviceBreakdown?.upi?.count || 0} QR receipts</p>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] dark:border-white/5">
              <span className="text-slate-400">Earned Income</span>
              <strong className="text-emerald-600 dark:text-emerald-400 font-black">+{inr(data.serviceBreakdown?.upi?.income || 0)}</strong>
            </div>
          </Link>

          {/* Mobile Recharge */}
          <Link href="/business/recharge" className="group rounded-2xl border border-emerald-500/20 bg-white/90 p-4.5 transition-all duration-200 hover:-translate-y-1 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-500/10 dark:border-white/10 dark:bg-slate-900/90">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                  <ActionVectorIcon icon="bill-payment" className="h-4 w-4" />
                </div>
                <span>Mobile &amp; DTH Recharge</span>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Active</span>
            </div>
            <div className="mt-3">
              <div className="text-xl font-black text-slate-900 dark:text-white">{inr(data.serviceBreakdown?.recharge?.volume || 0)}</div>
              <p className="text-[11px] text-slate-500">{data.serviceBreakdown?.recharge?.count || 0} top-ups completed</p>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] dark:border-white/5">
              <span className="text-slate-400">Earned Income</span>
              <strong className="text-emerald-600 dark:text-emerald-400 font-black">+{inr(data.serviceBreakdown?.recharge?.income || 0)}</strong>
            </div>
          </Link>
        </div>

        {/* Service Volume Mix Progress Bar */}
        {totalServiceVol > 0 && (
          <div className="mt-5 space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
              <span>Service Distribution Mix</span>
              <span>AEPS ({aepsPct}%) • DMT ({dmtPct}%) • UPI ({upiPct}%) • Recharge ({rechargePct}%)</span>
            </div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div style={{ width: `${aepsPct}%` }} className="bg-amber-500" title="AEPS" />
              <div style={{ width: `${dmtPct}%` }} className="bg-violet-500" title="DMT" />
              <div style={{ width: `${upiPct}%` }} className="bg-rose-500" title="UPI" />
              <div style={{ width: `${rechargePct}%` }} className="bg-emerald-500" title="Recharge" />
            </div>
          </div>
        )}
      </div>

      {/* ===============================================================================
          5. OPERATIONS & BUSINESS HEALTH (Customers, Inventory & Day Close)
      =============================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Customer Health */}
        <div className="bento-surface p-6 dark:bg-slate-900/90 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                  <ActionVectorIcon icon="customers" className="h-4 w-4" />
                </span>
                <h3 className="font-bold text-slate-900 dark:text-white">Customer Receivables</h3>
              </div>
              <Link href="/customers" className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400">View CRM →</Link>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Total Outstanding Dues:</span>
                <strong className="text-amber-600 font-bold text-sm">{inr(data.customerData.totalReceivables)}</strong>
              </div>
              <div className="space-y-2 pt-1">
                {data.customerData.topDebtors.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400">Zero customer dues outstanding!</div>
                ) : (
                  data.customerData.topDebtors.slice(0, 3).map((d: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center rounded-xl bg-slate-50 p-2 text-xs dark:bg-slate-800/40">
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{d.name}</span>
                      <strong className="font-bold text-rose-600 dark:text-rose-400">{inr(d.balance)}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-2 text-right dark:border-white/5">
            <Link href="/finance/ledger" className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400">
              Open Khata Ledgers →
            </Link>
          </div>
        </div>

        {/* Inventory Health */}
        <div className="bento-surface p-6 dark:bg-slate-900/90 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                  <ActionVectorIcon icon="products" className="h-4 w-4" />
                </span>
                <h3 className="font-bold text-slate-900 dark:text-white">Inventory Health</h3>
              </div>
              <Link href="/catalog/products" className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400">Catalog →</Link>
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Stock Valuation (WAC):</span>
                <strong className="text-slate-900 dark:text-white font-bold text-sm">
                  {data.inventoryData.isValuationMissingCost ? "Valuation pending cost data" : inr(data.inventoryData.totalStockValue)}
                </strong>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-2 text-center dark:border-amber-900/40 dark:bg-amber-950/20">
                  <div className="text-base font-black text-amber-700 dark:text-amber-400">{data.inventoryData.lowStockCount}</div>
                  <div className="text-[10px] font-bold text-amber-900 dark:text-amber-300">Low Stock</div>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-2 text-center dark:border-rose-900/40 dark:bg-rose-950/20">
                  <div className="text-base font-black text-rose-700 dark:text-rose-400">{data.inventoryData.outOfStockCount}</div>
                  <div className="text-[10px] font-bold text-rose-900 dark:text-rose-300">Out of Stock</div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-2 text-right dark:border-white/5">
            <Link href="/inventory" className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400">
              Audit Stock Movements →
            </Link>
          </div>
        </div>

        {/* Day Close Status */}
        <div className="bento-surface p-6 dark:bg-slate-900/90 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                  <ActionVectorIcon icon="day-close" className="h-4 w-4" />
                </span>
                <h3 className="font-bold text-slate-900 dark:text-white">Day Close &amp; Seal</h3>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                data.dayCloseStatus.state === "today_closed"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : data.dayCloseStatus.state === "today_ready_for_close"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              }`}>
                {data.dayCloseStatus.status.toUpperCase()}
              </span>
            </div>
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Expected Physical Cash:</span>
                <strong className="text-slate-900 dark:text-white">{inr(data.dayCloseStatus.expectedCash)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Counted Cash:</span>
                <strong className="text-slate-900 dark:text-white">{inr(data.dayCloseStatus.physicalCash)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Reconciliation Variance:</span>
                <strong className={Math.abs(data.dayCloseStatus.difference) > 0 ? "text-rose-600" : "text-emerald-600"}>
                  {inr(data.dayCloseStatus.difference)}
                </strong>
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-2 text-right dark:border-white/5">
            <Link href="/finance/day-close" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline dark:text-blue-400">
              {data.dayCloseStatus.state === "today_closed" ? "View Snapshot Slip →" : "Perform Day Close →"}
            </Link>
          </div>
        </div>
      </div>

      {/* ===============================================================================
          6. ATTENTION CENTER & QUICK ACTIONS
      =============================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Needs Your Attention */}
        <div className="bento-surface p-6 lg:col-span-6 dark:bg-slate-900/90 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                  <ActionVectorIcon icon="self-audit" className="h-4 w-4" />
                </span>
                <h3 className="font-bold text-slate-900 dark:text-white">Needs Your Attention ({data.alerts.length})</h3>
              </div>
              <span className="text-xs text-slate-400">Deterministic System Alarms</span>
            </div>

            <div className="mt-4 space-y-3">
              {data.alerts.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Zero operational anomalies. All systems, inventories and ledgers are balanced.
                </div>
              ) : (
                data.alerts.slice(0, 3).map((alt: any) => {
                  const borderBg = {
                    critical: "border-rose-300 bg-rose-50/80 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200",
                    high: "border-amber-300 bg-amber-50/80 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200",
                    warning: "border-yellow-300 bg-yellow-50/80 text-yellow-950 dark:border-yellow-900/50 dark:bg-yellow-950/20 dark:text-yellow-200",
                    info: "border-blue-300 bg-blue-50/80 text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200",
                  }[alt.severity as "critical" | "high" | "warning" | "info"];

                  return (
                    <div key={alt.id} className={`flex items-center justify-between rounded-2xl border p-3 text-xs shadow-xs ${borderBg}`}>
                      <div className="space-y-0.5 pr-2">
                        <div className="font-bold">{alt.title}</div>
                        <p className="opacity-80 text-[11px]">{alt.reason}</p>
                      </div>
                      <Link
                        href={alt.actionHref}
                        className="shrink-0 rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:brightness-110 dark:bg-white dark:text-slate-900"
                      >
                        {alt.actionLabel} →
                      </Link>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-2 text-right dark:border-white/5">
            <Link href="/ai/self-audit" className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400">
              Run Complete AI Financial Self-Audit →
            </Link>
          </div>
        </div>

        {/* Quick Actions Hub */}
        <div className="bento-surface p-6 lg:col-span-6 dark:bg-slate-900/90 flex flex-col justify-between">
          <div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                  <ActionVectorIcon icon="quick-sale" className="h-4 w-4" />
                </span>
                <h3 className="font-bold text-slate-900 dark:text-white">Quick Action Shortcuts</h3>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setIsQuickActionsEditorOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30 transition"
                >
                  <ActionVectorIcon icon="settings" className="h-3.5 w-3.5" />
                  <span>Customize</span>
                </button>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {quickActions.map((action, idx) => {
                const colorThemes = [
                  { bg: "bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white dark:bg-emerald-500/20 dark:text-emerald-400", border: "hover:border-emerald-500/40 hover:shadow-emerald-500/10", text: "group-hover:text-emerald-600 dark:group-hover:text-emerald-400" },
                  { bg: "bg-amber-500/10 text-amber-600 group-hover:bg-amber-600 group-hover:text-white dark:bg-amber-500/20 dark:text-amber-400", border: "hover:border-amber-500/40 hover:shadow-amber-500/10", text: "group-hover:text-amber-600 dark:group-hover:text-amber-400" },
                  { bg: "bg-indigo-500/10 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white dark:bg-indigo-500/20 dark:text-indigo-400", border: "hover:border-indigo-500/40 hover:shadow-indigo-500/10", text: "group-hover:text-indigo-600 dark:group-hover:text-indigo-400" },
                  { bg: "bg-teal-500/10 text-teal-600 group-hover:bg-teal-600 group-hover:text-white dark:bg-teal-500/20 dark:text-teal-400", border: "hover:border-teal-500/40 hover:shadow-teal-500/10", text: "group-hover:text-teal-600 dark:group-hover:text-teal-400" },
                  { bg: "bg-violet-500/10 text-violet-600 group-hover:bg-violet-600 group-hover:text-white dark:bg-violet-500/20 dark:text-violet-400", border: "hover:border-violet-500/40 hover:shadow-violet-500/10", text: "group-hover:text-violet-600 dark:group-hover:text-violet-400" },
                  { bg: "bg-blue-500/10 text-blue-600 group-hover:bg-blue-600 group-hover:text-white dark:bg-blue-500/20 dark:text-blue-400", border: "hover:border-blue-500/40 hover:shadow-blue-500/10", text: "group-hover:text-blue-600 dark:group-hover:text-blue-400" },
                  { bg: "bg-rose-500/10 text-rose-600 group-hover:bg-rose-600 group-hover:text-white dark:bg-rose-500/20 dark:text-rose-400", border: "hover:border-rose-500/40 hover:shadow-rose-500/10", text: "group-hover:text-rose-600 dark:group-hover:text-rose-400" },
                  { bg: "bg-purple-500/10 text-purple-600 group-hover:bg-purple-600 group-hover:text-white dark:bg-purple-500/20 dark:text-purple-400", border: "hover:border-purple-500/40 hover:shadow-purple-500/10", text: "group-hover:text-purple-600 dark:group-hover:text-purple-400" },
                ];
                const theme = colorThemes[idx % colorThemes.length];

                return (
                  <Link
                    key={action.id}
                    href={action.href}
                    className={`group flex min-h-[92px] flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white/80 p-3 text-center transition-all duration-200 hover:-translate-y-1 hover:bg-white hover:shadow-lg active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.07] ${theme.border}`}
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-xs transition-all duration-200 group-hover:scale-110 ${theme.bg}`}>
                      <ActionVectorIcon icon={action.icon} className="h-4 w-4" />
                    </span>
                    <span className={`mt-2 text-xs font-bold text-slate-900 truncate w-full transition-colors dark:text-white ${theme.text}`}>
                      {action.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-2 text-right dark:border-white/5">
            <span className="text-[11px] font-medium text-slate-400">
              Instant shortcuts to authorized ERP modules
            </span>
          </div>
        </div>
      </div>

      {/* ===============================================================================
          7. RECENT TRANSACTION STREAM
      =============================================================================== */}
      <div className="bento-surface p-6 dark:bg-slate-900/90">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <ActionVectorIcon icon="trial-balance" className="h-4 w-4" />
            </span>
            <h3 className="font-bold text-slate-900 dark:text-white">Recent Activity Stream</h3>
          </div>
          <Link href="/invoices" className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400">View All Transactions →</Link>
        </div>

        <div className="mt-4 divide-y divide-slate-100 dark:divide-white/5">
          {(data.recentActivity || []).length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No recent transactions recorded. New sales and outlays will appear here live.
            </div>
          ) : (
            (data.recentActivity || []).map((item: any) => (
              <div key={item.id} className="flex items-center justify-between py-2.5 text-xs">
                <div className="flex items-center gap-3">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-xl font-bold ${
                    item.type === "sale" ? "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400" : item.type === "expense" ? "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400" : "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                  }`}>
                    <ActionVectorIcon icon={item.type === "sale" ? "new-sale" : item.type === "expense" ? "expenses" : "zap"} className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{item.title}</div>
                    <div className="text-[11px] text-slate-400">{item.subtitle}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-black ${item.direction === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {item.direction === "in" ? "+" : "-"}{inr(item.amount)}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">{item.status}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Actions Customization Modal */}
      {isQuickActionsEditorOpen && isAdmin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="quick-actions-title">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <div>
                <h4 id="quick-actions-title" className="font-black text-slate-900 dark:text-white">Edit Quick Actions</h4>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Customize labels, icons, destinations and order.</p>
              </div>
              <button type="button" onClick={() => setIsQuickActionsEditorOpen(false)} className="rounded-xl px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="Close editor">✕</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-3">
              {quickActions.map((action, index) => (
                <div key={action.id} className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
                  <div className="grid grid-cols-[auto_1fr] gap-3 sm:grid-cols-[auto_1fr_auto]">
                    <div className="flex items-start gap-1">
                      <button type="button" disabled={index === 0} onClick={() => moveQuickAction(index, -1)} className="rounded-lg px-2 py-1 text-xs font-bold disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-white/10" aria-label={`Move ${action.label} up`}>↑</button>
                      <button type="button" disabled={index === quickActions.length - 1} onClick={() => moveQuickAction(index, 1)} className="rounded-lg px-2 py-1 text-xs font-bold disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-white/10" aria-label={`Move ${action.label} down`}>↓</button>
                    </div>
                    <div className="grid grid-cols-[48px_1fr] gap-2 items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <ActionVectorIcon icon={action.icon} className="h-5 w-5" />
                      </div>
                      <input value={action.label} onChange={(e) => updateQuickAction(action.id, { label: e.target.value.slice(0, 32) })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-slate-800 dark:text-white" aria-label={`${action.label} label`} />
                    </div>
                    <button type="button" onClick={() => removeQuickAction(action.id)} disabled={quickActions.length <= 1} className="rounded-xl px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-30 dark:hover:bg-rose-950/20">Remove</button>
                  </div>
                  <div className="mt-2">
                    <select value={action.href} onChange={(e) => updateQuickAction(action.id, { href: e.target.value })} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200" aria-label={`${action.label} destination`}>
                      {quickActionCatalog.map((item) => (
                        <option key={item.id} value={item.href}>{item.label} — {item.href}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/40">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">Add a shortcut</div>
                    <div className="text-[11px] text-slate-500">Choose from safe application destinations.</div>
                  </div>
                  <select defaultValue="" onChange={(e) => { if (e.target.value) { addQuickAction(e.target.value); e.currentTarget.value = ""; } }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold dark:border-white/10 dark:bg-slate-900 dark:text-white">
                    <option value="" disabled>Add action…</option>
                    {quickActionCatalog.filter((item) => !quickActions.some((a) => a.id === item.id)).map((item) => (
                      <option key={item.id} value={item.id}>{item.label} ({item.href})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-slate-800/40">
              <button type="button" onClick={resetQuickActions} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-white/10">↺ Restore Defaults</button>
              <button type="button" onClick={() => setIsQuickActionsEditorOpen(false)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
