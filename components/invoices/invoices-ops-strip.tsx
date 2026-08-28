"use client";

import Link from "next/link";
import { inr } from "@/lib/format";

export default function InvoicesOpsStrip({ invoices }: { invoices: { total: number|string; paid: number|string; due: number|string; status: string }[] }) {
  const active = invoices.filter(x => x.status !== "cancelled");
  const total = active.reduce((s,x)=>s+Number(x.total||0),0);
  const paid = active.reduce((s,x)=>s+Number(x.paid||0),0);
  const due = active.reduce((s,x)=>s+Number(x.due||0),0);
  return <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoices</div><div className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{active.length}</div></div>
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Billed</div><div className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{inr(total)}</div></div>
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Collected</div><div className="mt-1 text-lg font-bold text-emerald-600">{inr(paid)}</div></div>
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Outstanding</div><div className="mt-1 text-lg font-bold text-amber-600">{inr(due)}</div></div>
    <Link href="/pos" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-blue-500/20 dark:bg-blue-500/10"><div className="text-[10px] font-bold uppercase tracking-wider text-blue-500">Counter</div><div className="mt-1 text-sm font-bold text-blue-700 dark:text-blue-300">New sale →</div></Link>
  </div>;
}
