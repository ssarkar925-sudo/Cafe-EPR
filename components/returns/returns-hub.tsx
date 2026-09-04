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
          <div className="text-xs font-black uppercase tracking-[0.18em] text-rose-600 dark:text-rose-400">After-sales control</div>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">Returns Command Center</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Monitor customer returns, refunds and credit adjustments without losing stock or accounting visibility.</p>
        </div>
        <Link
          href="/returns"
          className="btn-3d-tactile-primary inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 px-4 py-2.5 text-sm font-black text-white shadow-md shadow-rose-600/20 hover:brightness-110 active:scale-95"
        >
          <span>Open Returns Workspace</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Return value",
            value: inr(stats.value),
            sub: "All recorded returns",
            icon: DollarSign,
            glow: "card-glow-rose border-rose-500/20 bg-gradient-to-br from-rose-500/[0.06] via-white to-white dark:border-rose-500/30 dark:from-rose-950/25 dark:via-slate-900 dark:to-slate-900",
            iconBg: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400",
            textColor: "text-rose-700 dark:text-rose-400",
            labelColor: "text-rose-600 dark:text-rose-400",
          },
          {
            label: "Refunded",
            value: inr(stats.refunded),
            sub: "Money returned",
            icon: RotateCcw,
            glow: "card-glow-violet border-purple-500/20 bg-gradient-to-br from-purple-500/[0.06] via-white to-white dark:border-purple-500/30 dark:from-purple-950/25 dark:via-slate-900 dark:to-slate-900",
            iconBg: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400",
            textColor: "text-purple-700 dark:text-purple-400",
            labelColor: "text-purple-600 dark:text-purple-400",
          },
          {
            label: "Credit / adjusted",
            value: inr(stats.credit),
            sub: "Customer credit impact",
            icon: AlertCircle,
            glow: "card-glow-amber border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] via-white to-white dark:border-amber-500/30 dark:from-amber-950/25 dark:via-slate-900 dark:to-slate-900",
            iconBg: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
            textColor: "text-amber-700 dark:text-amber-400",
            labelColor: "text-amber-600 dark:text-amber-400",
          },
          {
            label: "This month",
            value: String(stats.month),
            sub: "Return documents",
            icon: Calendar,
            glow: "card-glow-indigo border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.06] via-white to-white dark:border-indigo-500/30 dark:from-indigo-950/25 dark:via-slate-900 dark:to-slate-900",
            iconBg: "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
            textColor: "text-slate-900 dark:text-white",
            labelColor: "text-indigo-600 dark:text-indigo-400",
          },
        ].map((item) => {
          const IconComp = item.icon;
          return (
            <div key={item.label} className={`relative overflow-hidden rounded-2xl border p-5 shadow-xs transition-all hover:shadow-md ${item.glow}`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${item.labelColor}`}>{item.label}</span>
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${item.iconBg}`}>
                  <IconComp className="h-4 w-4" />
                </div>
              </div>
              <div className={`mt-2 font-mono text-2xl font-black tabular-nums tracking-tight ${item.textColor}`}>{item.value}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">{item.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_.6fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
            <div>
              <h2 className="text-sm font-bold text-slate-950 dark:text-white">Recent return activity</h2>
              <p className="text-xs text-slate-400">Latest customer return documents</p>
            </div>
            <Link href="/returns" className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400">View all →</Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 py-3 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition rounded-lg px-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400">{r.return_number}</span>
                    <span className="text-xs text-slate-400">{r.return_date}</span>
                  </div>
                  <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{r.invoices?.customers?.name || "Walk-in customer"}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-slate-900 dark:text-white">{inr(r.subtotal)}</div>
                  <div className="text-[11px] text-slate-400">{Number(r.refund) > 0 ? `Refund ${inr(r.refund)}` : "Credit"}</div>
                </div>
              </div>
            ))}
            {!recent.length && <div className="py-10 text-center text-sm text-slate-400">No returns recorded yet.</div>}
          </div>
        </section>

        <section className="relative overflow-hidden rounded-2xl border border-rose-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950/40 p-5 text-white shadow-md">
          <div className="text-xs font-black uppercase tracking-wider text-rose-400">Return operations</div>
          <h2 className="mt-1 text-lg font-black">Quick Actions</h2>
          <div className="mt-4 grid gap-2">
            <Link href="/returns" className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-xs font-bold backdrop-blur-xs transition hover:bg-white/20 active:scale-95">
              <RotateCcw className="h-4 w-4 text-rose-400" />
              <span>Process customer return</span>
            </Link>
            <Link href="/invoices" className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-xs font-bold backdrop-blur-xs transition hover:bg-white/20 active:scale-95">
              <FileText className="h-4 w-4 text-blue-400" />
              <span>Find original invoice</span>
            </Link>
            <Link href="/inventory/movements" className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-xs font-bold backdrop-blur-xs transition hover:bg-white/20 active:scale-95">
              <Package className="h-4 w-4 text-emerald-400" />
              <span>Inspect stock movements</span>
            </Link>
            <Link href="/reports" className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-xs font-bold backdrop-blur-xs transition hover:bg-white/20 active:scale-95">
              <BarChart3 className="h-4 w-4 text-amber-400" />
              <span>Review return reports</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
