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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {/* Products Master Count */}
      <Link
        href="/catalog/products"
        className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-blue-300 dark:border-white/10 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Products Master
          </span>
          <Package className="h-4 w-4 text-blue-500" />
        </div>
        <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
          {activeProducts.length}
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
          <span>Manage Master</span>
          <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
        </div>
      </Link>

      {/* Services Master Count */}
      <Link
        href="/catalog/services"
        className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-violet-300 dark:border-white/10 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Services Master
          </span>
          <Layers className="h-4 w-4 text-violet-500" />
        </div>
        <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
          {services.filter((s) => s.is_active !== false).length}
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-violet-600 dark:text-violet-400">
          <span>Manage Rates</span>
          <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
        </div>
      </Link>

      {/* Replenishment Watch */}
      <Link
        href="/inventory?status=low_stock"
        className="group rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs transition hover:border-amber-300 dark:border-amber-900/40 dark:bg-amber-950/20"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Replenish Alert
          </span>
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        </div>
        <div className="mt-2 text-2xl font-black text-amber-800 dark:text-amber-300">
          {low.length} <span className="text-xs font-normal">items</span>
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
          <span>View in Inventory</span>
          <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
        </div>
      </Link>

      {/* Stock at Cost */}
      <Link
        href="/inventory"
        className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-emerald-300 dark:border-white/10 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Stock at Cost
          </span>
          <Boxes className="h-4 w-4 text-emerald-500" />
        </div>
        <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
          {inr(stockValue)}
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          <span>Live Valuation</span>
          <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
        </div>
      </Link>

      {/* Quick POS Terminal */}
      <Link
        href="/pos"
        className="group rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-xs transition hover:border-indigo-300 dark:border-indigo-900/40 dark:bg-indigo-950/20"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            POS Billing
          </span>
          <Tag className="h-4 w-4 text-indigo-500" />
        </div>
        <div className="mt-2 text-2xl font-black text-indigo-900 dark:text-indigo-200">
          Counter
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
          <span>Open Register</span>
          <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
        </div>
      </Link>
    </div>
  );
}
