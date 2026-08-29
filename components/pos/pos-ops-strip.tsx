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
    <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
      {/* Left Metric Pill */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/20">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <path d="M3 6h18" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-slate-900 dark:text-white">
              {count} Sales Today
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">
            {inr(amount)} Collected
          </p>
        </div>
      </div>

      {/* Center Keyboard Shortcuts Prompt */}
      <div className="hidden items-center gap-2 lg:flex">
        <span className="text-[11px] font-bold text-slate-400">Shortcuts:</span>
        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600 dark:bg-white/10 dark:text-slate-300">
          <kbd className="font-mono">F2</kbd> Mode Switch
        </span>
        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600 dark:bg-white/10 dark:text-slate-300">
          <kbd className="font-mono">F4</kbd> Search Catalog
        </span>
        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600 dark:bg-white/10 dark:text-slate-300">
          <kbd className="font-mono">F9</kbd> Exact Cash
        </span>
      </div>

      {/* Right Action Tray */}
      <div className="flex items-center gap-2">
        <Link
          href="/invoices"
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
        >
          <span>Today's Receipts</span>
          <span>→</span>
        </Link>
        <Link
          href="/customers"
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
        >
          <span>Customers</span>
        </Link>
      </div>
    </div>
  );
}
