"use client";

import SettingsSection from "@/components/settings/settings-section";
import ProductsClient from "@/components/catalog/products-client";
import ServicesClient from "@/components/catalog/services-client";
import CategoriesClient from "@/components/catalog/categories-client";

const SECTIONS = [
  { key: "products", label: "Products" },
  { key: "services", label: "Services" },
  { key: "categories", label: "Categories" },
] as const;

export default function CatalogPanel({
  section,
  onSection,
  initialProducts,
  initialCatalogServices,
  initialCategories,
  categoryCounts,
}: {
  section: string;
  onSection: (s: string) => void;
  initialProducts?: any[];
  initialCatalogServices?: any[];
  initialCategories?: any[];
  categoryCounts?: Record<string, number>;
}) {
  return (
    <div className="mt-6">
      <SettingsSection
        icon="M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9"
        tone="violet"
        title="Catalog Management"
        desc="Products, services and categories. Items in use are deactivated, never deleted."
      >
        <div className="mb-2 flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => onSection(s.key)}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                section === s.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              {s.label}
            </button>
          ))}
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