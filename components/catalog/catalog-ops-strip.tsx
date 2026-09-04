"use client";

import Link from "next/link";
import { inr } from "@/lib/format";
import {
  Package,
  Layers,
  AlertTriangle,
  Boxes,
  ArrowRight,
  TrendingUp,
  Tag,
} from "lucide-react";

export default function CatalogOpsStrip({
  products,
  services,
}: {
  products: any[];
  services: any[];
}) {
  const activeProducts = products.filter((p) => p.is_active !== false);
  const low = activeProducts.filter(
    (p) =>
      Number(p.stock_qty ?? p.stock_quantity ?? 0) <=
      Number(p.reorder_level ?? 0)
  );
  const stockValue = activeProducts.reduce(
    (s, p) =>
      s +
      Number(p.stock_qty ?? p.stock_quantity ?? 0) *
        Number(p.cost_price ?? 0),
    0
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {/* Products Master Count */}
      <Link
        href="/catalog/products"
        className="card-glow-indigo group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/90"
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Products Master
          </span>
          <div className="icon-box-3d flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
            <Package className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2 font-mono text-2xl font-black text-slate-900 dark:text-white">
          {activeProducts.length}
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
          <span>Manage Master</span>
          <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
        </div>
      </Link>

      {/* Services Master Count */}
      <Link
        href="/catalog/services"
        className="card-glow-purple group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/90"
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-purple-500 to-fuchsia-600" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
            Services Master
          </span>
          <div className="icon-box-3d flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white shadow-sm">
            <Layers className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2 font-mono text-2xl font-black text-purple-700 dark:text-purple-300">
          {services.filter((s) => s.is_active !== false).length}
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-purple-600 dark:text-purple-400">
          <span>Manage Rates</span>
          <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
        </div>
      </Link>

      {/* Replenishment Watch */}
      <Link
        href="/inventory?status=low_stock"
        className="card-glow-amber group relative overflow-hidden rounded-2xl border border-amber-200/80 bg-white/95 p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-amber-900/40 dark:bg-slate-900/90"
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Replenish Alert
          </span>
          <div className="icon-box-3d flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm">
            <AlertTriangle className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2 font-mono text-2xl font-black text-amber-700 dark:text-amber-300">
          {low.length} <span className="font-sans text-xs font-medium text-slate-400">items</span>
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400">
          <span>View Low Stock</span>
          <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
        </div>
      </Link>

      {/* Stock at Cost */}
      <Link
        href="/inventory"
        className="card-glow-emerald group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/90"
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Stock at Cost
          </span>
          <div className="icon-box-3d flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
            <Boxes className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2 font-mono text-2xl font-black text-emerald-600 dark:text-emerald-400">
          {inr(stockValue)}
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
          <span>Live Valuation</span>
          <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
        </div>
      </Link>

      {/* Quick POS Terminal */}
      <Link
        href="/pos"
        className="card-glow-cyan group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/90"
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-600" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            POS Billing
          </span>
          <div className="icon-box-3d flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-sm">
            <Tag className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2 font-mono text-2xl font-black text-slate-900 dark:text-white">
          Active
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-cyan-600 dark:text-cyan-400">
          <span>Open Terminal</span>
          <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
        </div>
      </Link>
    </div>
  );
}
