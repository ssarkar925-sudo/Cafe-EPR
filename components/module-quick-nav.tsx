"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Modal from "@/components/ui/modal";

export type QuickNavItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
};

const DEFAULT_MODULES: QuickNavItem[] = [
  { id: "pos", label: "Point of Sale", href: "/pos", icon: "🧾" },
  { id: "quick-sale", label: "Quick Sale", href: "/pos?mode=quick", icon: "⚡" },
  { id: "invoices", label: "Invoices", href: "/invoices", icon: "📄" },
  { id: "customers", label: "Customers", href: "/customers", icon: "👤" },
  { id: "products", label: "Products", href: "/catalog/products", icon: "📦" },
  { id: "services", label: "Services", href: "/catalog/services", icon: "✦" },
  { id: "aeps", label: "AEPS Cash", href: "/business/aeps", icon: "🏧" },
  { id: "dmt", label: "Money Transfer", href: "/business/dmt", icon: "💸" },
  { id: "upi", label: "UPI Float", href: "/business/upi", icon: "📱" },
  { id: "cashbook", label: "Cash Book", href: "/finance/cashbook", icon: "📖" },
  { id: "expenses", label: "Expenses", href: "/finance/expenses", icon: "🏷️" },
  { id: "settlements", label: "Settlements", href: "/finance/settlements", icon: "🏦" },
  { id: "pnl", label: "P&L Report", href: "/finance/pnl", icon: "📈" },
  { id: "dayclose", label: "Day Close", href: "/finance/day-close", icon: "🔒" },
  { id: "reports", label: "Reports & GST", href: "/reports", icon: "📊" },
  { id: "audit", label: "AI Self-Audit", href: "/ai/self-audit", icon: "🛡️" },
];

export const ALL_AVAILABLE_MODULES: QuickNavItem[] = [
  { id: "pos", label: "Point of Sale (POS)", href: "/pos", icon: "🧾" },
  { id: "quick-sale", label: "Quick Sale Counter", href: "/pos?mode=quick", icon: "⚡" },
  { id: "invoices", label: "Invoices & Sales", href: "/invoices", icon: "📄" },
  { id: "customers", label: "Customer Directory", href: "/customers", icon: "👤" },
  { id: "products", label: "Products Catalog", href: "/catalog/products", icon: "📦" },
  { id: "services", label: "Services Catalog", href: "/catalog/services", icon: "✦" },
  { id: "categories", label: "Categories Tree", href: "/catalog/categories", icon: "📁" },
  { id: "inventory", label: "Inventory Stock", href: "/inventory", icon: "◇" },
  { id: "purchases", label: "Purchase Entry", href: "/purchases/entry", icon: "🛒" },
  { id: "suppliers", label: "Suppliers Directory", href: "/suppliers", icon: "🚚" },
  { id: "returns", label: "Returns & Refunds", href: "/returns", icon: "↶" },
  { id: "aeps", label: "AEPS Cash Out", href: "/business/aeps", icon: "🏧" },
  { id: "dmt", label: "Money Transfer (DMT)", href: "/business/dmt", icon: "💸" },
  { id: "upi", label: "UPI Collections", href: "/business/upi", icon: "📱" },
  { id: "bill-payment", label: "Bill Payment", href: "/business/bill-payment", icon: "💳" },
  { id: "recharge", label: "Mobile Recharge", href: "/business/bill-payment/mobile-recharge", icon: "🔋" },
  { id: "google-play", label: "Google Play Recharge", href: "/business/bill-payment/google-play", icon: "▶️" },
  { id: "utility-bills", label: "Utility Bill Payment", href: "/business/bill-payment/utility", icon: "🧾" },
  { id: "banks", label: "Bank Accounts", href: "/business/banks", icon: "🏛️" },
  { id: "opening", label: "Opening Position", href: "/finance/opening-balances", icon: "🏛️" },
  { id: "cashbook", label: "Daily Cash Book", href: "/finance/cashbook", icon: "📖" },
  { id: "expenses", label: "Expenses Ledger", href: "/finance/expenses", icon: "🏷️" },
  { id: "ledger", label: "Customer Ledgers", href: "/finance/ledger", icon: "📒" },
  { id: "settlements", label: "Settlements & Float", href: "/finance/settlements", icon: "🏦" },
  { id: "pnl", label: "Profit & Loss (P&L)", href: "/finance/pnl", icon: "📈" },
  { id: "dayclose", label: "End-of-Day Close", href: "/finance/day-close", icon: "🔒" },
  { id: "reports", label: "Reports & GST", href: "/reports", icon: "📊" },
  { id: "tax-prep", label: "Tax Preparation / ITR", href: "/reports/tax-preparation", icon: "📋" },
  { id: "audit", label: "AI Self-Audit", href: "/ai/self-audit", icon: "🛡️" },
  { id: "ai", label: "AI Advisor Control", href: "/ai", icon: "✨" },
  { id: "staff", label: "Staff Accounts", href: "/staff", icon: "👥" },
  { id: "security", label: "Security & 2FA", href: "/security", icon: "🔑" },
  { id: "settings", label: "System Settings", href: "/settings", icon: "⚙️" },
];

