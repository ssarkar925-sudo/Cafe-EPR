"use client";

import SettingsSection from "@/components/settings/settings-section";
import ProductsClient from "@/components/catalog/products-client";
import ServicesClient from "@/components/catalog/services-client";
import CategoriesClient from "@/components/catalog/categories-client";

const SECTIONS = [
  { key: "products", label: "Products Catalog", icon: "📦" },
  { key: "services", label: "Services Catalog", icon: "⚡" },
  { key: "categories", label: "Categories Tree", icon: "📁" },
] as const;

export default function CatalogPanel({
  active,
  section,
  onSection,
  initialProducts,
  initialCatalogServices,
  initialCategories,
  categoryCounts,
}: {
  active: boolean;
  section: string;
  onSection: (s: string) => void;
  initialProducts?: any[];
  initialCatalogServices?: any[];
  initialCategories?: any[];
  categoryCounts?: Record<string, number>;
}) {
  return (
    <div className={active ? "mt-6 space-y-6" : "hidden"}>
      <SettingsSection
        icon="M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9"
        tone="violet"
        title="Catalog Master Data &amp; Pricing"
        desc="Manage products with inventory tracking, cybercafe services, and category groupings."
      >
        {/* Navigation Tabs */}
        <div className="mb-5 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1.5 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            {SECTIONS.map((s) => {
              const selected = section === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onSection(s.key)}
                  className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-extrabold transition ${
                    selected
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-white/10"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  <span>{s.icon}</span>
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="-mx-6 -mb-6">
          {section === "products" && (
            <ProductsClient embedded initialProducts={initialProducts ?? []} categories={initialCategories ?? []} />
          )}
          {section === "services" && (
            <ServicesClient embedded initialServices={initialCatalogServices ?? []} categories={initialCategories ?? []} />
          )}
          {section === "categories" && (
            <CategoriesClient embedded initialCategories={initialCategories ?? []} counts={categoryCounts ?? {}} />
          )}
        </div>
      </SettingsSection>
    </div>
  );
}