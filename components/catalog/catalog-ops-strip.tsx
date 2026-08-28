"use client";

import Link from "next/link";
import { inr } from "@/lib/format";

export default function CatalogOpsStrip({ products, services }: { products: any[]; services: any[] }) {
  const activeProducts = products.filter(p => p.is_active !== false);
  const low = activeProducts.filter(p => Number(p.stock_qty ?? p.stock_quantity ?? 0) <= Number(p.reorder_level ?? 0));
  const stockValue = activeProducts.reduce((s,p)=>s+(Number(p.stock_qty ?? p.stock_quantity ?? 0)*Number(p.cost_price ?? 0)),0);
  const gst = activeProducts.filter(p => p.gst_rate != null).length + services.filter(s => s.gst_rate != null).length;
  return <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Products</div><div className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{activeProducts.length}</div></div>
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Services</div><div className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{services.filter(s=>s.is_active !== false).length}</div></div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10"><div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Replenishment</div><div className="mt-1 text-lg font-bold text-amber-700 dark:text-amber-300">{low.length}</div></div>
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stock at cost</div><div className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{inr(stockValue)}</div></div>
    <Link href="/pos" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-blue-500/20 dark:bg-blue-500/10"><div className="text-[10px] font-bold uppercase tracking-wider text-blue-500">Counter</div><div className="mt-1 text-sm font-bold text-blue-700 dark:text-blue-300">Open POS →</div></Link>
  </div>;
}
