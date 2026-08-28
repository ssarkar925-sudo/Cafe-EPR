"use client";

import Link from "next/link";
import { useMemo } from "react";
import { inr } from "@/lib/format";
import type { ReturnRow } from "./returns-client";

export default function ReturnsHub({ returns }: { returns: ReturnRow[] }) {
  const stats = useMemo(() => {
    const value = returns.reduce((s, r) => s + (Number(r.subtotal) || 0), 0);
    const refunded = returns.reduce((s, r) => s + (Number(r.refund) || 0), 0);
    const credit = Math.max(0, value - refunded);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const month = returns.filter(r => r.return_date?.slice(0, 7) === thisMonth).length;
    return { value, refunded, credit, month };
  }, [returns]);

  const recent = returns.slice(0, 6);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-rose-600">After-sales control</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Returns Command Center</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Monitor customer returns, refunds and credit adjustments without losing stock or accounting visibility.</p>
        </div>
        <Link href="/returns" className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700">Open Returns Workspace →</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Return value", inr(stats.value), "All recorded returns"],
          ["Refunded", inr(stats.refunded), "Money returned"],
          ["Credit / adjusted", inr(stats.credit), "Customer credit impact"],
          ["This month", String(stats.month), "Return documents"],
        ].map(([label, value, sub], i) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{value}</div>
            <div className="mt-1 text-xs text-slate-400">{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_.6fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-slate-950 dark:text-white">Recent return activity</h2><p className="text-xs text-slate-400">Latest customer return documents</p></div><Link href="/returns" className="text-xs font-semibold text-blue-600">View all</Link></div>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {recent.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0"><div className="flex items-center gap-2"><span className="font-mono text-xs font-bold text-rose-600">{r.return_number}</span><span className="text-xs text-slate-400">{r.return_date}</span></div><div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{r.invoices?.customers?.name || "Walk-in customer"}</div></div>
                <div className="text-right"><div className="font-semibold text-slate-900 dark:text-white">{inr(r.subtotal)}</div><div className="text-[11px] text-slate-400">{Number(r.refund) > 0 ? `Refund ${inr(r.refund)}` : "Credit"}</div></div>
              </div>
            ))}
            {!recent.length && <div className="py-10 text-center text-sm text-slate-400">No returns recorded yet.</div>}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm dark:border-white/10">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Return operations</div>
          <h2 className="mt-2 text-xl font-bold">Quick actions</h2>
          <div className="mt-5 grid gap-2">
            <Link href="/returns" className="rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/15">↶ Process customer return</Link>
            <Link href="/invoices" className="rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/15">▣ Find original invoice</Link>
            <Link href="/inventory/movements" className="rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/15">◇ Inspect stock movements</Link>
            <Link href="/reports" className="rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/15">▥ Review return reports</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
