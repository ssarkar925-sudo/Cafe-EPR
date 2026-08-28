"use client";

import Link from "next/link";
import { inr } from "@/lib/format";

export default function PosOpsStrip({ count, amount }: { count: number; amount: number }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Today</div><div className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{count} sales</div></div>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Revenue</div><div className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{inr(amount)}</div></div>
      <Link href="/invoices" className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-blue-200 hover:shadow-md dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Review</div><div className="mt-1 text-sm font-bold text-blue-600">Invoices →</div></Link>
      <Link href="/customers" className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-blue-200 hover:shadow-md dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer</div><div className="mt-1 text-sm font-bold text-blue-600">Directory →</div></Link>
    </div>
  );
}
