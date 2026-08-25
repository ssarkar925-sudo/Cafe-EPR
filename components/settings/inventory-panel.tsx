"use client";

import Link from "next/link";
import SettingsSection from "@/components/settings/settings-section";

const INVENTORY_LINKS = [
  {
    href: "/purchases",
    title: "Purchases & Restock",
    desc: "Record vendor purchase invoices, stock receipts, and WAC cost additions.",
    icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M12 12v6m-3-3l3-3 3 3",
    badge: "Purchasing",
    tone: "blue",
  },
  {
    href: "/suppliers",
    title: "Suppliers & Payables",
    desc: "Manage vendor accounts, purchase history, and outstanding payables.",
    icon: "M16 11V7a4 4 0 0 0-8 0v4M5 9h14l1 12H4L5 9z",
    badge: "Vendors",
    tone: "emerald",
  },
  {
    href: "/inventory/movements",
    title: "Stock Movements Log",
    desc: "Audit append-only immutable inventory movements (Sales, Purchases, Adjustments).",
    icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    badge: "Immutable Log",
    tone: "purple",
  },
  {
    href: "/reports",
    title: "Inventory & Tax Reports",
    desc: "View stock valuation, low-stock warnings, and historical COGS reconciliation.",
    icon: "M18 20V10M12 20V4M6 20v-6",
    badge: "Reports",
    tone: "amber",
  },
];

export default function InventoryPanel({ active }: { active: boolean }) {
  return (
    <div className={active ? "mt-6" : "hidden"}>
      <SettingsSection
        icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        tone="blue"
        title="Inventory & Supply (Back-Office)"
        desc="Back-office inventory control, supplier purchase entries, and stock ledger audits. POS sales automatically decrement stock in real time."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {INVENTORY_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-white/10 dark:bg-slate-900"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700 group-hover:bg-blue-50 group-hover:text-blue-600 dark:bg-white/5 dark:text-slate-300">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d={link.icon} />
                    </svg>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                    {link.badge}
                  </span>
                </div>
                <h3 className="mt-3.5 text-base font-semibold text-slate-900 group-hover:text-blue-600 dark:text-white">
                  {link.title}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {link.desc}
                </p>
              </div>
              <div className="mt-4 flex items-center text-xs font-medium text-blue-600 dark:text-blue-400">
                <span>Open module</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-1 h-3.5 w-3.5 transition group-hover:translate-x-0.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}

