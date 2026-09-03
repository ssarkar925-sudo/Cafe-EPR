"use client";

import Link from "next/link";
import SettingsSection from "@/components/settings/settings-section";

const SECTIONS = [
  { href: "/catalog/products", label: "Products Catalog", desc: "Products, barcodes, cost prices and stock levels.", icon: "📦" },
  { href: "/catalog/services", label: "Services Rate Card", desc: "Cybercafe, printing, xerox and online service charges.", icon: "⚡" },
  { href: "/catalog/categories", label: "Categories Tree", desc: "Product and service organization for fast POS grouping.", icon: "📁" },
] as const;

export default function CatalogPanel({ active }: { active: boolean; section?: string; onSection?: (s: string) => void; initialProducts?: any[]; initialCatalogServices?: any[]; initialCategories?: any[]; categoryCounts?: Record<string, number> }) {
  return (
    <div className={active ? "mt-6 space-y-6" : "hidden"}>
      <SettingsSection
        icon="M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9"
        tone="violet"
        title="Catalog Master Data"
        desc="Catalog CRUD is maintained in the dedicated Catalog modules. Settings provides a single navigation point without a second copy of the same data editor."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {SECTIONS.map((item) => (
            <Link key={item.href} href={item.href} className="group rounded-2xl border border-violet-200 bg-violet-50/60 p-4 transition hover:-translate-y-0.5 hover:shadow-md dark:border-violet-500/20 dark:bg-violet-950/20">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg shadow-sm dark:bg-white/10">{item.icon}</div>
              <div className="mt-3 text-sm font-extrabold text-slate-900 dark:text-white">{item.label}</div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
              <span className="mt-3 inline-flex text-xs font-bold text-violet-700 dark:text-violet-300">Open module →</span>
            </Link>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}
