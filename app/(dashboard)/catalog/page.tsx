import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import CatalogOpsStrip from "@/components/catalog/catalog-ops-strip";
import {
  Package,
  Layers,
  FolderTree,
  Bookmark,
  Ruler,
  Boxes,
  ArrowRight,
  Sparkles,
  Plus,
  Scale,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Catalog Master | CyberCafe ERP",
  description: "Manage product definitions, services, categories, brands, and units of measure",
};

export default async function CatalogPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();
  const [
    { data: products },
    { data: services },
    { data: categories },
    { data: brands },
    { data: units },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,stock_qty,stock_quantity,reorder_level,cost_price,sale_price,gst_rate,is_active")
      .limit(500),
    supabase
      .from("services")
      .select("id,name,sale_price,cost_price,gst_rate,is_active,is_quick_favorite")
      .limit(500),
    supabase.from("categories").select("id,name,is_active").limit(100),
    supabase.from("brands").select("id,name,is_active").limit(100),
    supabase.from("units").select("id,name,code,is_active").limit(100),
  ]);

  const p = (products ?? []) as any[];
  const s = (services ?? []) as any[];
  const c = (categories ?? []) as any[];
  const b = (brands ?? []) as any[];
  const u = (units ?? []) as any[];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <Package className="h-3.5 w-3.5" />
              PRODUCT MASTER
            </span>
            <span className="text-xs text-slate-400">· Definitions & Rates</span>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Catalog Management
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
            Configure what your business sells: physical products, billable services, categories, brands, and measurement units.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/inventory"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
          >
            <Boxes className="h-3.5 w-3.5 text-blue-500" />
            Operational Inventory →
          </Link>
          <Link
            href="/catalog/products"
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Master Product
          </Link>
        </div>
      </div>

      {/* Metrics Ops Strip */}
      <CatalogOpsStrip products={p} services={s} />

      {/* Primary Catalog Entities Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Products Master */}
        <Link
          href="/catalog/products"
          className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xs transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Package className="h-6 w-6" />
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {p.filter((x) => x.is_active !== false).length} Active Products
            </span>
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
            Products Master →
          </h2>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Saleable stock items, SKU barcodes, cost price, selling price, and reorder levels.
          </p>
        </Link>

        {/* Services Master */}
        <Link
          href="/catalog/services"
          className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xs transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400">
              <Layers className="h-6 w-6" />
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {s.filter((x) => x.is_active !== false).length} Active Services
            </span>
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition">
            Services Master →
          </h2>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Billable services, printing, scanning, typing, internet hours, and custom job rates.
          </p>
        </Link>
      </div>

      {/* Supporting Master Data Entities */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Categories */}
        <Link
          href="/catalog/categories"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-amber-300 dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <FolderTree className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-slate-400">{c.length} Groups</span>
          </div>
          <h3 className="mt-3 font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition">
            Categories Master →
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Structure your catalog into logical departments and POS filter groups.
          </p>
        </Link>

        {/* Brands */}
        <Link
          href="/catalog/brands"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-teal-300 dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400">
              <Bookmark className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-slate-400">{b.length} Brands</span>
          </div>
          <h3 className="mt-3 font-bold text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition">
            Brands Master →
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Organize branded accessories, electronics, and stationery by manufacturer.
          </p>
        </Link>

        {/* Units of Measure */}
        <Link
          href="/catalog/units"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-indigo-300 dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Ruler className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-slate-400">{u.length} Units</span>
          </div>
          <h3 className="mt-3 font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
            Units of Measure →
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Define measurement codes (pc, pkt, kg, box, hrs, page) for invoices.
          </p>
        </Link>
      </div>

      {/* Contextual Link to Inventory */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-slate-900/40">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Looking for physical stock levels and valuation?
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              The Product Master defines selling prices and codes. Visit the Inventory Hub for stock quantities, valuation, and movements.
            </p>
          </div>
        </div>
        <Link
          href="/inventory"
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 shrink-0"
        >
          <span>Open Inventory Hub</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
