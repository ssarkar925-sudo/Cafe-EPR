"use client";

import Link from "next/link";
import { inr } from "@/lib/format";
import { Users, Clock, AlertTriangle, ShoppingBag } from "lucide-react";

export default function CustomersOpsStrip({
  customers,
}: {
  customers: { balance: number | string; is_active: boolean }[];
}) {
  const active = customers.filter((c) => c.is_active);
  const receivable = active.reduce((s, c) => s + Math.max(0, Number(c.balance || 0)), 0);
  const credit = active.filter((c) => Number(c.balance || 0) > 0).length;

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Directory</span>
          <Users className="h-4 w-4 text-slate-400" />
        </div>
        <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{active.length} Customers</div>
      </div>

      <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Khata / Receivables</span>
          <Clock className="h-4 w-4 text-amber-500" />
        </div>
        <div className="mt-1 text-lg font-bold text-amber-600 dark:text-amber-400">{inr(receivable)}</div>
      </div>

      <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Accounts with Dues</span>
          <AlertTriangle className="h-4 w-4 text-rose-500" />
        </div>
        <div className="mt-1 text-lg font-bold text-rose-600 dark:text-rose-400">{credit} Accounts</div>
      </div>

      <Link
        href="/pos"
        className="col-span-2 sm:col-span-2 lg:col-span-1 flex flex-col justify-between rounded-xl border border-blue-200/90 bg-blue-50/70 p-3.5 shadow-xs transition hover:bg-blue-100/70 hover:shadow-sm dark:border-blue-900/40 dark:bg-blue-950/30 dark:hover:bg-blue-900/40"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Point of Sale</span>
          <ShoppingBag className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="mt-1 text-sm font-bold text-blue-700 dark:text-blue-300">New Customer Sale →</div>
      </Link>
    </div>
  );
}
