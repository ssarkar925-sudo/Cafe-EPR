"use client";

import Link from "next/link";
import { inr } from "@/lib/format";

export default function PosOpsStrip({
  count = 0,
  amount = 0,
  mode = "invoice",
  onToggleMode,
}: {
  count: number;
  amount: number;
  mode?: "invoice" | "quick";
  onToggleMode?: () => void;
}) {
  return (
    <div className="pos-ops-strip mb-3 flex min-h-12 flex-col gap-2 rounded-xl border border-slate-200/90 bg-white px-3 py-2 shadow-xs dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/20">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <path d="M3 6h18" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[11px] font-extrabold text-slate-900 dark:text-white">
              {count} Sales Today
            </span>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <p className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">
            {inr(amount)} Collected
          </p>
        </div>
      </div>

      <div className="hidden items-center gap-1.5 xl:flex">
        <span className="text-[10px] font-bold text-slate-400">Shortcuts</span>
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-black text-slate-600 dark:bg-white/10 dark:text-slate-300"><kbd className="font-mono">F2</kbd> Mode</span>
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-black text-slate-600 dark:bg-white/10 dark:text-slate-300"><kbd className="font-mono">F4</kbd> Search</span>
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-black text-slate-600 dark:bg-white/10 dark:text-slate-300"><kbd className="font-mono">F9</kbd> Exact</span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Link
          href="/invoices"
          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
        >
          Receipts →
        </Link>
        <Link
          href="/customers"
          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
        >
          Customers
        </Link>
      </div>
    </div>
  );
}
