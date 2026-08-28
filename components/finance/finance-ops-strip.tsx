"use client";

import Link from "next/link";
import { inr } from "@/lib/format";

export default function FinanceOpsStrip({ entries, settlements }: { entries: any[]; settlements: any[] }) {
  const inTotal = entries.filter(e=>e.direction === "in").reduce((s,e)=>s+Number(e.amount||0),0);
  const outTotal = entries.filter(e=>e.direction === "out").reduce((s,e)=>s+Number(e.amount||0),0);
  const net = inTotal - outTotal;
  const settlementValue = settlements.reduce((s,e)=>s+Number(e.amount||0),0);
  return <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Money in</div><div className="mt-1 text-lg font-bold text-emerald-600">{inr(inTotal)}</div></div>
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Money out</div><div className="mt-1 text-lg font-bold text-rose-600">{inr(outTotal)}</div></div>
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Net movement</div><div className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{inr(net)}</div></div>
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Settlements</div><div className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{inr(settlementValue)}</div></div>
    <Link href="/finance/settlements" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-blue-500/20 dark:bg-blue-500/10"><div className="text-[10px] font-bold uppercase tracking-wider text-blue-500">Control</div><div className="mt-1 text-sm font-bold text-blue-700 dark:text-blue-300">Reconcile →</div></Link>
  </div>;
}