const STORAGE_KEY = "cafe_erp_custom_quick_access";

export default function ModuleQuickNav() {
  const pathname = usePathname();
  const [items, setItems] = useState<QuickNavItem[]>(DEFAULT_MODULES);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    function load() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setItems(parsed);
          }
        }
      } catch {}
    }
    load();
    window.addEventListener("storage", load);
    return () => window.removeEventListener("storage", load);
  }, []);

  function saveItems(next: QuickNavItem[]) {
    setItems(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("storage"));
    } catch {}
  }

  function toggleItem(mod: QuickNavItem) {
    const exists = items.some((i) => i.id === mod.id);
    if (exists) {
      if (items.length <= 1) return;
      saveItems(items.filter((i) => i.id !== mod.id));
    } else {
      saveItems([...items, mod]);
    }
  }

  function moveItem(index: number, dir: -1 | 1) {
    const nextIdx = index + dir;
    if (nextIdx < 0 || nextIdx >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(nextIdx, 0, moved);
    saveItems(next);
  }

  function resetToDefaults() {
    saveItems(DEFAULT_MODULES);
  }

  return (
    <>
      <div className="sticky top-14 z-10 border-b border-slate-200/80 bg-white/90 px-3 py-2 backdrop-blur-md lg:top-16 lg:px-6 dark:border-white/10 dark:bg-slate-950/85">
        <div className="mx-auto flex max-w-[1600px] items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="mr-1 shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
            Quick Access
          </span>

          {items.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`group flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition ${
                  active
                    ? "border-blue-500/40 bg-blue-50 text-blue-700 shadow-xs dark:bg-blue-950/50 dark:text-blue-300"
                    : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:border-white/10 dark:hover:bg-white/5 dark:hover:text-white"
                }`}
              >
                <span className="text-xs leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}

          {/* Edit Quick Access Trigger */}
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="ml-auto flex shrink-0 items-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-2.5 py-1 text-[10px] font-extrabold text-slate-600 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-white/20 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            title="Customize your Quick Access shortcuts"
          >
            <span>⚙</span>
            <span>Edit Quick Access</span>
          </button>
        </div>
      </div>

      {/* Customize Quick Access Modal */}
      {editOpen && (
        <Modal
          onClose={() => setEditOpen(false)}
          title="Customize Quick Access Shortcuts"
          subtitle="Choose, reorder, or pin your favorite modules for 1-click counter navigation."
          accent="blue"
          size="lg"
        >
          <div className="space-y-5">
            {/* Active Shortcuts Section */}
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Currently Pinned ({items.length})
                </h3>
                <button
                  type="button"
                  onClick={resetToDefaults}
                  className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
                >
                  Reset to Default
                </button>
              </div>

              <div className="mt-2.5 space-y-1.5 max-h-56 overflow-y-auto rounded-2xl border border-slate-200/80 bg-slate-50/50 p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
                {items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-2 text-xs font-bold text-slate-900 shadow-xs dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{item.icon}</span>
                      <span>{item.label}</span>
                      <span className="font-mono text-[10px] text-slate-400">{item.href}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveItem(idx, -1)}
                        disabled={idx === 0}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-white/10"
                        title="Move Left"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(idx, 1)}
                        disabled={idx === items.length - 1}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-white/10"
                        title="Move Right"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleItem(item)}
                        className="rounded-lg p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        title="Unpin"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Available Catalog Section */}
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                Available Module Catalog (Click to Pin / Unpin)
              </h3>
              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ALL_AVAILABLE_MODULES.map((mod) => {
                  const isPinned = items.some((i) => i.id === mod.id);
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => toggleItem(mod)}
                      className={`flex items-center justify-between rounded-xl border p-2.5 text-left text-xs font-bold transition ${
                        isPinned
                          ? "border-blue-500/40 bg-blue-50/80 text-blue-700 dark:border-blue-500/40 dark:bg-blue-950/40 dark:text-blue-300"
                          : "border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-sm">{mod.icon}</span>
                        <span className="truncate">{mod.label}</span>
                      </div>
                      <span className="text-xs font-black">
                        {isPinned ? "✓" : "+"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
