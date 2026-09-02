"use client";

import Link from "next/link";
import { useMemo } from "react";
import { inr } from "@/lib/format";
import type { ReturnRow } from "./returns-client";
import { RotateCcw, FileText, Package, BarChart3, ArrowRight, DollarSign, AlertCircle, Calendar } from "lucide-react";

export default function ReturnsHub({ returns }: { returns: ReturnRow[] }) {
  const stats = useMemo(() => {
    const value = returns.reduce((s, r) => s + (Number(r.subtotal) || 0), 0);
    const refunded = returns.reduce((s, r) => s + (Number(r.refund) || 0), 0);
    const credit = Math.max(0, value - refunded);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const month = returns.filter((r) => r.return_date?.slice(0, 7) === thisMonth).length;
    return { value, refunded, credit, month };
  }, [returns]);

  const recent = returns.slice(0, 6);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-rose-600 dark:text-rose-400">After-sales control</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Returns Command Center</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Monitor customer returns, refunds and credit adjustments without losing stock or accounting visibility.</p>
        </div>
        <Link href="/returns" className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700">
          Open Returns Workspace <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Return value", value: inr(stats.value), sub: "All recorded returns", icon: DollarSign, color: "text-rose-500" },
          { label: "Refunded", value: inr(stats.refunded), sub: "Money returned", icon: RotateCcw, color: "text-violet-500" },
          { label: "Credit / adjusted", value: inr(stats.credit), sub: "Customer credit impact", icon: AlertCircle, color: "text-amber-500" },
          { label: "This month", value: String(stats.month), sub: "Return documents", icon: Calendar, color: "text-blue-500" },
        ].map((item) => {
          const IconComp = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{item.label}</span>
                <IconComp className={`h-4 w-4 ${item.color}`} />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{item.value}</div>
              <div className="mt-1 text-xs text-slate-400">{item.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_.6fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-950 dark:text-white">Recent return activity</h2>
              <p className="text-xs text-slate-400">Latest customer return documents</p>
            </div>
            <Link href="/returns" className="text-xs font-semibold text-blue-600 hover:text-blue-700">View all</Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-rose-600">{r.return_number}</span>
                    <span className="text-xs text-slate-400">{r.return_date}</span>
                  </div>
                  <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{r.invoices?.customers?.name || "Walk-in customer"}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-slate-900 dark:text-white">{inr(r.subtotal)}</div>
                  <div className="text-[11px] text-slate-400">{Number(r.refund) > 0 ? `Refund ${inr(r.refund)}` : "Credit"}</div>
                </div>
              </div>
            ))}
            {!recent.length && <div className="py-10 text-center text-sm text-slate-400">No returns recorded yet.</div>}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-xs dark:border-white/10">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Return operations</div>
          <h2 className="mt-2 text-xl font-bold">Quick actions</h2>
          <div className="mt-5 grid gap-2">
            <Link href="/returns" className="flex items-center gap-2.5 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/15">
              <RotateCcw className="h-4 w-4 text-rose-400" />
              Process customer return
            </Link>
            <Link href="/invoices" className="flex items-center gap-2.5 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/15">
              <FileText className="h-4 w-4 text-blue-400" />
              Find original invoice
            </Link>
            <Link href="/inventory/movements" className="flex items-center gap-2.5 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/15">
              <Package className="h-4 w-4 text-emerald-400" />
              Inspect stock movements
            </Link>
            <Link href="/reports" className="flex items-center gap-2.5 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/15">
              <BarChart3 className="h-4 w-4 text-amber-400" />
              Review return reports
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
