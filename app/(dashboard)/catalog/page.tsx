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
      <div className="card-glow-indigo rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-xs backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90 transition-all">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="icon-box-3d flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-500/20">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Café ERP / Inventory &amp; Catalog
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  {p.length + s.length} Master Items
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                Catalog Masters Hub
              </h1>
              <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400 max-w-2xl">
                Configure what your business sells: physical products, billable services, categories, brands, and measurement units.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/inventory"
              className="btn-3d-tactile-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all"
            >
              <Boxes className="h-3.5 w-3.5 text-indigo-500" />
              <span>Operational Inventory →</span>
            </Link>
            <Link
              href="/catalog/products"
              className="btn-3d-tactile-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Master Product</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics Ops Strip */}
      <CatalogOpsStrip products={p} services={s} />

      {/* Primary Catalog Entities Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Products Master */}
        <Link
          href="/catalog/products"
          className="card-glow-indigo group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/90"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
          <div className="flex items-start justify-between">
            <div className="icon-box-3d flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
              <Package className="h-6 w-6" />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-0.5 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
              {p.filter((x) => x.is_active !== false).length} Active Products
            </span>
          </div>
          <div>
            <h2 className="mt-4 text-xl font-black tracking-tight text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              Products Master →
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Saleable physical stock items, SKU barcodes, cost price, selling price, and automatic reorder thresholds.
            </p>
          </div>
        </Link>

        {/* Services Master */}
        <Link
          href="/catalog/services"
          className="card-glow-purple group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/90"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-purple-500 to-fuchsia-600" />
          <div className="flex items-start justify-between">
            <div className="icon-box-3d flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white shadow-sm">
              <Layers className="h-6 w-6" />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/20 bg-purple-500/10 px-2.5 py-0.5 font-mono text-xs font-bold text-purple-600 dark:text-purple-400">
              <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
              {s.filter((x) => x.is_active !== false).length} Active Services
            </span>
          </div>
          <div>
            <h2 className="mt-4 text-xl font-black tracking-tight text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
              Services Master →
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Billable services, printing, scanning, typing, internet counter hours, laminated copies, and custom digital job rates.
            </p>
          </div>
        </Link>
      </div>

      {/* Supporting Master Data Entities */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Categories */}
        <Link
          href="/catalog/categories"
          className="card-glow-amber group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900/90"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
          <div className="flex items-center justify-between">
            <div className="icon-box-3d flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm">
              <FolderTree className="h-5 w-5" />
            </div>
            <span className="font-mono text-xs font-bold text-slate-400">{c.length} Groups</span>
          </div>
          <h3 className="mt-3 text-sm font-black text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
            Categories Master →
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Structure your catalog into logical departments and POS quick filter groups.
          </p>
        </Link>

        {/* Brands */}
        <Link
          href="/catalog/brands"
          className="card-glow-teal group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900/90"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-500 to-emerald-600" />
          <div className="flex items-center justify-between">
            <div className="icon-box-3d flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm">
              <Bookmark className="h-5 w-5" />
            </div>
            <span className="font-mono text-xs font-bold text-slate-400">{b.length} Brands</span>
          </div>
          <h3 className="mt-3 text-sm font-black text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
            Brands Master →
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Organize branded accessories, electronics, cables, and stationery by manufacturer.
          </p>
        </Link>

        {/* Units of Measure */}
        <Link
          href="/catalog/units"
          className="card-glow-indigo group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900/90"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 to-blue-600" />
          <div className="flex items-center justify-between">
            <div className="icon-box-3d flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-sm">
              <Ruler className="h-5 w-5" />
            </div>
            <span className="font-mono text-xs font-bold text-slate-400">{u.length} Units</span>
          </div>
          <h3 className="mt-3 text-sm font-black text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            Units of Measure →
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Define measurement units (pc, pkt, kg, box, hrs, page, sheet) for accurate billing.
          </p>
        </Link>
      </div>

      {/* Contextual Link to Inventory */}
      <div className="card-glow-indigo flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-xs dark:border-white/10 dark:bg-slate-900/90">
        <div className="flex items-center gap-3.5">
          <div className="icon-box-3d flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-sm">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-900 dark:text-white">
              Looking for physical stock levels and valuation?
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              The Product Master defines selling prices and codes. Visit the Inventory Hub for stock quantities, valuation, and movements.
            </p>
          </div>
        </div>
        <Link
          href="/inventory"
          className="btn-3d-tactile-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-xs shrink-0"
        >
          <span>Open Inventory Hub</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
