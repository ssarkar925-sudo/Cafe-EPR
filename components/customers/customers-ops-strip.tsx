"use client";

import Link from "next/link";
import { inr } from "@/lib/format";

export default function CustomersOpsStrip({ customers }: { customers: { balance: number|string; is_active: boolean }[] }) {
  const active = customers.filter(c => c.is_active);
  const receivable = active.reduce((s,c)=>s+Math.max(0,Number(c.balance||0)),0);
  const credit = active.filter(c=>Number(c.balance||0)>0).length;
  return <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customers</div><div className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{active.length}</div></div>
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Receivables</div><div className="mt-1 text-lg font-bold text-amber-600">{inr(receivable)}</div></div>
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">With dues</div><div className="mt-1 text-lg font-bold text-rose-600">{credit}</div></div>
    <Link href="/pos" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-blue-500/20 dark:bg-blue-500/10"><div className="text-[10px] font-bold uppercase tracking-wider text-blue-500">Counter</div><div className="mt-1 text-sm font-bold text-blue-700 dark:text-blue-300">New customer sale →</div></Link>
  </div>;
}
