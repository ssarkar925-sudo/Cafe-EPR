"use client";

import Link from "next/link";
import { inr } from "@/lib/format";
import { FileText, ArrowDownLeft, Clock, ShoppingBag } from "lucide-react";

export default function InvoicesOpsStrip({
  invoices,
}: {
  invoices: { total: number | string; paid: number | string; due: number | string; status: string }[];
}) {
  const active = invoices.filter((x) => x.status !== "cancelled");
  const total = active.reduce((s, x) => s + Number(x.total || 0), 0);
  const paid = active.reduce((s, x) => s + Number(x.paid || 0), 0);
  const due = active.reduce((s, x) => s + Number(x.due || 0), 0);

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Active</span>
          <FileText className="h-4 w-4 text-slate-400" />
        </div>
        <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{active.length} Invoices</div>
      </div>

      <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Billed</span>
          <span className="text-[10px] font-bold text-slate-400">Gross</span>
        </div>
        <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{inr(total)}</div>
      </div>

      <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Collected</span>
          <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
        </div>
        <div className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">{inr(paid)}</div>
      </div>

      <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Outstanding Due</span>
          <Clock className="h-4 w-4 text-amber-500" />
        </div>
        <div className="mt-1 text-lg font-bold text-amber-600 dark:text-amber-400">{inr(due)}</div>
      </div>

      <Link
        href="/pos"
        className="col-span-2 sm:col-span-2 lg:col-span-1 flex flex-col justify-between rounded-xl border border-blue-200/90 bg-blue-50/70 p-3.5 shadow-xs transition hover:bg-blue-100/70 hover:shadow-sm dark:border-blue-900/40 dark:bg-blue-950/30 dark:hover:bg-blue-900/40"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Counter POS</span>
          <ShoppingBag className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="mt-1 text-sm font-bold text-blue-700 dark:text-blue-300">Launch POS (F2) →</div>
      </Link>
    </div>
  );
}
